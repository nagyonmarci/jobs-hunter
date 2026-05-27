const experienceMap = {
  internship: "1",
  entry: "2",
  associate: "3",
  "mid-senior": "4"
};

export function buildLinkedInSearchUrl({ keyword, location, workplace }, config) {
  const excludeKeywords = config.filters.excludeKeywords || [];
  const searchQuery = [keyword, ...excludeKeywords.map((term) => `NOT ${term}`)].join(" ");
  const params = new URLSearchParams({
    keywords: searchQuery,
    location,
    f_WT: workplace === "remote" ? "2" : "3",
    f_TPR: config.filters.postedWithin,
    f_E: (config.filters.experienceLevels || [])
      .map((level) => experienceMap[level])
      .filter(Boolean)
      .join(",")
  });

  return `${config.source.linkedin.baseUrl}?${params.toString()}`;
}
