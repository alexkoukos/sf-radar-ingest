/**
 * Client/serverless mirror of the SQL `clean_text()` from migration 003:
 *
 *   strip control chars (incl. CR / LF / TAB) -> collapse whitespace runs to
 *   one space -> trim -> empty becomes null.
 *
 * The DB runs `clean_text()` on every user string it stores, but the group
 * spec (Part 7) requires sanitizing at *every* sink, not only the DB: the
 * serverless layer echoes names back in JSON and, later, into ICS
 * SUMMARY / X-WR-CALNAME and Content-Disposition. A lone CR/LF in a display
 * name is the specific hazard - it forges VEVENTs in a subscriber's calendar
 * and can split HTTP headers - so it is removed here too, before the value
 * is ever trusted.
 */

// [[:cntrl:]] in Postgres === C0 controls U+0000-U+001F plus DEL U+007F.
// Built from code points so this source file contains no literal control byte;
// matching control chars here is the whole point (they're what we strip).
// oxlint-disable-next-line no-control-regex
const CONTROL_CHARS = new RegExp("[\\u0000-\\u001F\\u007F]+", "g");

export function cleanText(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const collapsed = raw.replace(CONTROL_CHARS, " ").replace(/\s+/g, " ").trim();
  return collapsed.length > 0 ? collapsed : null;
}
