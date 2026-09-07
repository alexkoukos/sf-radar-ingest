/**
 * English possessive of a display name, done on the final *grapheme* (not
 * the final byte or code unit), so Greek and other non-ASCII names are
 * handled correctly.
 *
 *   possessive("Maria")   -> "Maria’s"
 *   possessive("Dimitri") -> "Dimitri’s"
 *   possessive("Alekos")  -> "Alekos’"      (ends in s)
 *   possessive("Alexis")  -> "Alexis’"
 *   possessive("Marx")    -> "Marx’"        (ends in x)
 *   possessive("Γιάννης") -> "Γιάννης’"     (ends in final sigma ς)
 *   possessive("Ross’")   -> "Ross’"        (already possessive-styled)
 *   possessive("  ")      -> ""             (caller supplies a fallback)
 *
 * Rendered text uses the typographic apostrophe U+2019, never the ASCII
 * quote. Callers still escape the result for whatever context it lands in
 * (React escapes text nodes automatically; ICS/`<title>` have their own
 * escaping).
 */

export const APOSTROPHE = "’"; // ’
const ASCII_APOSTROPHE = "'";

// Final letters that take a bare apostrophe rather than ’s. The set is the
// letters the brief calls out - s, x, z - plus their sibilant kin: German
// eszett (ß, "ss") and Greek sigma in both lowercase forms (σ, and final
// sigma ς). The comparison is done lowercased, so uppercase Σ (which
// lowercases to σ in JS) is covered too.
const BARE_APOSTROPHE_ENDINGS = new Set(["s", "x", "z", "ß", "σ", "ς"]);

function lastGrapheme(value: string): string {
  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
    let last = "";
    for (const { segment } of segmenter.segment(value)) last = segment;
    return last;
  }
  // Fallback: code-point aware (still better than value.slice(-1)).
  const codePoints = Array.from(value);
  return codePoints.length > 0 ? codePoints[codePoints.length - 1] : "";
}

/** Possessive form of `name`, or "" when `name` is empty/whitespace. */
export function possessive(name: string): string {
  const trimmed = name.trim();
  if (trimmed === "") return "";

  const last = lastGrapheme(trimmed);

  // Already ends with an apostrophe: leave the possessive as-is, only
  // normalising an ASCII quote to the typographic one.
  if (last === APOSTROPHE) return trimmed;
  if (last === ASCII_APOSTROPHE) return trimmed.slice(0, -1) + APOSTROPHE;

  if (BARE_APOSTROPHE_ENDINGS.has(last.toLowerCase())) {
    return trimmed + APOSTROPHE;
  }
  return trimmed + APOSTROPHE + "s";
}

/**
 * "<name>’s <noun>" with the possessive applied, or just "<noun>" (capitalised)
 * when there's no usable name - e.g. possessivePhrase("Alekos", "SF Radar plan")
 * -> "Alekos’ SF Radar plan"; possessivePhrase("", "SF Radar plan") -> "SF Radar plan".
 */
export function possessivePhrase(name: string, noun: string): string {
  const owner = possessive(name);
  return owner ? `${owner} ${noun}` : noun;
}
