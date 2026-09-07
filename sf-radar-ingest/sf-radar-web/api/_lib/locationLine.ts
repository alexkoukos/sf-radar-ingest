import type { EventLike } from "../../src/types.js";

/**
 * Fuller location line (sublocality, city, region) for the detail modal and
 * the ICS LOCATION field.
 *
 * Lives in its own module - not eventFormat.ts - because the ICS writer and
 * the /api/feed serverless function import it, and eventFormat.ts builds
 * `Intl.DateTimeFormat` objects at module load. Keeping this pure function
 * dependency-free means the feed function's import graph never runs that
 * top-level locale/timezone code.
 */
export function locationLine(event: EventLike): string | null {
  if (event.is_online) return "Online";
  const parts = [event.sublocality, event.city, event.region].filter(
    (part): part is string => Boolean(part?.trim()),
  );
  return parts.length > 0 ? parts.join(", ") : null;
}
