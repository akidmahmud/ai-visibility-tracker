// Local (city) tracking: one free-text location per prompt ("Phoenix, AZ", "Phoenix, Arizona, US"), turned into
// what each engine accepts. Google engines take a canonical "City,State,Country" name; ChatGPT, Gemini,
// Perplexity and Copilot (via Cloro) only take a US state code.

const STATES: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California", CO: "Colorado", CT: "Connecticut", DE: "Delaware",
  DC: "District of Columbia", FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa",
  KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland", MA: "Massachusetts", MI: "Michigan", MN: "Minnesota",
  MS: "Mississippi", MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey",
  NM: "New Mexico", NY: "New York", NC: "North Carolina", ND: "North Dakota", OH: "Ohio", OK: "Oklahoma", OR: "Oregon",
  PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah",
  VT: "Vermont", VA: "Virginia", WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
};
const BY_NAME = new Map(Object.entries(STATES).map(([code, name]) => [name.toLowerCase(), code]));
const regionName = new Intl.DisplayNames(["en"], { type: "region" });
const COUNTRY_WORDS = new Set(["us", "usa", "united states", "united states of america"]);

/** "Phoenix, AZ" / "Phoenix, Arizona, US" → { city: "Phoenix", state: "AZ" } (US only; state null if none). */
export function parseLocation(location: string, country: string): { city: string | null; state: string | null } {
  const parts = location.split(",").map((p) => p.trim()).filter(Boolean);
  if (country.toUpperCase() === "US" && parts.length && COUNTRY_WORDS.has(parts.at(-1)!.toLowerCase())) parts.pop();
  if (country.toUpperCase() !== "US") return { city: parts[0] ?? null, state: null };
  const last = parts.at(-1) ?? "";
  const state = STATES[last.toUpperCase()] ? last.toUpperCase() : (BY_NAME.get(last.toLowerCase()) ?? null);
  const city = state ? (parts.length > 1 ? parts[0]! : null) : (parts[0] ?? null);
  return { city, state };
}

/** Google canonical location name for Google Search / AI Mode: "Phoenix,Arizona,United States". */
export function googleLocation(location: string, country: string): string {
  const { city, state } = parseLocation(location, country);
  const countryName = regionName.of(country.toUpperCase()) ?? country;
  if (country.toUpperCase() !== "US") return [city, countryName].filter(Boolean).join(",");
  return [city, state ? STATES[state] : null, countryName].filter(Boolean).join(",");
}

/** US state code for state-level targeting on ChatGPT/Gemini/Perplexity/Copilot, or null. */
export const usState = (location: string | undefined, country: string) => (location ? parseLocation(location, country).state : null);
