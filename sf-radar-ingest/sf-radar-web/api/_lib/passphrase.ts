/**
 * Passphrase normalization — defined ONCE, imported by both "set" (group
 * create) and "verify" (group login) so the two can never drift apart and
 * lock someone out of their own group.
 *
 * Fixed order, per the group spec: trim → Unicode NFC → toLowerCase.
 * Length is 4–64, counted in Unicode code points (so an emoji is one char,
 * not two UTF-16 units), measured AFTER normalization.
 *
 * The plaintext passphrase never leaves this process: it is normalized here,
 * hashed with bcrypt, and discarded. It is never stored, logged, put in a
 * URL, or returned to the client.
 */

export const MIN_PASSPHRASE_CHARS = 4;
export const MAX_PASSPHRASE_CHARS = 64;

export function normalizePassphrase(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.trim().normalize("NFC").toLowerCase();
}

/** null when the normalized passphrase is a valid length, else a message. */
export function passphraseLengthError(normalized: string): string | null {
  const chars = [...normalized].length;
  if (chars < MIN_PASSPHRASE_CHARS) {
    return `Passphrase must be at least ${MIN_PASSPHRASE_CHARS} characters.`;
  }
  if (chars > MAX_PASSPHRASE_CHARS) {
    return `Passphrase must be at most ${MAX_PASSPHRASE_CHARS} characters.`;
  }
  return null;
}
