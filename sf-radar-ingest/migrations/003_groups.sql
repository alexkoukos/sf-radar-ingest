-- 003_groups.sql — run after 001. One transaction.
--
-- Status: committed to production. Pasted in the same message as 001; 001
-- rolled back but this transaction committed. Its plpgsql functions
-- (upsert_plan 7-arg, upsert_custom_event, delete_custom_event) were dead on
-- arrival because plans.edit_key did not exist yet — 004 reapplied 001's
-- substance and rebuilt these. group_view / group_feed_by_token / rl_hit were
-- left anon-executable by Supabase's default GRANT (REVOKE FROM PUBLIC does
-- not counter it); 004 §0 closes that.
-- ─────────────────────────────────────────────────────────────────────────
BEGIN;

-- ─────────────────────────────────────────────────────────────────────────
-- helpers
-- ─────────────────────────────────────────────────────────────────────────
CREATE FUNCTION clean_text(t TEXT) RETURNS TEXT
LANGUAGE sql IMMUTABLE AS $$
    -- strip control chars (incl. CR/LF/TAB), collapse ws, trim, empty -> NULL
    SELECT NULLIF(btrim(regexp_replace(regexp_replace(coalesce(t,''),
           '[[:cntrl:]]+', ' ', 'g'), '\s+', ' ', 'g')), '')
$$;

-- Atomic fixed-window rate limiter. Owned by postgres, NOT granted to anyone
-- (service_role bypasses grants; SECURITY DEFINER callers invoke it internally).
CREATE TABLE rate_limits (
    bucket       TEXT NOT NULL,
    window_start TIMESTAMPTZ NOT NULL,
    count        INT  NOT NULL DEFAULT 0,
    PRIMARY KEY (bucket, window_start)
);
ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;   -- zero policies; service-role only

CREATE FUNCTION rl_hit(p_bucket TEXT, p_limit INT, p_window_seconds INT)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_window TIMESTAMPTZ := to_timestamp(floor(extract(epoch FROM now()) / p_window_seconds) * p_window_seconds);
    v_count  INT;
BEGIN
    INSERT INTO rate_limits (bucket, window_start, count) VALUES (p_bucket, v_window, 1)
    ON CONFLICT (bucket, window_start) DO UPDATE SET count = rate_limits.count + 1
    RETURNING count INTO v_count;
    IF random() < 0.05 THEN
        DELETE FROM rate_limits WHERE window_start < now() - INTERVAL '1 day';
    END IF;
    RETURN v_count <= p_limit;
END;
$$;
REVOKE ALL ON FUNCTION rl_hit(TEXT,INT,INT) FROM PUBLIC;

-- ─────────────────────────────────────────────────────────────────────────
-- groups
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE groups (
    group_slug      TEXT PRIMARY KEY CHECK (group_slug ~ '^[a-f0-9]{32}$'),  -- 128-bit CSPRNG hex
    name            TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
    start_date      DATE NOT NULL,
    end_date        DATE NOT NULL CHECK (end_date >= start_date),
    passphrase_hash TEXT NOT NULL,          -- bcryptjs "$2a$..$" ; NEVER returned to any client-callable path
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE groups ENABLE ROW LEVEL SECURITY;   -- zero policies

-- ─────────────────────────────────────────────────────────────────────────
-- group_members  (a member's plan IS a plans row; edit_key on it = write credential)
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE group_members (
    member_id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),   -- internal; never an auth token, never trusted from client
    group_slug   TEXT NOT NULL REFERENCES groups(group_slug) ON DELETE CASCADE,
    plan_slug    TEXT NOT NULL REFERENCES plans(slug) ON DELETE CASCADE,
    display_name TEXT NOT NULL CHECK (char_length(display_name) BETWEEN 1 AND 40),
    color        TEXT NOT NULL CHECK (color ~ '^#[0-9A-Fa-f]{6}$'),
    join_order   INT  NOT NULL,
    feed_token   TEXT NOT NULL UNIQUE CHECK (feed_token ~ '^[A-Za-z0-9_-]{32}$'),  -- 24-byte CSPRNG b64url, ~192 bits
    feed_revoked BOOLEAN NOT NULL DEFAULT false,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (group_slug, plan_slug),
    UNIQUE (group_slug, join_order)
);
ALTER TABLE group_members ENABLE ROW LEVEL SECURITY;   -- zero policies
CREATE INDEX group_members_by_group ON group_members(group_slug);
CREATE INDEX group_members_by_plan  ON group_members(plan_slug);

-- ─────────────────────────────────────────────────────────────────────────
-- custom_events  (generic + meeting, one table, `kind` discriminator)
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE custom_events (
    event_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_slug     TEXT NOT NULL REFERENCES groups(group_slug) ON DELETE CASCADE,
    plan_slug      TEXT NOT NULL REFERENCES plans(slug) ON DELETE CASCADE,  -- owner
    kind           TEXT NOT NULL CHECK (kind IN ('generic','meeting')),
    visibility     TEXT NOT NULL CHECK (visibility IN ('shared','busy','private')),
    title          TEXT CHECK (title    IS NULL OR char_length(title)    <= 140),
    starts_at      TIMESTAMPTZ NOT NULL,                                    -- absolute instant; entered as SF local, converted before insert
    ends_at        TIMESTAMPTZ CHECK (ends_at IS NULL OR ends_at >= starts_at),
    location       TEXT CHECK (location IS NULL OR char_length(location) <= 200),
    note           TEXT CHECK (note     IS NULL OR char_length(note)     <= 500),
    with_name      TEXT CHECK (with_name    IS NULL OR char_length(with_name)    <= 80),
    with_member_id UUID REFERENCES group_members(member_id) ON DELETE SET NULL,
    with_company   TEXT CHECK (with_company IS NULL OR char_length(with_company) <= 80),
    meeting_type   TEXT CHECK (meeting_type IN ('coffee','one_on_one','call','lunch','dinner','other')),
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (kind = 'meeting'
           OR (with_name IS NULL AND with_member_id IS NULL AND with_company IS NULL AND meeting_type IS NULL))
);
ALTER TABLE custom_events ENABLE ROW LEVEL SECURITY;   -- zero policies
CREATE INDEX custom_events_by_group ON custom_events(group_slug);
CREATE INDEX custom_events_by_plan  ON custom_events(plan_slug);

-- ─────────────────────────────────────────────────────────────────────────
-- REDACTING read function — the server-side enforcement point for visibility.
-- 'busy'   -> only {event_id, starts_at, ends_at}; NO title/name/company/type/note/location
-- 'private'-> absent entirely
-- Never returns passphrase_hash / edit_key / feed_token.
-- Not granted to anon; service_role calls it after cookie validation.
-- ─────────────────────────────────────────────────────────────────────────
CREATE FUNCTION group_view(p_group_slug TEXT)
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
          'attending',    COALESCE(p.attending, '[]'::jsonb),          -- Luma snapshots (all "shared" by nature)
          'custom_events', COALESCE((
            SELECT jsonb_agg(
              CASE ce.visibility
                WHEN 'shared' THEN jsonb_build_object(
                  'event_id', ce.event_id, 'kind', ce.kind, 'visibility', 'shared',
                  'title', ce.title, 'starts_at', ce.starts_at, 'ends_at', ce.ends_at,
                  'location', ce.location, 'note', ce.note,
                  'with_name', ce.with_name, 'with_company', ce.with_company, 'meeting_type', ce.meeting_type)
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
REVOKE ALL ON FUNCTION group_view(TEXT) FROM PUBLIC;

-- ─────────────────────────────────────────────────────────────────────────
-- COMBINED FEED payload by feed_token (v1: combined only; per-member full feed later).
-- Same redaction: 'busy' -> SUMMARY "Busy", no detail; 'private' -> omitted.
-- ─────────────────────────────────────────────────────────────────────────
CREATE FUNCTION group_feed_by_token(p_feed_token TEXT)
RETURNS TABLE (group_name TEXT, member_name TEXT, join_order INT, is_busy BOOLEAN,
               source TEXT, source_id TEXT, title TEXT,
               starts_at TIMESTAMPTZ, ends_at TIMESTAMPTZ, location TEXT, note TEXT, url_slug TEXT)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_group TEXT;
BEGIN
    SELECT group_slug INTO v_group FROM group_members
    WHERE feed_token = p_feed_token AND feed_revoked = false;
    IF v_group IS NULL THEN RETURN; END IF;   -- unknown/revoked -> empty -> caller 404s

    RETURN QUERY
    SELECT g.name, m.display_name, m.join_order, false,
           'luma', (e.evt->>'api_id'), (e.evt->>'name'),
           (e.evt->>'starts_at')::timestamptz,
           NULLIF(e.evt->>'ends_at','')::timestamptz,
           NULL::text, NULL::text, (e.evt->>'url_slug')
    FROM group_members m
    JOIN groups g ON g.group_slug = m.group_slug
    JOIN plans  p ON p.slug = m.plan_slug
    CROSS JOIN LATERAL jsonb_array_elements(p.attending) AS e(evt)
    WHERE m.group_slug = v_group
    UNION ALL
    SELECT g.name, m.display_name, m.join_order,
           (ce.visibility = 'busy'),
           'custom', ce.event_id::text,
           CASE WHEN ce.visibility = 'busy' THEN 'Busy'
                ELSE COALESCE(ce.title,
                     CASE WHEN ce.kind='meeting' THEN 'Meeting' || COALESCE(' with ' || ce.with_name,'')
                          ELSE 'Event' END) END,
           ce.starts_at, ce.ends_at,
           CASE WHEN ce.visibility='busy' THEN NULL ELSE ce.location END,
           CASE WHEN ce.visibility='busy' THEN NULL ELSE ce.note END,
           NULL::text
    FROM group_members m
    JOIN groups g ON g.group_slug = m.group_slug
    JOIN custom_events ce ON ce.plan_slug = m.plan_slug
    WHERE m.group_slug = v_group AND ce.visibility <> 'private';
END;
$$;
REVOKE ALL ON FUNCTION group_feed_by_token(TEXT) FROM PUBLIC;

-- ─────────────────────────────────────────────────────────────────────────
-- CUSTOM EVENT writes — anon-granted, but authorised ONLY by plans.edit_key
-- matching the owner plan AND that plan being a member of some group.
-- Never accepts a member_id as authorisation.
-- ─────────────────────────────────────────────────────────────────────────
CREATE FUNCTION upsert_custom_event(
    p_event_id UUID, p_plan_slug TEXT, p_edit_key TEXT,
    p_kind TEXT, p_visibility TEXT, p_title TEXT,
    p_starts_at TIMESTAMPTZ, p_ends_at TIMESTAMPTZ, p_location TEXT, p_note TEXT,
    p_with_name TEXT, p_with_company TEXT, p_meeting_type TEXT
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_group TEXT; v_id UUID;
BEGIN
    SELECT gm.group_slug INTO v_group
    FROM plans pl JOIN group_members gm ON gm.plan_slug = pl.slug
    WHERE pl.slug = p_plan_slug AND pl.edit_key = p_edit_key;
    IF v_group IS NULL THEN RAISE EXCEPTION 'not authorized'; END IF;

    IF p_kind NOT IN ('generic','meeting') THEN RAISE EXCEPTION 'bad kind'; END IF;
    IF p_visibility NOT IN ('shared','busy','private') THEN RAISE EXCEPTION 'bad visibility'; END IF;
    IF p_starts_at IS NULL THEN RAISE EXCEPTION 'starts_at required'; END IF;
    IF p_kind = 'generic' AND (p_with_name IS NOT NULL OR p_with_company IS NOT NULL OR p_meeting_type IS NOT NULL)
        THEN RAISE EXCEPTION 'generic events take no meeting fields'; END IF;
    IF p_meeting_type IS NOT NULL AND p_meeting_type NOT IN ('coffee','one_on_one','call','lunch','dinner','other')
        THEN RAISE EXCEPTION 'bad meeting_type'; END IF;

    IF p_event_id IS NULL THEN
        IF (SELECT count(*) FROM custom_events WHERE plan_slug = p_plan_slug) >= 200
            THEN RAISE EXCEPTION 'too many custom events'; END IF;
        IF NOT rl_hit('custom_event:' || p_plan_slug, 60, 3600)
            THEN RAISE EXCEPTION 'rate limit exceeded' USING ERRCODE = 'insufficient_resources'; END IF;
        INSERT INTO custom_events (group_slug, plan_slug, kind, visibility, title, starts_at, ends_at,
                                   location, note, with_name, with_company, meeting_type)
        VALUES (v_group, p_plan_slug, p_kind, p_visibility, clean_text(p_title), p_starts_at, p_ends_at,
                clean_text(p_location), clean_text(p_note), clean_text(p_with_name),
                clean_text(p_with_company), p_meeting_type)
        RETURNING event_id INTO v_id;
    ELSE
        UPDATE custom_events SET
            kind = p_kind, visibility = p_visibility, title = clean_text(p_title),
            starts_at = p_starts_at, ends_at = p_ends_at, location = clean_text(p_location),
            note = clean_text(p_note), with_name = clean_text(p_with_name),
            with_company = clean_text(p_with_company), meeting_type = p_meeting_type, updated_at = now()
        WHERE event_id = p_event_id AND plan_slug = p_plan_slug
        RETURNING event_id INTO v_id;
        IF v_id IS NULL THEN RAISE EXCEPTION 'not found'; END IF;
    END IF;
    RETURN v_id;
END;
$$;

CREATE FUNCTION delete_custom_event(p_event_id UUID, p_plan_slug TEXT, p_edit_key TEXT)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_ok BOOLEAN;
BEGIN
    SELECT true INTO v_ok FROM plans WHERE slug = p_plan_slug AND edit_key = p_edit_key;
    IF v_ok IS NULL THEN RAISE EXCEPTION 'not authorized'; END IF;
    DELETE FROM custom_events WHERE event_id = p_event_id AND plan_slug = p_plan_slug;
END;
$$;

REVOKE ALL ON FUNCTION upsert_custom_event(UUID,TEXT,TEXT,TEXT,TEXT,TEXT,TIMESTAMPTZ,TIMESTAMPTZ,TEXT,TEXT,TEXT,TEXT,TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION delete_custom_event(UUID,TEXT,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION upsert_custom_event(UUID,TEXT,TEXT,TEXT,TEXT,TEXT,TIMESTAMPTZ,TIMESTAMPTZ,TEXT,TEXT,TEXT,TEXT,TEXT) TO anon;
GRANT EXECUTE ON FUNCTION delete_custom_event(UUID,TEXT,TEXT) TO anon;

-- ─────────────────────────────────────────────────────────────────────────
-- M1 close-out: rate-limit + hard ceiling on NEW standalone plan creation.
-- Signature identical to 001's 7-arg upsert_plan -> no client change, no
-- deploy-ordering constraint. Reads client IP from PostgREST's request.headers.
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION upsert_plan(
    p_slug TEXT, p_edit_key TEXT, p_display_name TEXT, p_tz_mode TEXT,
    p_start_date TEXT, p_attending JSONB, p_logged JSONB
) RETURNS TABLE (slug TEXT, display_name TEXT, tz_mode TEXT, start_date TEXT,
                attending JSONB, logged JSONB, created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_written_slug TEXT; v_is_new BOOLEAN; v_ip TEXT; v_total BIGINT;
BEGIN
    IF p_slug IS NULL OR p_slug !~ '^[A-Za-z0-9_-]{16,64}$' THEN RAISE EXCEPTION 'invalid slug'; END IF;
    IF p_edit_key IS NULL OR p_edit_key !~ '^[a-f0-9]{32,64}$' THEN RAISE EXCEPTION 'invalid edit key'; END IF;
    IF p_attending IS NULL OR jsonb_typeof(p_attending) <> 'array'
       OR jsonb_array_length(p_attending) > 300 THEN
        RAISE EXCEPTION 'attending must be a JSON array of at most 300 events'; END IF;
    IF p_logged IS NOT NULL AND (jsonb_typeof(p_logged) <> 'array' OR jsonb_array_length(p_logged) > 300) THEN
        RAISE EXCEPTION 'logged must be a JSON array of at most 300 entries'; END IF;
    IF pg_column_size(p_attending) + pg_column_size(COALESCE(p_logged,'[]'::jsonb)) > 65536 THEN
        RAISE EXCEPTION 'plan payload too large'; END IF;
    IF COALESCE(p_tz_mode,'tzid') NOT IN ('tzid','floating') THEN RAISE EXCEPTION 'invalid tz_mode'; END IF;

    v_is_new := NOT EXISTS (SELECT 1 FROM plans WHERE slug = p_slug);
    IF v_is_new THEN
        SELECT count(*) INTO v_total FROM plans;
        IF v_total >= 50000 THEN
            RAISE EXCEPTION 'plan capacity reached' USING ERRCODE = 'insufficient_resources'; END IF;
        v_ip := split_part(COALESCE(current_setting('request.headers', true)::json ->> 'x-forwarded-for',''), ',', 1);
        IF v_ip <> '' AND NOT rl_hit('plan_create_ip:' || v_ip, 20, 3600) THEN
            RAISE EXCEPTION 'rate limit exceeded' USING ERRCODE = 'insufficient_resources'; END IF;
    END IF;

    INSERT INTO plans (slug, edit_key, display_name, tz_mode, start_date, attending, logged, updated_at)
    VALUES (p_slug, p_edit_key, NULLIF(left(p_display_name,40),''), COALESCE(p_tz_mode,'tzid'),
            p_start_date, p_attending, COALESCE(p_logged,'[]'::jsonb), now())
    ON CONFLICT (slug) DO UPDATE SET
        display_name = EXCLUDED.display_name, tz_mode = EXCLUDED.tz_mode,
        start_date = EXCLUDED.start_date, attending = EXCLUDED.attending,
        logged = EXCLUDED.logged, updated_at = now()
    WHERE plans.edit_key = EXCLUDED.edit_key
    RETURNING slug INTO v_written_slug;

    IF v_written_slug IS NULL THEN
        RAISE EXCEPTION 'edit key does not match' USING ERRCODE = 'check_violation'; END IF;

    RETURN QUERY SELECT p.slug, p.display_name, p.tz_mode, p.start_date, p.attending,
                        p.logged, p.created_at, p.updated_at FROM plans p WHERE p.slug = p_slug;
END;
$$;

COMMIT;
