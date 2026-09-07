package com.sfradar.ingest;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.sfradar.ingest.classify.EventClassifier;
import com.sfradar.ingest.config.DbConfig;
import com.sfradar.ingest.config.SourcesConfig;
import com.sfradar.ingest.config.SourcesConfigLoader;
import com.sfradar.ingest.dedupe.EventDeduper;
import com.sfradar.ingest.model.ClassifiedEvent;
import com.sfradar.ingest.model.ScoredEvent;
import com.sfradar.ingest.run.RunSummary;
import com.sfradar.ingest.run.SanityReport;
import com.sfradar.ingest.run.TargetOutcome;
import com.sfradar.ingest.score.EventScorer;
import com.sfradar.ingest.source.EventSource;
import com.sfradar.ingest.source.RawEvent;
import com.sfradar.ingest.source.embedded.EventShapeMatcher;
import com.sfradar.ingest.source.embedded.HttpEmbeddedEventSource;
import com.sfradar.ingest.source.embedded.LumaEventApiClient;
import com.sfradar.ingest.source.embedded.NextDataExtractor;
import com.sfradar.ingest.source.embedded.NextDataShapeException;
import com.sfradar.ingest.store.PostgresEventStore;
import com.sfradar.ingest.util.Log;

import java.net.http.HttpClient;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.SQLException;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * Entry point: reads luma-sources.json, fetches every target over HTTP,
 * classifies each event's category and RSVP type, collapses duplicates
 * found via more than one target, scores what's left, persists the results
 * to Postgres, and prints per-source counts plus a category/RSVP breakdown.
 * A single target's ordinary failure (network error, non-200) is logged
 * and skipped rather than aborting the run. A total failure - zero events
 * across every target, or any target's structural shape-match break -
 * skips the upsert entirely and exits non-zero; every run is recorded to
 * ingestion_runs either way.
 */
public final class Main {

    /** Matches the frontend's 14-night stay window - the span the coverage
     *  check in {@link SanityReport} is measured against. */
    private static final int SANITY_WINDOW_DAYS = 14;

    public static void main(String[] args) throws SQLException {
        ObjectMapper objectMapper = new ObjectMapper();
        SourcesConfig config = new SourcesConfigLoader(objectMapper).loadFromClasspath("/luma-sources.json");

        HttpClient httpClient = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(10))
            // Luma vanity slugs 302 to a canonical slug when a calendar is
            // renamed (e.g. sf-builders-collective -> sf-hackersquad). Follow
            // it so a rename degrades to "still scraped" instead of a dead target.
            .followRedirects(HttpClient.Redirect.NORMAL)
            .build();
        NextDataExtractor nextDataExtractor = new NextDataExtractor(objectMapper);
        EventShapeMatcher eventShapeMatcher = new EventShapeMatcher();
        LumaEventApiClient apiClient = new LumaEventApiClient(
            httpClient, config.userAgent(), objectMapper, eventShapeMatcher);
        EventClassifier classifier = new EventClassifier();

        List<EventSource> sources = config.targets().stream()
            .<EventSource>map(target -> new HttpEmbeddedEventSource(
                target.label(), target.url(), config.userAgent(),
                httpClient, nextDataExtractor, eventShapeMatcher, apiClient))
            .toList();

        List<ClassifiedEvent> allEvents = new ArrayList<>();
        List<TargetOutcome> outcomes = new ArrayList<>();
        for (EventSource source : sources) {
            try {
                List<RawEvent> events = source.fetch();
                if (events.isEmpty()) {
                    Log.warn(source.label() + ": returned 0 events (HTTP 200, no structural break) - "
                        + "an empty calendar, or a shape change that dodged the signature check");
                } else {
                    Log.info(source.label() + ": " + events.size() + " events");
                }
                events.stream().map(classifier::classify).forEach(allEvents::add);
                outcomes.add(TargetOutcome.success(source.label(), events.size()));
            } catch (NextDataShapeException e) {
                Log.warn(source.label() + ": STRUCTURAL BREAK - " + e.getMessage());
                outcomes.add(TargetOutcome.failure(source.label(), true, e.getMessage()));
            } catch (Exception e) {
                Log.warn(source.label() + ": FAILED, target skipped this run", e);
                outcomes.add(TargetOutcome.failure(source.label(), false, e.getMessage()));
            }
        }

        System.out.println("Total events ingested: " + allEvents.size());

        List<ClassifiedEvent> deduped = new EventDeduper().dedupe(allEvents);
        System.out.println("Unique events after dedupe: " + deduped.size());
        printBreakdown("By category", deduped, e -> e.category().name());
        printBreakdown("By RSVP type", deduped, e -> e.rsvpType().name());

        EventScorer scorer = new EventScorer();
        List<ScoredEvent> scoredEvents = deduped.stream().map(scorer::score).toList();

        SanityReport sanity = SanityReport.of(scoredEvents, Instant.now(), SANITY_WINDOW_DAYS);
        System.out.println(sanity.render());
        if (!sanity.isHealthy()) {
            Log.warn("=== INGEST COVERAGE CHECK FAILED ===");
            sanity.warnings().forEach(w -> Log.warn("  " + w));
            Log.warn("Data was still persisted (a partial shortfall never blocks the upsert), "
                + "but this run looks like the Sept 2026 truncation regression - investigate pagination.");
        }

        RunSummary runSummary = new RunSummary(outcomes, allEvents.size());
        boolean totalFailure = runSummary.isTotalFailure();
        if (totalFailure) {
            System.err.println("Run-level failure (zero events or a structural break) - skipping upsert");
        }

        DbConfig dbConfig = DbConfig.fromEnv();
        try (Connection connection = DriverManager.getConnection(
                dbConfig.jdbcUrl(), dbConfig.user(), dbConfig.password())) {
            PostgresEventStore store = new PostgresEventStore(connection);
            store.ensureSchema();
            if (!totalFailure) {
                store.upsertAll(scoredEvents);
                System.out.println("Persisted " + scoredEvents.size() + " events to Postgres");
                int purged = store.purgePastEvents();
                System.out.println("Purged " + purged + " past events (started more than 2 days ago)");
            }
            store.recordRun(runSummary, !totalFailure);
        }

        if (totalFailure) {
            System.exit(1);
        }
    }

    private static void printBreakdown(
            String heading, List<ClassifiedEvent> events, Function<ClassifiedEvent, String> key) {
        Map<String, Long> counts = events.stream()
            .collect(Collectors.groupingBy(key, TreeMap::new, Collectors.counting()));
        System.out.println(heading + ":");
        counts.forEach((k, count) -> System.out.println("  " + k + ": " + count));
    }
}
