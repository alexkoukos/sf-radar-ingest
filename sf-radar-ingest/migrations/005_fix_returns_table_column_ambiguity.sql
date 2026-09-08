-- 005_fix_returns_table_column_ambiguity.sql   (run after 004; standalone)
--
-- Status: run against production 2026-09-08, right after 004. Share links +
-- regenerate confirmed working in prod. Client-side edit_key wiring shipped in
-- commit 22ab76a.
--
-- 42702 "column reference \"slug\" is ambiguous" from upsert_plan: RETURNS
-- TABLE (slug,...) declares OUT-param variables that collide with plans.slug
-- in the bare `RETURNING slug`. Fix, applied to all three RETURNS TABLE
-- plpgsql functions:
--   * `#variable_conflict use_column` (first body line): a name that is both
--     a column and an OUT-param variable resolves to the COLUMN. Always right
--     here - inputs are p_*, scratch is v_*, output is via RETURN QUERY.
--   * explicit table-qualification at the sites that matter.
-- Only upsert_plan actually mis-resolved; the other two were already alias-
-- qualified but get the same guard. Scalar/void functions are unaffected.
-- CREATE OR REPLACE keeps existing privileges; GRANT/REVOKE restated anyway.
--
-- Also: guarded the request.headers cast with NULLIF(...,'') so an empty-string
-- GUC can't throw 22P02 and block a save.
BEGIN;

-- ── upsert_plan (7-arg) ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION upsert_plan(
    p_slug TEXT, p_edit_key TEXT, p_display_name TEXT, p_tz_mode TEXT,
    p_start_date TEXT, p_attending JSONB, p_logged JSONB
) RETURNS TABLE (slug TEXT, display_name TEXT, tz_mode TEXT, start_date TEXT,
                attending JSONB, logged JSONB, created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
#variable_conflict use_column
DECLARE
    v_written_slug TEXT;
    v_is_new       BOOLEAN;
    v_ip           TEXT;
    v_total        BIGINT;
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

    v_is_new := NOT EXISTS (SELECT 1 FROM plans WHERE plans.slug = p_slug);
    IF v_is_new THEN
        SELECT count(*) INTO v_total FROM plans;
        IF v_total >= plan_capacity() THEN
            RAISE EXCEPTION 'plan capacity reached' USING ERRCODE='insufficient_resources'; END IF;
        v_ip := split_part(
                  COALESCE(NULLIF(current_setting('request.headers', true), '')::json ->> 'x-forwarded-for', ''),
                  ',', 1);
        IF v_ip <> '' AND NOT rl_hit('plan_create_ip:'||v_ip, 20, 3600) THEN
            RAISE EXCEPTION 'rate limit exceeded' USING ERRCODE='insufficient_resources'; END IF;
    END IF;

    INSERT INTO plans (slug, edit_key, display_name, tz_mode, start_date, attending, logged, updated_at)
    VALUES (p_slug, p_edit_key, NULLIF(left(p_display_name,40),''), COALESCE(p_tz_mode,'tzid'),
            p_start_date, p_attending, COALESCE(p_logged,'[]'::jsonb), now())
    ON CONFLICT (slug) DO UPDATE SET
        display_name = EXCLUDED.display_name, tz_mode = EXCLUDED.tz_mode,
        start_date   = EXCLUDED.start_date,   attending = EXCLUDED.attending,
        logged       = EXCLUDED.logged,       updated_at = now()
    WHERE plans.edit_key = EXCLUDED.edit_key
    RETURNING plans.slug INTO v_written_slug;

    IF v_written_slug IS NULL THEN
        RAISE EXCEPTION 'edit key does not match' USING ERRCODE='check_violation'; END IF;

    RETURN QUERY
        SELECT p.slug, p.display_name, p.tz_mode, p.start_date, p.attending,
               p.logged, p.created_at, p.updated_at
        FROM plans p WHERE p.slug = p_slug;
END; $$;
REVOKE EXECUTE ON FUNCTION upsert_plan(TEXT,TEXT,TEXT,TEXT,TEXT,JSONB,JSONB) FROM PUBLIC, authenticated;
GRANT  EXECUTE ON FUNCTION upsert_plan(TEXT,TEXT,TEXT,TEXT,TEXT,JSONB,JSONB) TO anon;

-- ── group_feed_by_token ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION group_feed_by_token(p_feed_token TEXT)
RETURNS TABLE (group_name TEXT, member_name TEXT, join_order INT, is_busy BOOLEAN,
               source TEXT, source_id TEXT, title TEXT,
               starts_at TIMESTAMPTZ, ends_at TIMESTAMPTZ, location TEXT, note TEXT, url_slug TEXT)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
#variable_conflict use_column
DECLARE v_group TEXT;
BEGIN
    SELECT gm.group_slug INTO v_group
      FROM group_members gm
     WHERE gm.feed_token = p_feed_token AND gm.feed_revoked = false;
    IF v_group IS NULL THEN RETURN; END IF;

    RETURN QUERY
    SELECT g.name, m.display_name, m.join_order, false,
           'luma', (e.evt ->> 'api_id'), (e.evt ->> 'name'),
           (e.evt ->> 'starts_at')::timestamptz,
           NULLIF(e.evt ->> 'ends_at','')::timestamptz,
           NULL::text, NULL::text, (e.evt ->> 'url_slug')
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
                     CASE WHEN ce.kind = 'meeting'
                          THEN 'Meeting' || COALESCE(' with ' || ce.with_name, '')
                          ELSE 'Event' END) END,
           ce.starts_at, ce.ends_at,
           CASE WHEN ce.visibility = 'busy' THEN NULL ELSE ce.location END,
           CASE WHEN ce.visibility = 'busy' THEN NULL ELSE ce.note END,
           NULL::text
    FROM group_members m
    JOIN groups g ON g.group_slug = m.group_slug
    JOIN custom_events ce ON ce.plan_slug = m.plan_slug
    WHERE m.group_slug = v_group AND ce.visibility <> 'private';
END; $$;
REVOKE EXECUTE ON FUNCTION group_feed_by_token(TEXT) FROM PUBLIC, anon, authenticated;

-- ── join_group ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION join_group(
    p_group_slug TEXT, p_plan_slug TEXT, p_display_name TEXT, p_feed_token TEXT
) RETURNS TABLE (join_order INT, color TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
#variable_conflict use_column
DECLARE
    v_order   INT;
    v_color   TEXT;
    v_palette TEXT[] := ARRAY[
      '#E69F00','#56B4E9','#009E73','#F0E442','#0072B2','#D55E00','#CC79A7','#4D4D4D',
      '#F2CC66','#99D2F1','#66C5A9','#F6EF8E','#66AAD1','#E69E66','#E0ACC9','#939393'];
BEGIN
    IF p_feed_token !~ '^[A-Za-z0-9_-]{32}$' THEN RAISE EXCEPTION 'bad feed token'; END IF;
    IF NOT EXISTS (SELECT 1 FROM groups WHERE groups.group_slug = p_group_slug) THEN
        RAISE EXCEPTION 'no such group'; END IF;
    IF NOT EXISTS (SELECT 1 FROM plans WHERE plans.slug = p_plan_slug) THEN
        RAISE EXCEPTION 'plan does not exist'; END IF;

    PERFORM pg_advisory_xact_lock(hashtext('sfradar.join:'||p_group_slug));

    IF EXISTS (SELECT 1 FROM group_members gm
                WHERE gm.group_slug = p_group_slug AND gm.plan_slug = p_plan_slug) THEN
        RAISE EXCEPTION 'already a member'; END IF;
    IF (SELECT count(*) FROM group_members gm WHERE gm.group_slug = p_group_slug) >= 16 THEN
        RAISE EXCEPTION 'group is full (16 max)'; END IF;
    IF NOT rl_hit('join:'||p_group_slug, 10, 3600) THEN
        RAISE EXCEPTION 'rate limit exceeded' USING ERRCODE='insufficient_resources'; END IF;

    SELECT COALESCE(MAX(gm.join_order), -1) + 1 INTO v_order
      FROM group_members gm WHERE gm.group_slug = p_group_slug;
    v_color := v_palette[(v_order % 16) + 1];

    INSERT INTO group_members (group_slug, plan_slug, display_name, color, join_order, feed_token)
    VALUES (p_group_slug, p_plan_slug, clean_text(p_display_name), v_color, v_order, p_feed_token);

    RETURN QUERY SELECT v_order, v_color;
END; $$;
REVOKE EXECUTE ON FUNCTION join_group(TEXT,TEXT,TEXT,TEXT) FROM PUBLIC, anon, authenticated;

COMMIT;
