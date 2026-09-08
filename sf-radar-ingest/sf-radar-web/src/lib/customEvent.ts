import { supabase } from "./supabaseClient";

/**
 * Client wrappers for the custom-event RPCs (migrations 003/004). Both are
 * anon-executable but authorised ONLY by plans.edit_key matching the owner
 * plan — never by a member id — so the client just needs its own
 * {planSlug, editKey} from localStorage.
 *
 * Visibility is enforced server-side in group_view / group_feed_by_token; the
 * form here only picks the value. `busy` is the default for meetings.
 */

export type CustomEventKind = "generic" | "meeting";
export type CustomEventVisibility = "shared" | "busy" | "private";
export type MeetingType = "coffee" | "one_on_one" | "call" | "lunch" | "dinner" | "other";

export const MEETING_TYPES: MeetingType[] = [
  "coffee",
  "one_on_one",
  "call",
  "lunch",
  "dinner",
  "other",
];

/** Separate from the 2h DEFAULT_DURATION_MS used for Luma events (per spec). */
export const DEFAULT_MEETING_DURATION_MIN = 45;

export interface CustomEventDraft {
  /** Present => update that row; absent => insert. */
  eventId?: string | null;
  kind: CustomEventKind;
  visibility: CustomEventVisibility;
  title: string;
  /** ISO instant (already converted from SF wall-clock by the form). */
  startsAt: string;
  endsAt: string | null;
  location: string;
  note: string;
  withName: string;
  withCompany: string;
  meetingType: MeetingType | null;
}

function orNull(s: string): string | null {
  const t = s.trim();
  return t.length ? t : null;
}

/** Returns the row's event_id. Throws the PostgREST error on failure. */
export async function saveCustomEvent(
  planSlug: string,
  editKey: string,
  d: CustomEventDraft,
): Promise<string> {
  const isMeeting = d.kind === "meeting";
  const { data, error } = await supabase.rpc("upsert_custom_event", {
    p_event_id: d.eventId ?? null,
    p_plan_slug: planSlug,
    p_edit_key: editKey,
    p_kind: d.kind,
    p_visibility: d.visibility,
    p_title: orNull(d.title),
    p_starts_at: d.startsAt,
    p_ends_at: d.endsAt,
    p_location: orNull(d.location),
    p_note: orNull(d.note),
    p_with_name: isMeeting ? orNull(d.withName) : null,
    p_with_company: isMeeting ? orNull(d.withCompany) : null,
    p_meeting_type: isMeeting ? d.meetingType : null,
  });
  if (error) throw error;
  return data as string;
}

export async function deleteCustomEvent(
  planSlug: string,
  editKey: string,
  eventId: string,
): Promise<void> {
  const { error } = await supabase.rpc("delete_custom_event", {
    p_event_id: eventId,
    p_plan_slug: planSlug,
    p_edit_key: editKey,
  });
  if (error) throw error;
}
