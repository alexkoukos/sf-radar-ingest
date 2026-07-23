package com.sfradar.ingest;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.sfradar.ingest.classify.EventClassifier;
import com.sfradar.ingest.config.DbConfig;
import com.sfradar.ingest.config.SourcesConfig;
import com.sfradar.ingest.config.SourcesConfigLoader;
import com.sfradar.ingest.model.ClassifiedEvent;
import com.sfradar.ingest.source.EventSource;
import com.sfradar.ingest.source.RawEvent;
import com.sfradar.ingest.source.embedded.EventShapeMatcher;
import com.sfradar.ingest.source.embedded.HttpEmbeddedEventSource;
import com.sfradar.ingest.source.embedded.NextDataExtractor;
import com.sfradar.ingest.store.PostgresEventStore;

import java.net.http.HttpClient;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.SQLException;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * Entry point: reads luma-sources.json, fetches every target over HTTP,
 * classifies each event's category and RSVP type, persists the results to
 * Postgres, and prints per-source counts plus a category/RSVP breakdown.
 * One failing source is logged and skipped rather than aborting the whole
 * run.
 */
public final class Main {

    public static void main(String[] args) throws SQLException {
        ObjectMapper objectMapper = new ObjectMapper();
        SourcesConfig config = new SourcesConfigLoader(objectMapper).loadFromClasspath("/luma-sources.json");

        HttpClient httpClient = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(10))
            .build();
        NextDataExtractor nextDataExtractor = new NextDataExtractor(objectMapper);
        EventShapeMatcher eventShapeMatcher = new EventShapeMatcher();
        EventClassifier classifier = new EventClassifier();

        List<EventSource> sources = config.targets().stream()
            .<EventSource>map(target -> new HttpEmbeddedEventSource(
                target.label(), target.url(), config.userAgent(),
                httpClient, nextDataExtractor, eventShapeMatcher))
            .toList();

        List<ClassifiedEvent> allEvents = new ArrayList<>();
        for (EventSource source : sources) {
            try {
                List<RawEvent> events = source.fetch();
                System.out.println(source.label() + ": " + events.size() + " events");
                events.stream().map(classifier::classify).forEach(allEvents::add);
            } catch (Exception e) {
                System.err.println(source.label() + ": FAILED - " + e.getMessage());
            }
        }

        System.out.println("Total events ingested: " + allEvents.size());
        printBreakdown("By category", allEvents, e -> e.category().name());
        printBreakdown("By RSVP type", allEvents, e -> e.rsvpType().name());

        DbConfig dbConfig = DbConfig.fromEnv();
        try (Connection connection = DriverManager.getConnection(
                dbConfig.jdbcUrl(), dbConfig.user(), dbConfig.password())) {
            PostgresEventStore store = new PostgresEventStore(connection);
            store.ensureSchema();
            store.upsertAll(allEvents);
            System.out.println("Persisted " + allEvents.size() + " events to Postgres");
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
