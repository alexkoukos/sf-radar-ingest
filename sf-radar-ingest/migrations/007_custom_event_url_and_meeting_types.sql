-- 007_custom_event_url_and_meeting_types.sql — run after 003/004/005. One transaction.
--
-- Status: RUN 2026-09-08, verified (exactly one upsert_custom_event, 15 args,
-- ending in p_with_member_id uuid, p_url text).
--
-- Two additive changes to custom_events, both driven by the group
-- custom-event form:
--   ① `url` — an optional link on the event, the way Luma events carry one
--   ② four more `meeting_type` values: breakfast, drinks, walk, on_site
--
-- Touches ONLY migration-managed objects (custom_events, upsert_custom_event,
-- group_view). schema.sql is not involved. `006` is reserved by
-- migrations/README.md for the legacy-locked CHECK cleanup; this is
-- independent of it and the apply order doesn't matter.
--
-- OUT OF SCOPE (flagged): the combined ICS feed (group_feed_by_token +
-- api/_lib/ics.ts) is NOT changed here. A custom event's URL shows in the web
-- group calendar but not yet as a URL: line in the subscribe feed —
-- group_feed_by_token's RETURNS TABLE would need a column added (a DROP +
-- recreate) plus the TS ICS builder + its ical.js tests. Deferred.
-- ─────────────────────────────────────────────────────────────────────────
BEGIN;

-- ── ① custom_events.url ──────────────────────────────────────────────────
ALTER TABLE custom_events ADD COLUMN IF NOT EXISTS url TEXT;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'custom_events_url_len') THEN
    ALTER TABLE custom_events ADD CONSTRAINT custom_events_url_len
      CHECK (url IS NULL OR char_length(url) <= 500);
  END IF;
END $$;

-- ── ② widen the meeting_type CHECK ──────────────────────────────────────
-- The 003 inline CHECK is auto-named custom_events_meeting_type_check, but
-- look it up defensively so a differently-named constraint is still replaced
-- (the table-level kind/meeting CHECK also mentions meeting_type — exclude it
-- by requiring the definition to NOT mention `kind`).
DO $$
DECLARE v_name TEXT;
BEGIN
  SELECT conname INTO v_name
    FROM pg_constraint
   WHERE conrelid = 'custom_events'::regclass
     AND contype = 'c'
     AND pg_get_constraintdef(oid) ILIKE '%meeting_type%'
     AND pg_get_constraintdef(oid) NOT ILIKE '%kind%';
  IF v_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE custom_events DROP CONSTRAINT %I', v_name);
  END IF;
END $$;

ALTER TABLE custom_events ADD CONSTRAINT custom_events_meeting_type_check
  CHECK (meeting_type IN
    ('coffee','one_on_one','call','lunch','dinner',
     'breakfast','drinks','walk','on_site','other'));

-- ── upsert_custom_event: + p_url, widened meeting_type list ─────────────
-- Signature change (append p_url) => DROP the 14-arg form + recreate as
-- 15-arg + re-GRANT. PostgREST calls by name, so existing clients that don't
-- send p_url keep working (DEFAULT NULL). url is valid on BOTH kinds (it's the
-- Luma-parity link), so it is NOT added to the generic-events guard.
DROP FUNCTION IF EXISTS upsert_custom_event(
  UUID,TEXT,TEXT,TEXT,TEXT,TEXT,TIMESTAMPTZ,TIMESTAMPTZ,TEXT,TEXT,TEXT,TEXT,TEXT,UUID);

CREATE FUNCTION upsert_custom_event(
    p_event_id UUID, p_plan_slug TEXT, p_edit_key TEXT,
    p_kind TEXT, p_visibility TEXT, p_title TEXT,
    p_starts_at TIMESTAMPTZ, p_ends_at TIMESTAMPTZ, p_location TEXT, p_note TEXT,
    p_with_name TEXT, p_with_company TEXT, p_meeting_type TEXT,
    p_with_member_id UUID DEFAULT NULL,
    p_url TEXT DEFAULT NULL
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_group TEXT; v_id UUID; v_url TEXT;
BEGIN
    SELECT gm.group_slug INTO v_group
      FROM plans pl JOIN group_members gm ON gm.plan_slug = pl.slug
     WHERE pl.slug = p_plan_slug AND pl.edit_key = p_edit_key;
    IF v_group IS NULL THEN RAISE EXCEPTION 'not authorized'; END IF;

    IF p_kind NOT IN ('generic','meeting') THEN RAISE EXCEPTION 'bad kind'; END IF;
    IF p_visibility NOT IN ('shared','busy','private') THEN RAISE EXCEPTION 'bad visibility'; END IF;
    IF p_starts_at IS NULL THEN RAISE EXCEPTION 'starts_at required'; END IF;
    IF p_kind = 'generic' AND (p_with_name IS NOT NULL OR p_with_company IS NOT NULL
        OR p_meeting_type IS NOT NULL OR p_with_member_id IS NOT NULL)
        THEN RAISE EXCEPTION 'generic events take no meeting fields'; END IF;
    IF p_meeting_type IS NOT NULL AND p_meeting_type NOT IN
        ('coffee','one_on_one','call','lunch','dinner',
         'breakfast','drinks','walk','on_site','other')
        THEN RAISE EXCEPTION 'bad meeting_type'; END IF;
    IF p_with_member_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM group_members WHERE member_id = p_with_member_id AND group_slug = v_group)
        THEN RAISE EXCEPTION 'with_member_id not in this group'; END IF;

    v_url := clean_text(p_url);   -- strips CR/LF + control chars (ICS/inject hazard)
    IF v_url IS NOT NULL THEN
        IF char_length(v_url) > 500 THEN RAISE EXCEPTION 'url too long'; END IF;
        IF v_url !~* '^https?://.' THEN RAISE EXCEPTION 'url must start with http:// or https://'; END IF;
    END IF;

    IF NOT rl_hit('custom_event:'||p_plan_slug, 120, 3600) THEN
        RAISE EXCEPTION 'rate limit exceeded' USING ERRCODE='insufficient_resources'; END IF;

    IF p_event_id IS NULL THEN
        IF (SELECT count(*) FROM custom_events WHERE plan_slug = p_plan_slug) >= 200
            THEN RAISE EXCEPTION 'too many custom events'; END IF;
        INSERT INTO custom_events (group_slug, plan_slug, kind, visibility, title, starts_at, ends_at,
            location, note, with_name, with_company, meeting_type, with_member_id, url)
        VALUES (v_group, p_plan_slug, p_kind, p_visibility, clean_text(p_title), p_starts_at, p_ends_at,
            clean_text(p_location), clean_text(p_note), clean_text(p_with_name),
            clean_text(p_with_company), p_meeting_type, p_with_member_id, v_url)
        RETURNING event_id INTO v_id;
    ELSE
        UPDATE custom_events SET
            kind=p_kind, visibility=p_visibility, title=clean_text(p_title), starts_at=p_starts_at,
            ends_at=p_ends_at, location=clean_text(p_location), note=clean_text(p_note),
            with_name=clean_text(p_with_name), with_company=clean_text(p_with_company),
            meeting_type=p_meeting_type, with_member_id=p_with_member_id, url=v_url, updated_at=now()
        WHERE event_id = p_event_id AND plan_slug = p_plan_slug
        RETURNING event_id INTO v_id;
        IF v_id IS NULL THEN RAISE EXCEPTION 'not found'; END IF;
    END IF;
    RETURN v_id;
END; $$;

REVOKE EXECUTE ON FUNCTION upsert_custom_event(
  UUID,TEXT,TEXT,TEXT,TEXT,TEXT,TIMESTAMPTZ,TIMESTAMPTZ,TEXT,TEXT,TEXT,TEXT,TEXT,UUID,TEXT)
  FROM PUBLIC, authenticated;
GRANT  EXECUTE ON FUNCTION upsert_custom_event(
  UUID,TEXT,TEXT,TEXT,TEXT,TEXT,TIMESTAMPTZ,TIMESTAMPTZ,TEXT,TEXT,TEXT,TEXT,TEXT,UUID,TEXT)
  TO anon;

-- ── group_view: expose url in the 'shared' branch ONLY ─────────────────
-- 'busy' stays redacted to {event_id, starts_at, ends_at}. CREATE OR REPLACE
-- keeps the 004 §0 REVOKE (privileges aren't reset without DROP); re-REVOKE
-- anyway to be explicit.
CREATE OR REPLACE FUNCTION group_view(p_group_slug TEXT)
RETURNS JSONB
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT jsonb_build_object(
      'group', (SELECT jsonb_build_object('name', g.name, 'start_date', g.start_date, 'end_date', g.end_date)
                FROM groups g WHERE g.group_slug = p_group_slug),
      'members', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'display_name', m.display_name,
          'color',        m.color,
          'join_order',   m.join_order,
          'read_slug',    m.plan_slug,
          'tz_mode',      p.tz_mode,
          'attending',    COALESCE(p.attending, '[]'::jsonb),
          'custom_events', COALESCE((
            SELECT jsonb_agg(
              CASE ce.visibility
                WHEN 'shared' THEN jsonb_build_object(
                  'event_id', ce.event_id, 'kind', ce.kind, 'visibility', 'shared',
                  'title', ce.title, 'starts_at', ce.starts_at, 'ends_at', ce.ends_at,
                  'location', ce.location, 'note', ce.note,
                  'with_name', ce.with_name, 'with_company', ce.with_company,
                  'meeting_type', ce.meeting_type, 'url', ce.url)
                WHEN 'busy' THEN jsonb_build_object(
                  'event_id', ce.event_id, 'kind', 'busy', 'visibility', 'busy',
                  'starts_at', ce.starts_at, 'ends_at', ce.ends_at)
              END ORDER BY ce.starts_at)
            FROM custom_events ce
            WHERE ce.plan_slug = m.plan_slug AND ce.visibility <> 'private'
          ), '[]'::jsonb)
        ) ORDER BY m.join_order)
        FROM group_members m JOIN plans p ON p.slug = m.plan_slug
        WHERE m.group_slug = p_group_slug
      ), '[]'::jsonb)
    );
$$;
REVOKE EXECUTE ON FUNCTION group_view(TEXT) FROM PUBLIC, anon, authenticated;

COMMIT;
