import type { DashboardEvent } from "../types";

export const ptTimeFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Los_Angeles",
  weekday: "short",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

export function formatPrice(event: DashboardEvent): string {
  if (event.is_free === true) return "Free";
  if (event.is_free === false) {
    return event.price_cents != null ? `$${(event.price_cents / 100).toFixed(0)}` : "Paid";
  }
  return "Price unknown";
}

export function rsvpLabel(rsvpType: string): string {
  switch (rsvpType) {
    case "OPEN":
      return "Open RSVP";
    case "WAITLIST":
      return "Waitlist";
    case "APPLICATION":
      return "Application";
    case "INVITE_ONLY":
      return "Invite only";
    case "MEMBERS_ONLY":
      return "Members only";
    default:
      return "RSVP unknown";
  }
}

export function isGated(event: DashboardEvent): boolean {
  return event.rsvp_type === "INVITE_ONLY" || event.rsvp_type === "MEMBERS_ONLY";
}

/** Short venue label for the card meta line - falls back gracefully, never fabricates a name. */
export function venueLabel(event: DashboardEvent): string {
  if (event.is_online) return "Online";
  return event.sublocality || event.city || "Venue TBA";
}

/** Fuller location line (sublocality, city, region) for the detail modal. */
export function locationLine(event: DashboardEvent): string | null {
  if (event.is_online) return "Online";
  const parts = [event.sublocality, event.city, event.region].filter(
    (part): part is string => Boolean(part?.trim()),
  );
  return parts.length > 0 ? parts.join(", ") : null;
}
