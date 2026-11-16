// Pure domain logic — no Firebase imports, unit-testable.
export const CATEGORIES = ["heating", "water_leak", "mold", "pest", "unknown"] as const;
export type Category = (typeof CATEGORIES)[number];

export type RecordStatus = "Draft" | "Processing" | "Needs Review" | "Confirmed" | "Included in Letter";

export interface RepairRecord {
  id: string;
  rawText: string; // original user memo, always preserved
  aiText: string | null; // AI raw suggestion (version 1 of 2 preserved)
  confirmedText: string | null; // user-confirmed text (version 2 of 2)
  category: Category;
  occurredOn: string; // ISO date from UI/code parsing (primary), "" if unknown
  location: string; // from UI input (primary)
  suggestedOccurredOn: string | null; // Nano suggestion only, never auto-applied
  suggestedLocation: string | null; // Nano suggestion only
  status: RecordStatus;
  inferenceSource: string | null; // actual response value, e.g. "ON_DEVICE"
  latencyMs: number | null;
  createdAt: number;
}

export interface LetterSentence { text: string; sourceRecordIds: string[] }
export interface Letter {
  id: string;
  sentences: LetterSentence[];
  inferenceSource: string | null;
  latencyMs: number | null;
  model: string;
  status: "Valid" | "Invalidated";
  createdAt: number;
}

const TRANSITIONS: Record<RecordStatus, RecordStatus[]> = {
  Draft: ["Processing", "Needs Review"],
  Processing: ["Needs Review"], // success and failure both land in Needs Review; raw text preserved
  "Needs Review": ["Confirmed", "Draft"],
  Confirmed: ["Included in Letter", "Needs Review"], // edit of a confirmed record invalidates its confirmation
  "Included in Letter": ["Needs Review"],
};

export function canTransition(from: RecordStatus, to: RecordStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

/** Editing raw/confirmed text invalidates any prior AI confirmation (BUILD-PLAN v2.1). */
export function applyEdit(rec: RepairRecord, newText: string): RepairRecord {
  return { ...rec, confirmedText: newText, status: rec.status === "Draft" ? "Draft" : "Needs Review" };
}

/** App-code timeline sort (not cloud-generated). Unknown dates go last. */
export function sortTimeline(records: RepairRecord[]): RepairRecord[] {
  return [...records].sort((a, b) => {
    if (!a.occurredOn && !b.occurredOn) return a.createdAt - b.createdAt;
    if (!a.occurredOn) return 1;
    if (!b.occurredOn) return -1;
    return a.occurredOn.localeCompare(b.occurredOn) || a.createdAt - b.createdAt;
  });
}

export type LetterValidation =
  | { ok: true }
  | { ok: false; reason: string; badIds: string[] };

/** Every cited ID must exist AND be in a confirmed state. Any failure = whole letter fails. No auto-retry. */
export function validateLetter(sentences: LetterSentence[], records: RepairRecord[]): LetterValidation {
  if (!Array.isArray(sentences) || sentences.length === 0)
    return { ok: false, reason: "Letter has no sentences", badIds: [] };
  const byId = new Map(records.map((r) => [r.id, r]));
  const bad = new Set<string>();
  for (const s of sentences) {
    if (!s.text?.trim() || !Array.isArray(s.sourceRecordIds) || s.sourceRecordIds.length === 0)
      return { ok: false, reason: "Sentence without text or citations", badIds: [...bad] };
    for (const id of s.sourceRecordIds) {
      const rec = byId.get(id);
      if (!rec || (rec.status !== "Confirmed" && rec.status !== "Included in Letter")) bad.add(id);
    }
  }
  return bad.size ? { ok: false, reason: "Cited record missing or not Confirmed", badIds: [...bad] } : { ok: true };
}

/**
 * No-silent-fallback guard. Measured SDK behavior (firebase 13.3.0, @firebase/ai dist index.esm.js:1224-1231, 2562-2566):
 * if `LanguageModel` is absent the SDK creates no ChromeAdapter and callCloudOrDevice() calls the cloud
 * even for ONLY_ON_DEVICE. So the app must refuse BEFORE any generateContent() call.
 */
export function assertOnDeviceCapable(hasLanguageModel: boolean, availability: string | null): void {
  if (!hasLanguageModel)
    throw new Error("On-device model unavailable: Chrome Prompt API (LanguageModel) not present in this browser/profile. Request was NOT sent to the cloud (no silent fallback).");
  if (availability === "unavailable")
    throw new Error("On-device model unavailable: LanguageModel.availability() = 'unavailable' in this profile. Request was NOT sent to the cloud (no silent fallback).");
}

/** A letter must be invalidated when any record it cites is edited or deleted. */
export function letterNeedsInvalidation(letter: Letter, changedRecordId: string): boolean {
  return letter.status === "Valid" && letter.sentences.some((s) => s.sourceRecordIds.includes(changedRecordId));
}
