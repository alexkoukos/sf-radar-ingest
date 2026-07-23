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
