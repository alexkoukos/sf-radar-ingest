import type { EventLike } from "../types";

export { locationLine } from "./locationLine";

export const ptTimeFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Los_Angeles",
  weekday: "short",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

const laZoneNameFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Los_Angeles",
  timeZoneName: "short",
});

/**
 * "PDT" or "PST" for a given instant - correct on both sides of the DST
 * boundary, so a November night in the window isn't mislabelled. Trip times
 * are always shown in America/Los_Angeles regardless of the viewer's zone;
 * this suffix makes that explicit.
 */
export function laZoneAbbrev(date: Date): string {
  const part = laZoneNameFormatter.formatToParts(date).find((p) => p.type === "timeZoneName");
  return part?.value ?? "PT";
}

/** "Wed, Sep 17, 5:00 PM PDT" - the canonical trip-time stamp. */
export function ptStamp(date: Date): string {
  return `${ptTimeFormatter.format(date)} ${laZoneAbbrev(date)}`;
}

export function formatPrice(event: EventLike): string {
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

export function isGated(event: EventLike): boolean {
  return event.rsvp_type === "INVITE_ONLY" || event.rsvp_type === "MEMBERS_ONLY";
}

/** Short venue label for the card meta line - falls back gracefully, never fabricates a name. */
export function venueLabel(event: EventLike): string {
  if (event.is_online) return "Online";
  return event.sublocality || event.city || "Venue TBA";
}
