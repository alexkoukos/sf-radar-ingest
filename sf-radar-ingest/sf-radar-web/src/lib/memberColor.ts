/**
 * Per-member colour helpers. The colour itself is assigned server-side
 * (join_group, Okabe–Ito CVD-safe palette with #4D4D4D for black) and comes
 * down on every GroupMember; the client only needs a readable ink colour to
 * put on top of it and a short initials label.
 */

/** Black or white text, whichever reads better on `hex`. */
export function readableInk(hex: string): string {
  const h = hex.replace("#", "");
  if (h.length < 6) return "#ffffff";
  const r = Number.parseInt(h.slice(0, 2), 16);
  const g = Number.parseInt(h.slice(2, 4), 16);
  const b = Number.parseInt(h.slice(4, 6), 16);
  // Perceptual-ish luminance on sRGB 0..1. The Okabe–Ito yellow (#F0E442)
  // and its lightness variants land above the 0.6 cut and get dark ink.
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.6 ? "#201e1d" : "#ffffff";
}

/** 1–2 uppercase letters for a member chip: first letters of the first two words. */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return [...words[0]][0]!.toUpperCase();
  return ([...words[0]][0]! + [...words[1]][0]!).toUpperCase();
}
