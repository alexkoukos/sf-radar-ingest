package com.sfradar.ingest.store;

import com.sfradar.ingest.model.Category;
import com.sfradar.ingest.model.ClassifiedEvent;
import com.sfradar.ingest.model.RsvpType;
import com.sfradar.ingest.model.ScoredEvent;
import com.sfradar.ingest.run.RunSummary;
import com.sfradar.ingest.run.TargetOutcome;
import com.sfradar.ingest.source.RawEvent;
import org.junit.jupiter.api.Test;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Runs against a real Postgres container rather than mocking JDBC, matching
 * how HttpEmbeddedEventSourceTest exercises a real local HTTP server instead
 * of mocking the client.
 */
@Testcontainers
class PostgresEventStoreTest {

    @Container
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16-alpine");

    @Test
    void upsertInsertsAQueryableRow() throws SQLException {
        try (Connection connection = newConnection()) {
            PostgresEventStore store = new PostgresEventStore(connection);
            store.ensureSchema();

            store.upsertAll(List.of(scoredEvent("evt-insert", "Founder Mixer")));

            try (Statement statement = connection.createStatement();
                 ResultSet rs = statement.executeQuery(
                     "SELECT name, category, rsvp_type, city, is_free, price_cents, score "
                         + "FROM events WHERE api_id = 'evt-insert'")) {
                assertTrue(rs.next());
                assertEquals("Founder Mixer", rs.getString("name"));
                assertEquals("FOUNDER_SOCIAL", rs.getString("category"));
                assertEquals("OPEN", rs.getString("rsvp_type"));
                assertEquals("San Francisco", rs.getString("city"));
                assertFalse(rs.getBoolean("is_free"));
                assertEquals(2500, rs.getInt("price_cents"));
                assertEquals(0.5, rs.getDouble("score"), 0.0001);
                assertFalse(rs.next());
            }
        }
    }

    @Test
    void reUpsertingTheSameApiIdUpdatesInPlaceRatherThanDuplicating() throws SQLException {
        try (Connection connection = newConnection()) {
            PostgresEventStore store = new PostgresEventStore(connection);
            store.ensureSchema();

            store.upsertAll(List.of(scoredEvent("evt-update", "Original Name")));
            store.upsertAll(List.of(scoredEvent("evt-update", "Renamed Event")));

            try (Statement statement = connection.createStatement();
                 ResultSet rs = statement.executeQuery(
                     "SELECT name, first_seen_at, last_seen_at FROM events WHERE api_id = 'evt-update'")) {
                assertTrue(rs.next());
                assertEquals("Renamed Event", rs.getString("name"));
                assertTrue(rs.getTimestamp("last_seen_at").compareTo(rs.getTimestamp("first_seen_at")) >= 0);
                assertFalse(rs.next());
            }

            try (Statement statement = connection.createStatement();
                 ResultSet rs = statement.executeQuery(
                     "SELECT count(*) FROM events WHERE api_id = 'evt-update'")) {
                rs.next();
                assertEquals(1, rs.getInt(1));
            }
        }
    }

    @Test
    void recordRunPersistsAnObservableRowEvenWhenNotPersistedToEvents() throws SQLException {
        try (Connection connection = newConnection()) {
            PostgresEventStore store = new PostgresEventStore(connection);
            store.ensureSchema();

            RunSummary summary = new RunSummary(
                List.of(TargetOutcome.failure("discover:sf", true, "__NEXT_DATA__ script tag not found")), 0);
            store.recordRun(summary, false);

            try (Statement statement = connection.createStatement();
                 ResultSet rs = statement.executeQuery(
                     "SELECT status, total_events, persisted, source_summary FROM ingestion_runs")) {
                assertTrue(rs.next());
                assertEquals("failed", rs.getString("status"));
                assertEquals(0, rs.getInt("total_events"));
                assertFalse(rs.getBoolean("persisted"));
                assertTrue(rs.getString("source_summary").contains("__NEXT_DATA__"));
                assertFalse(rs.next());
            }
        }
    }

    @Test
    void laWindowStartIsTodaysMidnightInLosAngeles() throws SQLException {
        try (Connection connection = newConnection()) {
            PostgresEventStore store = new PostgresEventStore(connection);
            store.ensureSchema();

            try (Statement statement = connection.createStatement();
                 ResultSet rs = statement.executeQuery(
                     "SELECT extract(hour from la_window_start() AT TIME ZONE 'America/Los_Angeles') AS la_hour, "
                         + "la_window_start() <= now() AS not_in_future, "
                         + "la_window_start() > now() - interval '24 hours' AS within_last_day")) {
                assertTrue(rs.next());
                assertEquals(0, rs.getInt("la_hour"));
                assertTrue(rs.getBoolean("not_in_future"));
                assertTrue(rs.getBoolean("within_last_day"));
            }
        }
    }

    @Test
    void getDashboardEventsAppliesTimeWindowAndGhostGraceWindow() throws SQLException {
        try (Connection connection = newConnection()) {
            PostgresEventStore store = new PostgresEventStore(connection);
            store.ensureSchema();

            Instant now = Instant.now();
            store.upsertAll(List.of(
                scoredEventStartingAt("in-window-fresh", now),
                scoredEventStartingAt("beyond-window", now.plus(10, ChronoUnit.DAYS))));

            // A third event that's within the time window but hasn't been seen in
            // over 24h - simulates a ghost event that's aged past the grace window.
            store.upsertAll(List.of(scoredEventStartingAt("in-window-stale", now)));
            try (Statement statement = connection.createStatement()) {
                statement.execute(
                    "UPDATE events SET last_seen_at = now() - interval '25 hours' "
                        + "WHERE api_id = 'in-window-stale'");
            }

            try (Statement statement = connection.createStatement();
                 ResultSet rs = statement.executeQuery(
                     "SELECT api_id FROM get_dashboard_events(3) ORDER BY api_id")) {
                assertTrue(rs.next());
                assertEquals("in-window-fresh", rs.getString("api_id"));
                assertFalse(rs.next());
            }
        }
    }

    @Test
    void reUpsertingWithADifferentDiscoveredViaUnionsRatherThanOverwrites() throws SQLException {
        try (Connection connection = newConnection()) {
            PostgresEventStore store = new PostgresEventStore(connection);
            store.ensureSchema();

            store.upsertAll(List.of(scoredEvent("evt-multi-source", "Founder Mixer", "discover:sf")));
            store.upsertAll(List.of(
                scoredEvent("evt-multi-source", "Founder Mixer", "calendar:cal-R9IQUb53FUrolUF")));

            try (Statement statement = connection.createStatement();
                 ResultSet rs = statement.executeQuery(
                     "SELECT discovered_via FROM events WHERE api_id = 'evt-multi-source'")) {
                assertTrue(rs.next());
                assertEquals("calendar:cal-R9IQUb53FUrolUF,discover:sf", rs.getString("discovered_via"));
                assertFalse(rs.next());
            }
        }
    }

    private Connection newConnection() throws SQLException {
        return DriverManager.getConnection(postgres.getJdbcUrl(), postgres.getUsername(), postgres.getPassword());
    }

    private ScoredEvent scoredEvent(String apiId, String name) {
        return scoredEvent(apiId, name, "test");
    }

    private ScoredEvent scoredEvent(String apiId, String name, String discoveredVia) {
        RawEvent raw = new RawEvent(
            apiId, name, "test-event", Instant.EPOCH, Instant.EPOCH.plus(1, ChronoUnit.HOURS), false,
            "Acme Host", "San Francisco", "CA", "SoMa", "US",
            37.7749, -122.4194, false, 2500, true,
            "none", "open", "full", discoveredVia
        );
        return new ScoredEvent(new ClassifiedEvent(raw, Category.FOUNDER_SOCIAL, RsvpType.OPEN), 0.5);
    }

    private ScoredEvent scoredEventStartingAt(String apiId, Instant startsAt) {
        RawEvent raw = new RawEvent(
            apiId, apiId, "test-event", startsAt, startsAt.plus(1, ChronoUnit.HOURS), false,
            "Acme Host", "San Francisco", "CA", "SoMa", "US",
            37.7749, -122.4194, false, 2500, true,
            "none", "open", "full", "test"
        );
        return new ScoredEvent(new ClassifiedEvent(raw, Category.FOUNDER_SOCIAL, RsvpType.OPEN), 0.5);
    }
}
