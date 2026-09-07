/**
 * A display name is a free-text label attached to a plan - NOT an account,
 * NOT identity. It shows up on the shared-plan page and in the calendar
 * feed's name ("Alekos’ SF Radar plan").
 *
 * normalizeDisplayName enforces: trim, strip C0/C1 control characters and
 * invisible format/bidi characters (which enable homograph and text-hiding
 * tricks), collapse internal whitespace runs, cap at 40 code points (an
 * emoji counts once), reject anything that ends up empty. It does NOT strip
 * "<" or HTML - the rendering side escapes everywhere the name lands (React
 * escapes text nodes, the ICS writer escapes TEXT values, document.title is
 * a string assignment not innerHTML), so "<script>alert(1)</script>" is
 * stored verbatim and shown as that literal text.
 */

export const DISPLAY_NAME_MAX = 40;

const CONTROL_AND_INVISIBLE = new RegExp(
  "[" +
    "\\u0000-\\u0008\\u000E-\\u001F" + // C0 controls except tab/LF/VT/FF/CR (kept, collapsed to a space below)
    "\\u007F-\\u009F" + // DEL + C1 controls
    "\\u00AD" + // soft hyphen
    "\\u200B-\\u200F" + // zero-width space/joiner/non-joiner, LRM, RLM
    "\\u202A-\\u202E" + // bidi embedding / override
    "\\u2060" + // word joiner
    "\\u2066-\\u2069" + // bidi isolates
    "\\uFEFF" + // BOM / zero-width no-break space
    "]",
  "g",
);

export function normalizeDisplayName(input: string | null | undefined): string | null {
  if (input == null) return null;
  const cleaned = input.replace(CONTROL_AND_INVISIBLE, "").replace(/\s+/g, " ").trim();
  if (cleaned === "") return null;
  const codePoints = Array.from(cleaned);
  const capped =
    codePoints.length > DISPLAY_NAME_MAX
      ? codePoints.slice(0, DISPLAY_NAME_MAX).join("").trim()
      : cleaned;
  return capped === "" ? null : capped;
}

/** True when the raw input survives normalization (for inline form validation). */
export function isValidDisplayName(input: string): boolean {
  return normalizeDisplayName(input) !== null;
}
