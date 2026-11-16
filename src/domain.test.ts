import { describe, it, expect } from "vitest";
import { canTransition, applyEdit, sortTimeline, validateLetter, letterNeedsInvalidation, assertOnDeviceCapable, canConfirm, type RepairRecord, type Letter } from "./domain";

const rec = (over: Partial<RepairRecord> = {}): RepairRecord => ({
  id: "r1", rawText: "No heat since Monday", aiText: null, confirmedText: null,
  category: "heating", occurredOn: "2026-11-10", location: "Kitchen",
  suggestedOccurredOn: null, suggestedLocation: null, status: "Confirmed",
  inferenceSource: "ON_DEVICE", latencyMs: 1200, createdAt: 1, ...over,
});

describe("state machine", () => {
  it("allows Draft→Processing→Needs Review→Confirmed→Included in Letter", () => {
    expect(canTransition("Draft", "Processing")).toBe(true);
    expect(canTransition("Processing", "Needs Review")).toBe(true);
    expect(canTransition("Needs Review", "Confirmed")).toBe(true);
    expect(canTransition("Confirmed", "Included in Letter")).toBe(true);
  });
  it("forbids skipping confirmation", () => {
    expect(canTransition("Draft", "Confirmed")).toBe(false);
    expect(canTransition("Processing", "Confirmed")).toBe(false);
  });
  it("confirm is blocked while Processing or with empty text (Day-3 fresh-profile finding)", () => {
    expect(canConfirm("Processing", "some summary")).toBe(false);
    expect(canConfirm("Needs Review", "")).toBe(false);
    expect(canConfirm("Needs Review", "  ")).toBe(false);
    expect(canConfirm("Needs Review", "Checked summary")).toBe(true);
    expect(canConfirm("Confirmed", "Checked summary")).toBe(false);
  });
  it("editing invalidates confirmation and preserves raw text", () => {
    const edited = applyEdit(rec(), "Edited by user");
    expect(edited.status).toBe("Needs Review");
    expect(edited.rawText).toBe("No heat since Monday");
  });
});

describe("letter ID contract", () => {
  it("passes when all cited IDs exist and are Confirmed", () => {
    expect(validateLetter([{ text: "No heat.", sourceRecordIds: ["r1"] }], [rec()]).ok).toBe(true);
  });
  it("fails whole letter on a hallucinated ID (no partial letter)", () => {
    const v = validateLetter([{ text: "x", sourceRecordIds: ["r1", "ghost"] }], [rec()]);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.badIds).toContain("ghost");
  });
  it("fails when cited record is not Confirmed", () => {
    const v = validateLetter([{ text: "x", sourceRecordIds: ["r1"] }], [rec({ status: "Needs Review" })]);
    expect(v.ok).toBe(false);
  });
  it("fails on uncited sentence", () => {
    expect(validateLetter([{ text: "x", sourceRecordIds: [] }], [rec()]).ok).toBe(false);
  });
});

describe("no silent fallback guard (SDK adapter-absence behavior)", () => {
  it("blocks before any call when LanguageModel is absent — even though SDK would cloud-call", () => {
    expect(() => assertOnDeviceCapable(false, null)).toThrow(/NOT sent to the cloud/);
  });
  it("blocks when availability is unavailable", () => {
    expect(() => assertOnDeviceCapable(true, "unavailable")).toThrow(/NOT sent to the cloud/);
  });
  it("allows downloadable/available (success is still proven by inferenceSource afterwards)", () => {
    expect(() => assertOnDeviceCapable(true, "downloadable")).not.toThrow();
    expect(() => assertOnDeviceCapable(true, "available")).not.toThrow();
  });
});

describe("invalidation + timeline", () => {
  const letter: Letter = { id: "l1", sentences: [{ text: "t", sourceRecordIds: ["r1"] }], inferenceSource: "IN_CLOUD", latencyMs: 1, model: "gemini-3.8-flash", status: "Valid", createdAt: 1 };
  it("record edit/delete invalidates citing letter", () => {
    expect(letterNeedsInvalidation(letter, "r1")).toBe(true);
    expect(letterNeedsInvalidation(letter, "other")).toBe(false);
  });
  it("timeline sorted by occurredOn in app code, unknown last", () => {
    const sorted = sortTimeline([rec({ id: "b", occurredOn: "" }), rec({ id: "a", occurredOn: "2026-11-01" }), rec({ id: "c", occurredOn: "2026-11-05" })]);
    expect(sorted.map((r) => r.id)).toEqual(["a", "c", "b"]);
  });
});
