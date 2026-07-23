package com.sfradar.ingest.store;

import com.sfradar.ingest.model.Category;
import com.sfradar.ingest.model.ClassifiedEvent;
import com.sfradar.ingest.model.RsvpType;
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

            store.upsertAll(List.of(classifiedEvent("evt-insert", "Founder Mixer")));

            try (Statement statement = connection.createStatement();
                 ResultSet rs = statement.executeQuery(
                     "SELECT name, category, rsvp_type, city, is_free, price_cents "
                         + "FROM events WHERE api_id = 'evt-insert'")) {
                assertTrue(rs.next());
                assertEquals("Founder Mixer", rs.getString("name"));
                assertEquals("FOUNDER_SOCIAL", rs.getString("category"));
                assertEquals("OPEN", rs.getString("rsvp_type"));
                assertEquals("San Francisco", rs.getString("city"));
                assertFalse(rs.getBoolean("is_free"));
                assertEquals(2500, rs.getInt("price_cents"));
                assertFalse(rs.next());
            }
        }
    }

    @Test
    void reUpsertingTheSameApiIdUpdatesInPlaceRatherThanDuplicating() throws SQLException {
        try (Connection connection = newConnection()) {
            PostgresEventStore store = new PostgresEventStore(connection);
            store.ensureSchema();

            store.upsertAll(List.of(classifiedEvent("evt-update", "Original Name")));
            store.upsertAll(List.of(classifiedEvent("evt-update", "Renamed Event")));

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

    private Connection newConnection() throws SQLException {
        return DriverManager.getConnection(postgres.getJdbcUrl(), postgres.getUsername(), postgres.getPassword());
    }

    private ClassifiedEvent classifiedEvent(String apiId, String name) {
        RawEvent raw = new RawEvent(
            apiId, name, "test-event", Instant.EPOCH, Instant.EPOCH.plus(1, ChronoUnit.HOURS), false,
            "Acme Host", "San Francisco", "CA", "SoMa", "US",
            37.7749, -122.4194, false, 2500, true,
            "none", "open", "full", "test"
        );
        return new ClassifiedEvent(raw, Category.FOUNDER_SOCIAL, RsvpType.OPEN);
    }
}
