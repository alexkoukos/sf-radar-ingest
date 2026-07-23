import type { DashboardEvent } from "../types";

/**
 * Display-only port of the Java scorer formulas (KeywordScorer,
 * VenueScorer, AccessibilityScorer in sf-radar-ingest). The persisted
 * `score` column - already sorted by SQL - is the only thing that ever
 * determines ranking; this never re-sorts anything. It exists purely to
 * decompose that already-computed number into the three components that
 * produced it, so the UI can show why an event ranked where it did.
 *
 * There is no HostScorer in the Java pipeline (cut for time, host
 * defaults to equal weight), so there is no host bar here either -
 * showing one would imply data that doesn't exist.
 *
 * Keep these weights in exact sync with sf-radar-ingest's score package
 * if that ever changes; this file has no way to detect drift on its own.
 */

const KEYWORD_WEIGHTS: Record<string, number> = {
  INVESTOR_MEETUP: 1.0,
  DEMO_DAY: 0.9,
  FOUNDER_SOCIAL: 0.85,
  HACKATHON: 0.7,
  GENERAL_NETWORKING: 0.6,
  OTHER: 0.4,
};

function keywordComponent(category: string): number {
  return KEYWORD_WEIGHTS[category] ?? 0.4;
}

function venueComponent(event: DashboardEvent): number {
  if (event.is_online) return 0.0;
  if (event.city?.trim().toLowerCase() === "san francisco") return 1.0;
  if (event.city?.trim()) return 0.5;
  return 0.3;
}

const RSVP_WEIGHTS: Record<string, number> = {
  OPEN: 1.0,
  WAITLIST: 0.4,
  APPLICATION: 0.3,
  MEMBERS_ONLY: 0.1,
  INVITE_ONLY: 0.0,
  UNKNOWN: 0.5,
};

function accessibilityComponent(event: DashboardEvent): number {
  const free = event.is_free === null ? 0.5 : event.is_free ? 1.0 : 0.0;
  const rsvp = RSVP_WEIGHTS[event.rsvp_type] ?? 0.5;
  return (free + rsvp) / 2;
}

export interface ScoreBreakdown {
  keyword: number;
  venue: number;
  accessibility: number;
}

export function scoreBreakdown(event: DashboardEvent): ScoreBreakdown {
  return {
    keyword: keywordComponent(event.category),
    venue: venueComponent(event),
    accessibility: accessibilityComponent(event),
  };
}

/** Same is_free && OPEN signal AccessibilityScorer maxes out on - the strictest, most literal reading of "free & open." */
export function isFreeAndOpen(event: DashboardEvent): boolean {
  return event.is_free === true && event.rsvp_type === "OPEN";
}

/**
 * Broader than isFreeAndOpen: an event you can walk into without knowing
 * anyone, regardless of price. Open RSVP is the newcomer-relevant signal -
 * you don't need an existing connection to get in - price is secondary.
 */
export function isNewcomerFriendly(event: DashboardEvent): boolean {
  return event.rsvp_type === "OPEN";
}
