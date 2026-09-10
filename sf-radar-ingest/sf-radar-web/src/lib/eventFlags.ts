/**
 * Per-event local flags on the main ranked list, keyed by Luma api_id:
 *
 *  - seen:   the user has reviewed this card. Still listed, just dimmed, so
 *            genuinely new events stand out.
 *  - hidden: dismissed from the ranked list entirely (miscategorised / bad
 *            match). Never re-shown unless the user clears it.
 *
 * localStorage only. Never synced across devices, never sent to Supabase,
 * never routed through the group visibility system, and completely
 * independent of the Attending state in localPlan.ts - an event can be
 * attending and seen, hidden and never attended, any combination.
 *
 * Each entry stores the epoch-ms timestamp it was set. Entries older than
 * MAX_AGE_MS are pruned on load (and the pruned set written back) so this
 * key can never be what fills the ~5MB localStorage ceiling.
 */

export interface EventFlags {
  /** api_id -> epoch ms when marked seen */
  seen: Record<string, number>;
  /** api_id -> epoch ms when hidden */
  hidden: Record<string, number>;
}

const KEY = "sfradar:v1:eventFlags";
const MAX_AGE_MS = 180 * 24 * 60 * 60 * 1000; // 180 days

function empty(): EventFlags {
  return { seen: {}, hidden: {} };
}

function prune(map: unknown, now: number): { kept: Record<string, number>; dropped: number } {
  const kept: Record<string, number> = {};
  let dropped = 0;
  if (map && typeof map === "object") {
    for (const [id, ts] of Object.entries(map as Record<string, unknown>)) {
      if (typeof ts === "number" && Number.isFinite(ts) && now - ts < MAX_AGE_MS) kept[id] = ts;
      else dropped += 1;
    }
  }
  return { kept, dropped };
}

export function loadEventFlags(): EventFlags {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return empty();
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return empty();
    const now = Date.now();
    const seen = prune(parsed.seen, now);
    const hidden = prune(parsed.hidden, now);
    const flags: EventFlags = { seen: seen.kept, hidden: hidden.kept };
    if (seen.dropped || hidden.dropped) saveEventFlags(flags);
    return flags;
  } catch {
    return empty();
  }
}

export function saveEventFlags(flags: EventFlags): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(flags));
  } catch {
    // full / unavailable (private browsing) - ambient local state, nothing
    // depends on it persisting.
  }
}
