# Migrations: shared plans and trip groups

These tables and functions back shared plans and trip groups. They are applied **by hand** in the Supabase SQL editor, **one file at a time**: the editor does not stop on the first error, so pasting two files together can leave one half-applied.

The event tables are not here. `../src/main/resources/schema.sql` owns those (`events`, `ingestion_runs`, `la_window_start()`, `get_dashboard_events()`) and the ingest job re-applies it on every run.

| # | File | What it does |
| --- | --- | --- |
| 001 | `001_plans_edit_key.sql` | First attempt at plan edit keys. **Historical, do not run**: it was rolled back and redone in 004 |
| 002 | `002_drop_legacy_upsert_plan.sql` | Drops the old `upsert_plan` that let anyone overwrite a plan by its slug |
| 003 | `003_groups.sql` | `groups`, `group_members`, `custom_events`, `rate_limits` and their functions |
| 004 | `004_reconcile_001_and_fix_003.sql` | Plan edit keys done properly, plus fixes to 003, in one transaction |
| 005 | `005_fix_returns_table_column_ambiguity.sql` | Fixes an ambiguous-column error in the `RETURNS TABLE` functions |
| 007 | `007_custom_event_url_and_meeting_types.sql` | Custom events get a URL and more meeting types |

The live schema is 002 + 003 + 004 + 005 + 007. Number 006 is reserved for one pending cleanup: once the old `legacy-locked` plans are deleted, tighten the edit-key check so that value can never be written again:

```sql
DELETE FROM plans WHERE edit_key = 'legacy-locked';
ALTER TABLE plans DROP CONSTRAINT plans_edit_key_shape;
ALTER TABLE plans ADD  CONSTRAINT plans_edit_key_shape CHECK (edit_key ~ '^[a-f0-9]{32,64}$');
```

Every group table has Row Level Security on and no policies, so the public anon key can't reach them; only the Vercel functions can, with the service-role key.
