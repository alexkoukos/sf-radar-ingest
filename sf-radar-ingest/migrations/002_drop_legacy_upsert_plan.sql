-- 002 — drop the legacy 6-argument upsert_plan
--
-- Run ONLY after the edit_key client (commit 22ab76a) is deployed and verified
-- in prod. Before that, this function is the only write path the shipped
-- frontend has.
--
-- The 6-arg version predates the read-slug / edit_key split: it updates any
-- plan given only its slug, with no edit_key check. That is finding H1
-- (slug-only plan overwrite). The 7-arg edit_key version from 001/004 is the
-- intended write path and is unaffected by this drop (different signature).
--
-- State: run against production 2026-09-08.

DROP FUNCTION IF EXISTS upsert_plan(text, text, text, text, jsonb, jsonb);
