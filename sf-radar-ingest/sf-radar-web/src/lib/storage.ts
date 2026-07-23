import type { DashboardEvent } from "../types";

/**
 * Last-known-good cache so a failed refetch degrades to stale data plus a
 * banner instead of a blank page or a crash. Bump CACHE_KEY if the cached
 * shape ever changes incompatibly - stale localStorage from an older
 * version should be ignored, not parsed into a broken state.
 */
const CACHE_KEY = "sfradar:v1:events";

interface CachedPayload {
  events: DashboardEvent[];
  fetchedAt: string;
}

export function loadCachedEvents(): CachedPayload | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedPayload;
    if (!Array.isArray(parsed.events) || typeof parsed.fetchedAt !== "string") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveCachedEvents(events: DashboardEvent[]): void {
  try {
    const payload: CachedPayload = { events, fetchedAt: new Date().toISOString() };
    localStorage.setItem(CACHE_KEY, JSON.stringify(payload));
  } catch {
    // Storage can be full or unavailable (private browsing) - caching is a
    // nice-to-have degradation path, never something the app depends on.
  }
}
