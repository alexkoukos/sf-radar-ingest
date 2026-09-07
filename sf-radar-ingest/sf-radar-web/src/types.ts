/** Mirrors the `events` table shape returned by the get_dashboard_events RPC. */
export interface DashboardEvent {
  api_id: string;
  name: string;
  url_slug: string | null;
  starts_at: string | null;
  ends_at: string | null;
  is_online: boolean;
  host_name: string | null;
  city: string | null;
  region: string | null;
  sublocality: string | null;
  country_code: string | null;
  latitude: number | null;
  longitude: number | null;
  is_free: boolean | null;
  price_cents: number | null;
  require_approval: boolean | null;
  waitlist_status: string | null;
  registration_availability: string | null;
  calendar_access_level: string | null;
  discovered_via: string | null;
  category: string;
  rsvp_type: string;
  score: number | null;
  first_seen_at: string;
  last_seen_at: string;
}

/**
 * The subset of event fields the card UI, venue/price formatting, and ICS
 * export actually read. A live DashboardEvent satisfies it, and so does a
 * frozen snapshot stored inside a shared plan - so both render through the
 * same components and helpers.
 */
export type EventLike = Pick<
  DashboardEvent,
  | "api_id"
  | "name"
  | "url_slug"
  | "starts_at"
  | "ends_at"
  | "is_online"
  | "host_name"
  | "city"
  | "region"
  | "sublocality"
  | "is_free"
  | "price_cents"
  | "rsvp_type"
  | "category"
  | "score"
>;
