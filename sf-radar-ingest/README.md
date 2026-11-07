# SF Radar ingest job

The Java 21 batch job behind [SF Radar](../README.md): fetch the curated Luma pages, pull the events out of each page's embedded `__NEXT_DATA__` JSON, dedupe them by Luma's `api_id`, score them, upsert them into Postgres, and exit. It runs every 6 hours from [GitHub Actions](../.github/workflows/ingest.yml) and is never a server.

How events are found, scored and kept is explained in the [project README](../README.md#data-source).

## Run

```bash
export SFRADAR_DB_URL=jdbc:postgresql://…   # Supabase session pooler
export SFRADAR_DB_USER=… SFRADAR_DB_PASSWORD=…
./mvnw package && java -jar target/sf-radar-ingest.jar
./mvnw test                                 # no database needed
```

## Code

| Package | Does |
| --- | --- |
| `source/` | Fetches each page in `luma-sources.json` and finds every event-shaped object in its `__NEXT_DATA__` |
| `dedupe/` | Merges the same `api_id` seen on several pages, keeping every page it came from |
| `classify/` | Category from the title, RSVP type from Luma's registration fields |
| `score/` | `score = (keyword + venue + accessibility) / 3` |
| `store/` | Re-applies `schema.sql`, then upserts the run's events |
| `run/` | The run's outcome: per-page results, the total-failure gate that skips the upsert, and a coverage check that flags a scraper quietly returning too few events |

Tests use saved Luma pages (`src/test/resources/`) as fixtures, so they run offline.

## Folders

- `src/main/resources/schema.sql`: the event tables and the dashboard's one RPC, applied on every run.
- `migrations/`: hand-run SQL for shared plans and trip groups. See its [README](migrations/README.md).
- `sf-radar-web/`: the web app. See its [README](sf-radar-web/README.md).
