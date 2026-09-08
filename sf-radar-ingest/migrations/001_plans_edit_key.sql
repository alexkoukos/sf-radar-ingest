-- 001_plans_edit_key.sql
--
-- HISTORICAL — DO NOT RUN. Kept for the record only.
--
-- Status: rolled back. Pasted into the Supabase SQL editor together with 003
-- in one message; the editor does not stop on the first error, so when a
-- statement in this file aborted, its BEGIN..COMMIT rolled back while 003's
-- transaction committed. Net effect on the live DB: none from this file.
--
-- Superseded by 004_reconcile_001_and_fix_003.sql, which reapplies this
-- migration's substance (plans.edit_key, the reshaped get_plan, the 7-arg
-- upsert_plan) against the post-003 state. The live database's plan schema
-- came from 003 + 004 + 005.
--
-- Intent at the time: split the plan capability — `slug` stays the PUBLIC
-- read id (share page + feed); a new `edit_key` becomes the ONLY thing that
-- authorizes a write. Backward compatible on purpose: the old 6-arg
-- upsert_plan was left in place so the deployed client kept working until 002.
-- ─────────────────────────────────────────────────────────────────────────

-- 001_plans_edit_key.sql  — atomic; backward compatible (6-arg upsert_plan left intact for the live client)
BEGIN;

ALTER TABLE plans ADD COLUMN edit_key TEXT;
UPDATE plans SET edit_key = 'legacy-locked' WHERE edit_key IS NULL;
ALTER TABLE plans ALTER COLUMN edit_key SET NOT NULL;
ALTER TABLE plans ADD CONSTRAINT plans_edit_key_shape
  CHECK (edit_key = 'legacy-locked' OR edit_key ~ '^[a-f0-9]{32,64}$');

DROP FUNCTION IF EXISTS get_plan(TEXT);
CREATE FUNCTION get_plan(p_slug TEXT)
RETURNS TABLE (slug TEXT, display_name TEXT, tz_mode TEXT, start_date TEXT,
               attending JSONB, logged JSONB, created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT slug, display_name, tz_mode, start_date, attending, logged, created_at, updated_at
    FROM plans WHERE slug = p_slug;
$$;

CREATE FUNCTION upsert_plan(
    p_slug TEXT, p_edit_key TEXT, p_display_name TEXT, p_tz_mode TEXT,
    p_start_date TEXT, p_attending JSONB, p_logged JSONB
) RETURNS TABLE (slug TEXT, display_name TEXT, tz_mode TEXT, start_date TEXT,
                attending JSONB, logged JSONB, created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_written_slug TEXT;
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

REVOKE ALL ON FUNCTION upsert_plan(TEXT,TEXT,TEXT,TEXT,TEXT,JSONB,JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_plan(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION upsert_plan(TEXT,TEXT,TEXT,TEXT,TEXT,JSONB,JSONB) TO anon;

COMMIT;
