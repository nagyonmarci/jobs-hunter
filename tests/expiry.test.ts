import { describe, expect, it } from "vitest";
import { isExpiredListingContent } from "../scripts/expiry.js";

describe("expired listing content", () => {
  it("detects an expired Just Join IT offer regardless of casing", () => {
    expect(isExpiredListingContent("justjoinit", "<main>Offer expired</main>")).toBe(true);
    expect(isExpiredListingContent("justjoinit", "<main>OFFER EXPIRED</main>")).toBe(true);
  });

  it("detects English and Polish No Fluff Jobs expiration messages", () => {
    expect(isExpiredListingContent("nofluffjobs", "Offer expired")).toBe(true);
    expect(isExpiredListingContent("nofluffjobs", "Oferta wygasła")).toBe(true);
  });

  it("does not apply source-specific text to unrelated sources", () => {
    expect(isExpiredListingContent("weworkremotely", "Offer expired")).toBe(false);
    expect(isExpiredListingContent("justjoinit", "Apply now")).toBe(false);
  });
});
