// Repository language legends link each colored dot to a language search.
export default [
  'a[href*="/search?l="] > span[style*="background-color"]',
  // Fork repositories render the language list without language-search links.
  'span[class*="languageDot"]',
] as const;
