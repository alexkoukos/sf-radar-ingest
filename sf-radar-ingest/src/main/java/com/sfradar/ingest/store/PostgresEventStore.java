package com.sfradar.ingest.store;

import com.sfradar.ingest.model.ClassifiedEvent;
import com.sfradar.ingest.source.RawEvent;

import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.SQLException;
import java.sql.Statement;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;

/**
 * Upserts classified events into Postgres, keyed on Luma's apiId. Re-running
 * ingest against an already-seen event refreshes its fields and
 * last_seen_at while leaving first_seen_at untouched, so repeated runs
 * don't create duplicates.
 */
public final class PostgresEventStore {

    private static final String UPSERT_SQL = """
        INSERT INTO events (
            api_id, name, url_slug, starts_at, ends_at, is_online, host_name,
            city, region, sublocality, country_code, latitude, longitude,
            is_free, price_cents, require_approval, waitlist_status,
            registration_availability, calendar_access_level, discovered_via,
            category, rsvp_type
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT (api_id) DO UPDATE SET
            name = EXCLUDED.name,
            url_slug = EXCLUDED.url_slug,
            starts_at = EXCLUDED.starts_at,
            ends_at = EXCLUDED.ends_at,
            is_online = EXCLUDED.is_online,
            host_name = EXCLUDED.host_name,
            city = EXCLUDED.city,
            region = EXCLUDED.region,
            sublocality = EXCLUDED.sublocality,
            country_code = EXCLUDED.country_code,
            latitude = EXCLUDED.latitude,
            longitude = EXCLUDED.longitude,
            is_free = EXCLUDED.is_free,
            price_cents = EXCLUDED.price_cents,
            require_approval = EXCLUDED.require_approval,
            waitlist_status = EXCLUDED.waitlist_status,
            registration_availability = EXCLUDED.registration_availability,
            calendar_access_level = EXCLUDED.calendar_access_level,
            discovered_via = EXCLUDED.discovered_via,
            category = EXCLUDED.category,
            rsvp_type = EXCLUDED.rsvp_type,
            last_seen_at = now()
        """;

    private final Connection connection;

    public PostgresEventStore(Connection connection) {
        this.connection = connection;
    }

    public void ensureSchema() {
        try (Statement statement = connection.createStatement()) {
            statement.execute(readSchemaSql());
        } catch (SQLException e) {
            throw new IllegalStateException("failed to apply schema", e);
        }
    }

    public void upsertAll(List<ClassifiedEvent> events) {
        try (PreparedStatement ps = connection.prepareStatement(UPSERT_SQL)) {
            for (ClassifiedEvent classified : events) {
                bind(ps, classified);
                ps.addBatch();
            }
            ps.executeBatch();
        } catch (SQLException e) {
            throw new IllegalStateException("failed to upsert events", e);
        }
    }

    private void bind(PreparedStatement ps, ClassifiedEvent classified) throws SQLException {
        RawEvent raw = classified.raw();
        int i = 1;
        ps.setString(i++, raw.apiId());
        ps.setString(i++, raw.name());
        ps.setString(i++, raw.urlSlug());
        ps.setObject(i++, toOffsetDateTime(raw.startsAt()));
        ps.setObject(i++, toOffsetDateTime(raw.endsAt()));
        ps.setBoolean(i++, raw.isOnline());
        ps.setString(i++, raw.hostName());
        ps.setString(i++, raw.city());
        ps.setString(i++, raw.region());
        ps.setString(i++, raw.sublocality());
        ps.setString(i++, raw.countryCode());
        ps.setObject(i++, raw.latitude());
        ps.setObject(i++, raw.longitude());
        ps.setObject(i++, raw.isFree());
        ps.setObject(i++, raw.priceCents());
        ps.setObject(i++, raw.requireApproval());
        ps.setString(i++, raw.waitlistStatus());
        ps.setString(i++, raw.registrationAvailability());
        ps.setString(i++, raw.calendarAccessLevel());
        ps.setString(i++, raw.discoveredVia());
        ps.setString(i++, classified.category().name());
        ps.setString(i, classified.rsvpType().name());
    }

    private static OffsetDateTime toOffsetDateTime(Instant instant) {
        return instant == null ? null : instant.atOffset(ZoneOffset.UTC);
    }

    private static String readSchemaSql() {
        try (InputStream in = PostgresEventStore.class.getResourceAsStream("/schema.sql")) {
            if (in == null) {
                throw new IllegalStateException("schema.sql not found on classpath");
            }
            return new String(in.readAllBytes(), StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }
}
