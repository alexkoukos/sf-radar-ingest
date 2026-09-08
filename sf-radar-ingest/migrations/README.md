# Supabase migrations (hand-run)

These are applied **by hand, one file per paste**, in the Supabase SQL editor,
against production. The editor does **not** stop on the first error, so pasting
two migrations together can leave you half-applied (this is how 001 got rolled
back while 003 committed). One migration per message. Always.

`../src/main/resources/schema.sql` is **not** the source of truth for anything
in here. That file is re-applied in full by `PostgresEventStore.ensureSchema()`
on every ingest run and only manages the ingest-owned objects (`events`,
`ingestion_runs`, `la_window_start()`, `get_dashboard_events()`). It used to
also carry the `plans` block, which silently fought these migrations every 6
hours — that block was removed in commit a96e2e1.

## Run order / state (as of 2026-09-08)

| #   | File                                        | What                                                                              | State |
|-----|--------------------------------------------|----------------------------------------------------------------------------------|-------|
| 001 | `001_plans_edit_key.sql`                   | plans: add `edit_key`, reshape `get_plan` to not return it, 7-arg `upsert_plan`  | **rolled back** (pasted with 003, its txn aborted). HISTORICAL — do not run. Superseded by 004. |
| 002 | `002_drop_legacy_upsert_plan.sql`         | drop the legacy 6-arg `upsert_plan` (closes H1: slug-only overwrite)             | **run 2026-09-08**, verified (one `upsert_plan`, the 7-arg) |
| 003 | `003_groups.sql`                           | groups / group_members / custom_events / rate_limits + functions                 | **committed** (plpgsql funcs were DOA until 004 §1; anon grants closed by 004 §0) |
| 004 | `004_reconcile_001_and_fix_003.sql`       | reapply 001 into post-003 state + fixes, single transaction                       | **run 2026-09-08** |
| 005 | `005_fix_returns_table_column_ambiguity.sql` | `#variable_conflict use_column` fix for 42702 in the `RETURNS TABLE` funcs      | **run 2026-09-08**, right after 004 |

Live plan/group schema of record = **003 + 004 + 005**. 001 is kept only as the
historical record of the first attempt.

## Pending cleanup after orphan purge

Once the legacy rows are hand-deleted as service role:

```sql
DELETE FROM plans WHERE edit_key = 'legacy-locked';
```

then drop the `edit_key = 'legacy-locked' OR` branch from the
`plans_edit_key_shape` CHECK so the sentinel can never be written again:

```sql
ALTER TABLE plans DROP CONSTRAINT plans_edit_key_shape;
ALTER TABLE plans ADD  CONSTRAINT plans_edit_key_shape
  CHECK (edit_key ~ '^[a-f0-9]{32,64}$');
```

Do this as a numbered migration (`006_...`) when you run it.

## Not yet built

Migration tables 003/004 are live but the group feature's Vercel endpoints and
React UI are not built yet.
