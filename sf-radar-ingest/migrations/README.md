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
hours — that block was removed.

## Run order / state (as of 2026-09-08)

| #   | What                                                                                 | State |
|-----|--------------------------------------------------------------------------------------|-------|
| 001 | plans: add `edit_key`, reshape `get_plan` to not return it, 7-arg `upsert_plan`      | rolled back (pasted with 003); superseded by 004 |
| 002 | drop the legacy 6-arg `upsert_plan` (closes H1: slug-only overwrite, no edit_key)   | **run 2026-09-08** — see `002_drop_legacy_upsert_plan.sql` |
| 003 | groups / group_members / custom_events / rate_limits + functions                     | committed |
| 004 | forward migration: reconcile 001 into post-003 state + fixes, single transaction     | authored, confirmed vs live introspection, **awaiting run** |
| 005 | fix `42702` ambiguous `slug` in `upsert_plan` (`#variable_conflict use_column`)      | run |

Only `002` is checked in so far. **Paste the text of 001, 003, 004, 005 here**
as `NNN_<slug>.sql` so this directory is the real record.

## Pending cleanup after 002 + orphan purge

Once the legacy rows are hand-deleted as service role:

```sql
DELETE FROM plans WHERE edit_key = 'legacy-locked';
```

then drop the `edit_key = 'legacy-locked' OR` branch from the
`plans_edit_key_shape` CHECK so the sentinel can never be written again.
