-- 004_reconcile_001_and_fix_003.sql
--
-- Status: authored against live introspection, run against production
-- 2026-09-08 (with 005 immediately after to fix a 42702 in the 7-arg
-- upsert_plan it defines here). This file + 003 + 005 are the live plan/group
-- schema of record.
--
-- Against live state at authoring time: 001 rolled back (no plans.edit_key;
-- original get_plan; 6-arg upsert_plan present). 003 committed but its plpgsql
-- funcs are runtime-broken, and rl_hit / group_view / group_feed_by_token are
-- anon-executable.
-- This migration: (0) closes the anon hole, (1-2) reapplies 001's substance,
-- (3) rebuilds the 7-arg upsert_plan, (4) capacity valve, (5) FK ON UPDATE CASCADE +
-- regenerate/delete, (6) upsert_custom_event + p_with_member_id + rate-limit both
-- branches, (7) race-safe join_group, (8) rotate_feed_token, (9) sweep_stale_plans.
-- The 6-arg legacy upsert_plan is intentionally LEFT IN PLACE; 002 drops it later.
BEGIN;

-- ── 0. Close the anon execution hole ───────────────────────────────────
REVOKE EXECUTE ON FUNCTION rl_hit(TEXT,INT,INT)      FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION group_view(TEXT)          FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION group_feed_by_token(TEXT) FROM PUBLIC, anon, authenticated;

-- ── 1. Reapply 001: plans.edit_key ────────────────────────────────────
ALTER TABLE plans ADD COLUMN IF NOT EXISTS edit_key TEXT;
UPDATE plans SET edit_key = 'legacy-locked' WHERE edit_key IS NULL;
ALTER TABLE plans ALTER COLUMN edit_key SET NOT NULL;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='plans_edit_key_shape') THEN
    ALTER TABLE plans ADD CONSTRAINT plans_edit_key_shape
      CHECK (edit_key = 'legacy-locked' OR edit_key ~ '^[a-f0-9]{32,64}$');
  END IF;
END $$;

-- ── 2. Reapply 001: get_plan (no edit_key, SETOF shape) ────────────────
DROP FUNCTION IF EXISTS get_plan(TEXT);
CREATE FUNCTION get_plan(p_slug TEXT)
RETURNS TABLE (slug TEXT, display_name TEXT, tz_mode TEXT, start_date TEXT,
               attending JSONB, logged JSONB, created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT slug, display_name, tz_mode, start_date, attending, logged, created_at, updated_at
    FROM plans WHERE slug = p_slug;
$$;
REVOKE EXECUTE ON FUNCTION get_plan(TEXT) FROM PUBLIC, authenticated;
GRANT  EXECUTE ON FUNCTION get_plan(TEXT) TO anon;

-- ── 3. Rebuild the 7-arg upsert_plan (edit_key check + rate limit + ceiling)
CREATE OR REPLACE FUNCTION plan_capacity() RETURNS INT LANGUAGE sql IMMUTABLE AS $$ SELECT 50000 $$;

DROP FUNCTION IF EXISTS upsert_plan(TEXT,TEXT,TEXT,TEXT,TEXT,JSONB,JSONB);
CREATE FUNCTION upsert_plan(
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
        IF v_total >= plan_capacity() THEN
            RAISE EXCEPTION 'plan capacity reached' USING ERRCODE='insufficient_resources'; END IF;
        v_ip := split_part(COALESCE(current_setting('request.headers', true)::json ->> 'x-forwarded-for',''),',',1);
        IF v_ip <> '' AND NOT rl_hit('plan_create_ip:'||v_ip, 20, 3600) THEN
            RAISE EXCEPTION 'rate limit exceeded' USING ERRCODE='insufficient_resources'; END IF;
    END IF;

    INSERT INTO plans (slug, edit_key, display_name, tz_mode, start_date, attending, logged, updated_at)
    VALUES (p_slug, p_edit_key, NULLIF(left(p_display_name,40),''), COALESCE(p_tz_mode,'tzid'),
            p_start_date, p_attending, COALESCE(p_logged,'[]'::jsonb), now())
    ON CONFLICT (slug) DO UPDATE SET
        display_name=EXCLUDED.display_name, tz_mode=EXCLUDED.tz_mode, start_date=EXCLUDED.start_date,
        attending=EXCLUDED.attending, logged=EXCLUDED.logged, updated_at=now()
    WHERE plans.edit_key = EXCLUDED.edit_key
    RETURNING slug INTO v_written_slug;

    IF v_written_slug IS NULL THEN
        RAISE EXCEPTION 'edit key does not match' USING ERRCODE='check_violation'; END IF;

    RETURN QUERY SELECT p.slug,p.display_name,p.tz_mode,p.start_date,p.attending,
                        p.logged,p.created_at,p.updated_at FROM plans p WHERE p.slug = p_slug;
END; $$;
REVOKE EXECUTE ON FUNCTION upsert_plan(TEXT,TEXT,TEXT,TEXT,TEXT,JSONB,JSONB) FROM PUBLIC, authenticated;
GRANT  EXECUTE ON FUNCTION upsert_plan(TEXT,TEXT,TEXT,TEXT,TEXT,JSONB,JSONB) TO anon;

-- ── 4. delete_custom_event: unchanged body, now valid once edit_key exists.
--     (No statement needed — it starts working the moment §1 lands.)

-- ── 5. FK ON UPDATE CASCADE + regenerate_plan / delete_plan ────────────
--     Constraint names per query C; these are the Postgres defaults.
ALTER TABLE group_members DROP CONSTRAINT IF EXISTS group_members_plan_slug_fkey;
ALTER TABLE group_members ADD  CONSTRAINT group_members_plan_slug_fkey
  FOREIGN KEY (plan_slug) REFERENCES plans(slug) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE custom_events DROP CONSTRAINT IF EXISTS custom_events_plan_slug_fkey;
ALTER TABLE custom_events ADD  CONSTRAINT custom_events_plan_slug_fkey
  FOREIGN KEY (plan_slug) REFERENCES plans(slug) ON DELETE CASCADE ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION regenerate_plan(p_old_slug TEXT, p_old_edit_key TEXT,
                                           p_new_slug TEXT, p_new_edit_key TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_key TEXT;
BEGIN
    IF p_new_slug !~ '^[A-Za-z0-9_-]{16,64}$' OR p_new_edit_key !~ '^[a-f0-9]{32,64}$'
        THEN RAISE EXCEPTION 'invalid new slug or key'; END IF;
    SELECT edit_key INTO v_key FROM plans WHERE slug = p_old_slug;
    IF v_key IS NULL OR v_key IS DISTINCT FROM p_old_edit_key THEN
        RAISE EXCEPTION 'edit key does not match'; END IF;
    IF EXISTS (SELECT 1 FROM plans WHERE slug = p_new_slug) THEN
        RAISE EXCEPTION 'new slug already exists'; END IF;
    UPDATE plans SET slug = p_new_slug, edit_key = p_new_edit_key, updated_at = now()
     WHERE slug = p_old_slug;   -- plan_slug in group_members + custom_events cascades
END; $$;
REVOKE EXECUTE ON FUNCTION regenerate_plan(TEXT,TEXT,TEXT,TEXT) FROM PUBLIC, authenticated;
GRANT  EXECUTE ON FUNCTION regenerate_plan(TEXT,TEXT,TEXT,TEXT) TO anon;

CREATE OR REPLACE FUNCTION delete_plan(p_slug TEXT, p_edit_key TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_key TEXT;
BEGIN
    SELECT edit_key INTO v_key FROM plans WHERE slug = p_slug;
    IF v_key IS NULL OR v_key IS DISTINCT FROM p_edit_key THEN
        RAISE EXCEPTION 'edit key does not match'; END IF;
    DELETE FROM plans WHERE slug = p_slug;   -- cascades to group_members + custom_events
END; $$;
REVOKE EXECUTE ON FUNCTION delete_plan(TEXT,TEXT) FROM PUBLIC, authenticated;
GRANT  EXECUTE ON FUNCTION delete_plan(TEXT,TEXT) TO anon;

-- ── 6. upsert_custom_event: + p_with_member_id, rate-limit BOTH branches
DROP FUNCTION IF EXISTS upsert_custom_event(UUID,TEXT,TEXT,TEXT,TEXT,TEXT,TIMESTAMPTZ,TIMESTAMPTZ,TEXT,TEXT,TEXT,TEXT,TEXT);
CREATE FUNCTION upsert_custom_event(
    p_event_id UUID, p_plan_slug TEXT, p_edit_key TEXT,
    p_kind TEXT, p_visibility TEXT, p_title TEXT,
    p_starts_at TIMESTAMPTZ, p_ends_at TIMESTAMPTZ, p_location TEXT, p_note TEXT,
    p_with_name TEXT, p_with_company TEXT, p_meeting_type TEXT,
    p_with_member_id UUID DEFAULT NULL
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_group TEXT; v_id UUID;
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
        ('coffee','one_on_one','call','lunch','dinner','other') THEN RAISE EXCEPTION 'bad meeting_type'; END IF;
    IF p_with_member_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM group_members WHERE member_id = p_with_member_id AND group_slug = v_group)
        THEN RAISE EXCEPTION 'with_member_id not in this group'; END IF;

    IF NOT rl_hit('custom_event:'||p_plan_slug, 120, 3600) THEN
        RAISE EXCEPTION 'rate limit exceeded' USING ERRCODE='insufficient_resources'; END IF;

    IF p_event_id IS NULL THEN
        IF (SELECT count(*) FROM custom_events WHERE plan_slug = p_plan_slug) >= 200
            THEN RAISE EXCEPTION 'too many custom events'; END IF;
        INSERT INTO custom_events (group_slug, plan_slug, kind, visibility, title, starts_at, ends_at,
            location, note, with_name, with_company, meeting_type, with_member_id)
        VALUES (v_group, p_plan_slug, p_kind, p_visibility, clean_text(p_title), p_starts_at, p_ends_at,
            clean_text(p_location), clean_text(p_note), clean_text(p_with_name),
            clean_text(p_with_company), p_meeting_type, p_with_member_id)
        RETURNING event_id INTO v_id;
    ELSE
        UPDATE custom_events SET
            kind=p_kind, visibility=p_visibility, title=clean_text(p_title), starts_at=p_starts_at,
            ends_at=p_ends_at, location=clean_text(p_location), note=clean_text(p_note),
            with_name=clean_text(p_with_name), with_company=clean_text(p_with_company),
            meeting_type=p_meeting_type, with_member_id=p_with_member_id, updated_at=now()
        WHERE event_id = p_event_id AND plan_slug = p_plan_slug
        RETURNING event_id INTO v_id;
        IF v_id IS NULL THEN RAISE EXCEPTION 'not found'; END IF;
    END IF;
    RETURN v_id;
END; $$;
REVOKE EXECUTE ON FUNCTION upsert_custom_event(UUID,TEXT,TEXT,TEXT,TEXT,TEXT,TIMESTAMPTZ,TIMESTAMPTZ,TEXT,TEXT,TEXT,TEXT,TEXT,UUID) FROM PUBLIC, authenticated;
GRANT  EXECUTE ON FUNCTION upsert_custom_event(UUID,TEXT,TEXT,TEXT,TEXT,TEXT,TIMESTAMPTZ,TIMESTAMPTZ,TEXT,TEXT,TEXT,TEXT,TEXT,UUID) TO anon;

-- ── 7. join_group: advisory-lock the join_order assignment ─────────────
CREATE OR REPLACE FUNCTION join_group(
    p_group_slug TEXT, p_plan_slug TEXT, p_display_name TEXT, p_feed_token TEXT
) RETURNS TABLE (join_order INT, color TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_order INT; v_color TEXT;
    v_palette TEXT[] := ARRAY[
      '#E69F00','#56B4E9','#009E73','#F0E442','#0072B2','#D55E00','#CC79A7','#4D4D4D',
      '#F2CC66','#99D2F1','#66C5A9','#F6EF8E','#66AAD1','#E69E66','#E0ACC9','#939393'];
BEGIN
    IF p_feed_token !~ '^[A-Za-z0-9_-]{32}$' THEN RAISE EXCEPTION 'bad feed token'; END IF;
    IF NOT EXISTS (SELECT 1 FROM groups WHERE group_slug = p_group_slug) THEN
        RAISE EXCEPTION 'no such group'; END IF;
    IF NOT EXISTS (SELECT 1 FROM plans WHERE slug = p_plan_slug) THEN
        RAISE EXCEPTION 'plan does not exist'; END IF;

    PERFORM pg_advisory_xact_lock(hashtext('sfradar.join:'||p_group_slug));  -- serialise joins to this group

    IF EXISTS (SELECT 1 FROM group_members WHERE group_slug=p_group_slug AND plan_slug=p_plan_slug) THEN
        RAISE EXCEPTION 'already a member'; END IF;
    IF (SELECT count(*) FROM group_members WHERE group_slug=p_group_slug) >= 16 THEN
        RAISE EXCEPTION 'group is full (16 max)'; END IF;
    IF NOT rl_hit('join:'||p_group_slug, 10, 3600) THEN
        RAISE EXCEPTION 'rate limit exceeded' USING ERRCODE='insufficient_resources'; END IF;

    SELECT COALESCE(MAX(gm.join_order),-1)+1 INTO v_order
      FROM group_members gm WHERE gm.group_slug = p_group_slug;
    v_color := v_palette[(v_order % 16) + 1];

    INSERT INTO group_members (group_slug, plan_slug, display_name, color, join_order, feed_token)
    VALUES (p_group_slug, p_plan_slug, clean_text(p_display_name), v_color, v_order, p_feed_token);

    RETURN QUERY SELECT v_order, v_color;
END; $$;
REVOKE EXECUTE ON FUNCTION join_group(TEXT,TEXT,TEXT,TEXT) FROM PUBLIC, anon, authenticated;
-- service_role only (Vercel calls it after validating the passphrase cookie)

-- ── 8. rotate_feed_token: make feed_revoked reachable (edit_key-gated) ──
CREATE OR REPLACE FUNCTION rotate_feed_token(p_plan_slug TEXT, p_edit_key TEXT, p_new_token TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_ok BOOLEAN;
BEGIN
    IF p_new_token !~ '^[A-Za-z0-9_-]{32}$' THEN RAISE EXCEPTION 'bad token'; END IF;
    SELECT true INTO v_ok FROM plans WHERE slug = p_plan_slug AND edit_key = p_edit_key;
    IF v_ok IS NULL THEN RAISE EXCEPTION 'not authorized'; END IF;
    UPDATE group_members SET feed_token = p_new_token, feed_revoked = false WHERE plan_slug = p_plan_slug;
END; $$;
REVOKE EXECUTE ON FUNCTION rotate_feed_token(TEXT,TEXT,TEXT) FROM PUBLIC, authenticated;
GRANT  EXECUTE ON FUNCTION rotate_feed_token(TEXT,TEXT,TEXT) TO anon;

-- ── 9. sweep_stale_plans: recovery valve for plan_capacity() ───────────
CREATE OR REPLACE FUNCTION sweep_stale_plans(p_older_than INTERVAL DEFAULT INTERVAL '6 months')
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_n INT;
BEGIN
    DELETE FROM plans p
     WHERE NOT EXISTS (SELECT 1 FROM group_members gm WHERE gm.plan_slug = p.slug)
       AND p.updated_at < now() - p_older_than;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    RETURN v_n;
END; $$;
REVOKE EXECUTE ON FUNCTION sweep_stale_plans(INTERVAL) FROM PUBLIC, anon, authenticated;

COMMIT;
