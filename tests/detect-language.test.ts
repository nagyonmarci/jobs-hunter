import { describe, it, expect } from "vitest";
import { detectLanguage } from "../scripts/import-linkedin-jobs.js";

describe("detectLanguage", () => {
  it("returns unknown for an empty string", () => {
    expect(detectLanguage("")).toBe("unknown");
  });

  it("returns unknown for whitespace-only input", () => {
    expect(detectLanguage("   \n\t  ")).toBe("unknown");
  });

  it("returns unknown when fewer than two english keywords are present", () => {
    expect(detectLanguage("team")).toBe("unknown");
  });

  it("returns english when at least two english keywords are present", () => {
    expect(detectLanguage("We are looking for a team with cloud experience")).toBe("english");
  });

  it("returns hungarian when at least two hungarian keywords are present", () => {
    // á/é/í/ó/ú/ü all trigger the "other" branch below, so this fixture is
    // deliberately built only from the accent-free hungarian keywords.
    expect(detectLanguage("magyar csapat tapasztalat feladat hogy")).toBe("hungarian");
  });

  it("returns mixed when hungarian and english keywords both appear at least twice", () => {
    expect(
      detectLanguage("magyar csapat tapasztalat feladat team cloud infrastructure engineer")
    ).toBe("mixed");
  });

  it("returns other when a latin-diacritic character appears, even in mostly-english text", () => {
    expect(detectLanguage("We need someone with café experience and the right skills")).toBe(
      "other"
    );
  });

  it("returns other when the Portuguese role-title pattern matches", () => {
    expect(detectLanguage("Vaga para engenheiro pleno, trabalho remoto")).toBe("other");
  });

  it("returns other when at least two other-language keywords are present, ahead of english", () => {
    expect(detectLanguage("Wir haben offene stellen und suchen kenntnisse im Team")).toBe("other");
  });
});
