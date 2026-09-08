-- 002_drop_legacy_upsert_plan.sql
--
-- Status: run against production 2026-09-08. Verified afterwards — exactly one
-- upsert_plan remains, the 7-arg edit_key version
-- upsert_plan(text,text,text,text,text,jsonb,jsonb).
--
-- DEPLOY ORDER (was):
--   1. Run 001 (superseded — the live equivalent was 003 + 004).
--   2. Deploy the client that calls the 7-arg upsert_plan (sends p_edit_key)
--      plus the localStorage edit_key migration + Regenerate link — commit
--      22ab76a.
--   3. Confirm in production: a share + an edit both work end to end.
--   4. THEN run this file.
--
-- Until this ran, the 6-arg upsert_plan was still GRANTed to anon and H1
-- (anyone with a slug can overwrite/wipe a plan) was OPEN.
--
-- schema.sql used to recreate the 6-arg overload and re-GRANT it to anon on
-- every ingest run, silently reverting this drop; that block was removed from
-- schema.sql (commit a96e2e1) so this stays closed.
-- ─────────────────────────────────────────────────────────────────────────

-- Pre-check, drop, post-verify — all in one transaction so a surprise
-- rolls the whole thing back.
BEGIN;

-- Pre-check: exactly the two overloads we expect must be present right now.
DO $$
DECLARE
    has_6arg BOOLEAN;
    has_7arg BOOLEAN;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM pg_proc
        WHERE proname = 'upsert_plan'
          AND pg_get_function_identity_arguments(oid) = 'p_slug text, p_display_name text, p_tz_mode text, p_start_date text, p_attending jsonb, p_logged jsonb'
    ) INTO has_6arg;
    SELECT EXISTS (
        SELECT 1 FROM pg_proc
        WHERE proname = 'upsert_plan'
          AND pg_get_function_identity_arguments(oid) = 'p_slug text, p_edit_key text, p_display_name text, p_tz_mode text, p_start_date text, p_attending jsonb, p_logged jsonb'
    ) INTO has_7arg;
    IF NOT has_6arg THEN RAISE EXCEPTION 'legacy 6-arg upsert_plan not found - nothing to drop, stop and re-check state'; END IF;
    IF NOT has_7arg THEN RAISE EXCEPTION '7-arg upsert_plan (with p_edit_key) not found - do NOT drop the 6-arg, the client would break'; END IF;
END $$;

-- Drop the legacy overload (targets the 6-arg signature exactly).
DROP FUNCTION upsert_plan(TEXT, TEXT, TEXT, TEXT, JSONB, JSONB);

-- Post-verify: exactly one upsert_plan remains, and it is the 7-arg.
DO $$
DECLARE
    n    INT;
    args TEXT;
BEGIN
    SELECT count(*) INTO n FROM pg_proc WHERE proname = 'upsert_plan';
    IF n <> 1 THEN RAISE EXCEPTION 'expected exactly 1 upsert_plan after drop, found %', n; END IF;
    SELECT pg_get_function_identity_arguments(oid) INTO args FROM pg_proc WHERE proname = 'upsert_plan';
    IF args <> 'p_slug text, p_edit_key text, p_display_name text, p_tz_mode text, p_start_date text, p_attending jsonb, p_logged jsonb'
        THEN RAISE EXCEPTION 'the surviving upsert_plan is not the 7-arg one: %', args; END IF;
END $$;

COMMIT;
