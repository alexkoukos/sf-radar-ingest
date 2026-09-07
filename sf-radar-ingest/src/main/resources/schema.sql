CREATE TABLE IF NOT EXISTS events (
    api_id                     TEXT PRIMARY KEY,
    name                       TEXT NOT NULL,
    url_slug                   TEXT,
    starts_at                  TIMESTAMPTZ,
    ends_at                    TIMESTAMPTZ,
    is_online                  BOOLEAN NOT NULL,
    host_name                  TEXT,
    city                       TEXT,
    region                     TEXT,
    sublocality                TEXT,
    country_code               TEXT,
    latitude                   DOUBLE PRECISION,
    longitude                  DOUBLE PRECISION,
    is_free                    BOOLEAN,
    price_cents                INTEGER,
    require_approval           BOOLEAN,
    waitlist_status            TEXT,
    registration_availability  TEXT,
    calendar_access_level      TEXT,
    discovered_via             TEXT,
    category                   TEXT NOT NULL,
    rsvp_type                  TEXT NOT NULL,
    -- Populated by Java's scoring pass (Day 2). Time-invariant: reflects
    -- keyword/host/venue/accessibility relevance, never a time window.
    score                      DOUBLE PRECISION,
    first_seen_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_seen_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One row per ingest run, regardless of outcome. Lets a total-failure run
-- (zero events across all targets, or a structural shape-match break) be
-- recorded and inspected without ever touching the events table.
CREATE TABLE IF NOT EXISTS ingestion_runs (
    id              BIGSERIAL PRIMARY KEY,
    started_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    status          TEXT NOT NULL,
    total_events    INTEGER NOT NULL,
    persisted       BOOLEAN NOT NULL,
    source_summary  JSONB NOT NULL
);

-- The anon key shipped in the frontend bundle is public by construction, so
-- RLS is what actually keeps it read-only. events gets a SELECT-everyone
-- policy (the data is already public event listings); no INSERT/UPDATE/
-- DELETE policy exists for it, so PostgREST denies writes by default.
-- ingestion_runs gets RLS enabled with zero policies - it's never read via
-- PostgREST, only written by the Java job's direct, privileged connection,
-- which bypasses RLS entirely and isn't affected by any of this.
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "events are publicly readable" ON events;
CREATE POLICY "events are publicly readable" ON events FOR SELECT USING (true);

ALTER TABLE ingestion_runs ENABLE ROW LEVEL SECURITY;

-- Start of "today" in San Francisco's timezone, expressed as a timestamptz.
-- Every dashboard time window is anchored here, never UTC or JVM/browser
-- local time - the dev machine and any given viewer can be anywhere.
CREATE OR REPLACE FUNCTION la_window_start() RETURNS TIMESTAMPTZ
LANGUAGE sql STABLE AS $$
    SELECT date_trunc('day', now() AT TIME ZONE 'America/Los_Angeles')
        AT TIME ZONE 'America/Los_Angeles';
$$;

-- All filtering/sorting for the dashboard lives here, not in the frontend
-- or Java. last_seen_at within 24h is the ghost-event grace window: a
-- transient single-target scrape failure self-heals within a run or two,
-- while an event that's genuinely gone stops being seen and ages out.
CREATE OR REPLACE FUNCTION get_dashboard_events(p_days INTEGER)
RETURNS SETOF events
LANGUAGE sql STABLE AS $$
    SELECT *
    FROM events
    WHERE starts_at >= la_window_start()
        AND starts_at < la_window_start() + (p_days::text || ' days')::interval
        AND last_seen_at >= now() - INTERVAL '24 hours'
    ORDER BY score DESC NULLS LAST, starts_at ASC;
$$;

-- ─────────────────────────────────────────────────────────────────────────
-- Live shareable / subscribable plans (frontend feature, no auth).
--
-- One row per plan, keyed by an unguessable 128-bit slug that doubles as
-- the share-link id and the calendar-feed id. This is the source of truth
-- for anything shared; the browser keeps a localStorage copy as an offline
-- cache only. A subscriber's calendar re-polls the feed and sees edits -
-- it is a live view, not the one-shot snapshot this replaces.
--
-- RLS is on with ZERO table policies, exactly like ingestion_runs: no
-- direct PostgREST read or write. Both paths go through the SECURITY
-- DEFINER functions below, so a caller can only ever touch a plan whose
-- exact slug they already hold - no listing, no enumeration.
CREATE TABLE IF NOT EXISTS plans (
    slug         TEXT PRIMARY KEY,
    display_name TEXT,                                   -- 1-40 chars, normalized client-side; nullable
    tz_mode      TEXT NOT NULL DEFAULT 'tzid'
                 CHECK (tz_mode IN ('tzid', 'floating')),
    start_date   TEXT,                                   -- "YYYY-MM-DD" LA arrival anchor, nullable
    attending    JSONB NOT NULL DEFAULT '[]'::jsonb,     -- array of event snapshots
    logged       JSONB NOT NULL DEFAULT '[]'::jsonb,     -- array of {date,title,note}
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE plans ENABLE ROW LEVEL SECURITY;

-- Read path (used by the shared page and the /feed serverless function).
CREATE OR REPLACE FUNCTION get_plan(p_slug TEXT)
RETURNS plans
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT * FROM plans WHERE slug = p_slug;
$$;

-- Create-or-update path. The client mints the slug (crypto.randomUUID, 128
-- bits) and keeps it in localStorage; this is the ONLY way anon writes the
-- table. Validates slug shape, tz_mode, and payload size.
CREATE OR REPLACE FUNCTION upsert_plan(
    p_slug         TEXT,
    p_display_name TEXT,
    p_tz_mode      TEXT,
    p_start_date   TEXT,
    p_attending    JSONB,
    p_logged       JSONB
) RETURNS plans
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_row plans;
BEGIN
    IF p_slug IS NULL OR p_slug !~ '^[A-Za-z0-9_-]{16,64}$' THEN
        RAISE EXCEPTION 'invalid slug';
    END IF;
    IF p_attending IS NULL
       OR jsonb_typeof(p_attending) <> 'array'
       OR jsonb_array_length(p_attending) > 300 THEN
        RAISE EXCEPTION 'attending must be a JSON array of at most 300 events';
    END IF;
    IF p_logged IS NOT NULL
       AND (jsonb_typeof(p_logged) <> 'array' OR jsonb_array_length(p_logged) > 300) THEN
        RAISE EXCEPTION 'logged must be a JSON array of at most 300 entries';
    END IF;
    IF COALESCE(p_tz_mode, 'tzid') NOT IN ('tzid', 'floating') THEN
        RAISE EXCEPTION 'invalid tz_mode';
    END IF;

    INSERT INTO plans (slug, display_name, tz_mode, start_date, attending, logged, updated_at)
    VALUES (
        p_slug,
        NULLIF(left(p_display_name, 40), ''),
        COALESCE(p_tz_mode, 'tzid'),
        p_start_date,
        p_attending,
        COALESCE(p_logged, '[]'::jsonb),
        now()
    )
    ON CONFLICT (slug) DO UPDATE SET
        display_name = EXCLUDED.display_name,
        tz_mode      = EXCLUDED.tz_mode,
        start_date   = EXCLUDED.start_date,
        attending    = EXCLUDED.attending,
        logged       = EXCLUDED.logged,
        updated_at   = now()
    RETURNING * INTO v_row;

    RETURN v_row;
END;
$$;

GRANT EXECUTE ON FUNCTION get_plan(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION upsert_plan(TEXT, TEXT, TEXT, TEXT, JSONB, JSONB) TO anon;

-- Superseded one-shot snapshot objects (harmless no-ops if never created).
DROP FUNCTION IF EXISTS create_shared_plan(JSONB, JSONB, TEXT);
DROP FUNCTION IF EXISTS get_shared_plan(TEXT);
DROP TABLE IF EXISTS shared_plans;
