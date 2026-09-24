// Reads settings no matter how their names were typed in Vercel ("Gemini_API_Key", "gemini api key"…),
// and cleans up values pasted with spaces or quotes around them.

const normalizeName = (name: string) => name.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_");

export function env(name: string): string | undefined {
  const wanted = normalizeName(name);
  for (const [key, value] of Object.entries(process.env)) {
    if (normalizeName(key) !== wanted || !value) continue;
    const clean = value.trim().replace(/^["']|["']$/g, "").trim();
    if (clean) return clean;
  }
  return undefined;
}
