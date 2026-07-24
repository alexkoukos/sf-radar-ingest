/**
 * The user's personal plan: which real events they've marked "Attending",
 * plus any self-authored "logged" nights. No accounts, no Supabase writes -
 * this never leaves the browser. Persisted to localStorage (not wiped on
 * tab close) so a demo reload doesn't lose your picks; bump PLAN_KEY if the
 * shape ever changes incompatibly.
 */
export interface LoggedNight {
  id: string;
  nightIndex: number;
  title: string;
  note: string;
  createdAt: string;
}

export interface LocalPlan {
  attending: Record<string, boolean>;
  logged: LoggedNight[];
}

const PLAN_KEY = "sfradar:v1:localPlan";

function emptyPlan(): LocalPlan {
  return { attending: {}, logged: [] };
}

export function loadLocalPlan(): LocalPlan {
  try {
    const raw = localStorage.getItem(PLAN_KEY);
    if (!raw) return emptyPlan();
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return emptyPlan();
    const attending =
      parsed.attending && typeof parsed.attending === "object" ? parsed.attending : {};
    const logged = Array.isArray(parsed.logged) ? parsed.logged : [];
    return { attending, logged };
  } catch {
    return emptyPlan();
  }
}

export function saveLocalPlan(plan: LocalPlan): void {
  try {
    localStorage.setItem(PLAN_KEY, JSON.stringify(plan));
  } catch {
    // Storage can be full or unavailable (private browsing) - this is
    // ambient local state, never something the app depends on.
  }
}

export function createLoggedId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `logged-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
