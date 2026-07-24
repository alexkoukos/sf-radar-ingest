/**
 * The user's chosen arrival date ("YYYY-MM-DD", America/Los_Angeles
 * calendar date) - re-anchors which 14 nights of the wider fetched window
 * are displayed. localStorage only, so it survives a refresh but never
 * touches Supabase.
 */
const START_DATE_KEY = "sfradar:v1:startDate";

export function loadStartDate(): string | null {
  try {
    return localStorage.getItem(START_DATE_KEY);
  } catch {
    return null;
  }
}

export function saveStartDate(dateStr: string): void {
  try {
    localStorage.setItem(START_DATE_KEY, dateStr);
  } catch {
    // Storage can be full or unavailable (private browsing) - falls back
    // to "today" every load, never something the app depends on.
  }
}
