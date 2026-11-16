import { getAI, getGenerativeModel, GoogleAIBackend, InferenceMode, InferenceSource, Schema, type GenerativeModel } from "firebase/ai";
import { getApp, CLOUD_MODEL } from "./firebase";
import { CATEGORIES, validateLetter, assertOnDeviceCapable, type Category, type LetterSentence, type RepairRecord } from "./domain";

async function guardOnDevice() {
  const lm = (globalThis as { LanguageModel?: { availability(): Promise<string> } }).LanguageModel;
  let avail: string | null = null;
  if (lm) { try { avail = await lm.availability(); } catch { avail = null; } }
  assertOnDeviceCapable(!!lm, avail);
}

// Local step: ONLY_ON_DEVICE is forced. If the on-device model is unavailable the SDK throws.
// There is NO silent cloud fallback anywhere in this file for the local step.
const classifySchema = Schema.object({
  properties: {
    category: Schema.enumString({ enum: [...CATEGORIES] }),
    summary: Schema.string(),
    suggestedOccurredOn: Schema.string(), // suggestion only; "" if not stated. UI/code parsing stays primary.
    suggestedLocation: Schema.string(), // suggestion only; "" if not stated
  },
});

const letterSchema = Schema.object({
  properties: {
    sentences: Schema.array({
      items: Schema.object({
        properties: {
          text: Schema.string(),
          sourceRecordIds: Schema.array({ items: Schema.string() }),
        },
      }),
    }),
  },
});

function ai() {
  return getAI(getApp(), { backend: new GoogleAIBackend() });
}

let localModel: GenerativeModel | null = null;
export function getLocalModel(): GenerativeModel {
  localModel ??= getGenerativeModel(ai(), {
    mode: InferenceMode.ONLY_ON_DEVICE,
    onDeviceParams: {
      createOptions: {
        expectedInputs: [{ type: "text", languages: ["en"] }],
        expectedOutputs: [{ type: "text", languages: ["en"] }],
      },
      promptOptions: { responseConstraint: classifySchema },
    },
  });
  return localModel;
}

/** Must be called from a user gesture (button click). Downloads the Nano model on first use. */
export async function prepareDeviceModel(onProgress: (pct: number) => void): Promise<void> {
  await guardOnDevice();
  await getLocalModel().initializeDeviceModel((v) => onProgress(Math.round(v * 100)));
}

export interface ClassifyResult {
  category: Category; summary: string; suggestedOccurredOn: string | null; suggestedLocation: string | null;
  inferenceSource: string; latencyMs: number; rawAiText: string;
}

export async function classifyOnDevice(rawText: string): Promise<ClassifyResult> {
  await guardOnDevice(); // must precede generateContent: without it the SDK silently cloud-calls when LanguageModel is absent
  const t0 = performance.now();
  const result = await getLocalModel().generateContent(
    `Classify this NYC tenant repair memo into exactly one category (heating, water_leak, mold, pest, unknown). ` +
    `Use "unknown" if it does not clearly fit — never force a category. Write a one-sentence factual summary using ONLY facts in the memo. ` +
    `suggestedOccurredOn/suggestedLocation: copy only if explicitly stated, else "". Memo:\n"""${rawText}"""`,
  );
  const latencyMs = Math.round(performance.now() - t0);
  const source = result.response.inferenceSource;
  // Gate criterion: the actual response value, not the requested mode.
  if (source !== InferenceSource.ON_DEVICE)
    throw new Error(`On-device verification failed: inferenceSource=${String(source)} (expected ${InferenceSource.ON_DEVICE}). No fallback was used.`);
  const rawAiText = result.response.text();
  console.log("[classify] inferenceSource=", source, "latencyMs=", latencyMs, "raw=", rawAiText);
  let parsed: { category: Category; summary: string; suggestedOccurredOn: string; suggestedLocation: string };
  try {
    parsed = JSON.parse(rawAiText);
  } catch {
    throw new Error(`Structured-output parse failed (inferenceSource=${source}, latencyMs=${latencyMs}). Raw response: ${rawAiText.slice(0, 500)}`);
  }
  if (!CATEGORIES.includes(parsed.category)) throw new Error(`Invalid category from model: ${String(parsed.category)}`);
  return {
    category: parsed.category, summary: parsed.summary,
    suggestedOccurredOn: parsed.suggestedOccurredOn || null, suggestedLocation: parsed.suggestedLocation || null,
    inferenceSource: source, latencyMs, rawAiText,
  };
}

export interface LetterResult { sentences: LetterSentence[]; inferenceSource: string; latencyMs: number; model: string }

export async function generateLetterInCloud(records: RepairRecord[]): Promise<LetterResult> {
  // Cloud step: ONLY_IN_CLOUD with an explicitly named model (never the SDK default).
  const model = getGenerativeModel(ai(), {
    mode: InferenceMode.ONLY_IN_CLOUD,
    inCloudParams: { model: CLOUD_MODEL, generationConfig: { responseMimeType: "application/json", responseSchema: letterSchema } },
    onDeviceParams: { promptOptions: { responseConstraint: letterSchema } },
  });
  const input = records.map((r) => ({ id: r.id, date: r.occurredOn || "unknown", location: r.location || "unknown", category: r.category, text: r.confirmedText ?? r.rawText }));
  const t0 = performance.now();
  const result = await model.generateContent(
    `Write a polite, factual repair-request letter to a landlord from these tenant records. Rules: ` +
    `return JSON {sentences:[{text, sourceRecordIds}]}; every sentence must cite the record id(s) it is based on; ` +
    `use ONLY facts in the records — invent nothing; do NOT mention laws, statutes, legal codes, deadlines, or agencies. Records:\n${JSON.stringify(input)}`,
  );
  const latencyMs = Math.round(performance.now() - t0);
  const source = result.response.inferenceSource;
  if (source !== InferenceSource.IN_CLOUD)
    throw new Error(`Cloud verification failed: inferenceSource=${String(source)} (expected ${InferenceSource.IN_CLOUD}).`);
  const parsed = JSON.parse(result.response.text()) as { sentences: LetterSentence[] };
  const v = validateLetter(parsed.sentences, records);
  if (!v.ok) throw new Error(`Letter generation failed (ID contract): ${v.reason}. Bad IDs: ${v.badIds.join(", ") || "none"}. Letter discarded, no auto-retry.`);
  return { sentences: parsed.sentences, inferenceSource: source, latencyMs, model: CLOUD_MODEL };
}
