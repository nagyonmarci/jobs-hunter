export function isExpiredListingContent(source: string, html: string): boolean {
  const normalized = html.toLowerCase();
  if (source === "justjoinit") return normalized.includes("offer expired");
  if (source === "nofluffjobs") {
    return normalized.includes("offer expired") || normalized.includes("oferta wygasła");
  }
  return false;
}
