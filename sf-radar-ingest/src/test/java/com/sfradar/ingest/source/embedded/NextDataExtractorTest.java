package com.sfradar.ingest.source.embedded;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sfradar.ingest.source.RawEvent;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Schema canary: pins the extractor against a FROZEN real response captured
 * from luma.com/sf during planning (never a live network call). If Luma
 * renames or restructures any of these fields, this test fails at build
 * time instead of the scorer silently defaulting everything to "unknown".
 */
class NextDataExtractorTest {

    private static final String FIXTURE = "/luma-discover-sf-sample.html";
    private static final String KNOWN_EVENT_API_ID = "evt-DWgDH950AgjZ4DS";

    @Test
    void extractsAtLeastTwentyEventsFromTheFrozenDiscoverFixture() {
        List<RawEvent> events = extractFromFixture();
        assertTrue(events.size() >= 20,
            "expected at least 20 events from the frozen fixture, found " + events.size());
    }

    @Test
    void knownEventHasCorrectlyTypedSignatureAndAccessibilityFields() {
        List<RawEvent> events = extractFromFixture();
        RawEvent known = findByApiId(events, KNOWN_EVENT_API_ID);

        assertEquals("Daytona & ZeroClick AI GTM Breakfast - SF, July 2026 @Corgi Cafe", known.name());
        assertEquals("gtm-breakfast-sf", known.urlSlug());
        assertEquals(Instant.parse("2026-07-23T16:00:00.000Z"), known.startsAt());
        assertEquals(Instant.parse("2026-07-23T18:00:00.000Z"), known.endsAt());
        assertFalse(known.isOnline());

        assertEquals("San Francisco", known.city());
        assertEquals("California", known.region());
        assertEquals("Union Square", known.sublocality());
        assertEquals("US", known.countryCode());
        assertTrue(known.latitude() != null && known.latitude() > 37.7 && known.latitude() < 37.9);
        assertTrue(known.longitude() != null && known.longitude() < -122.3 && known.longitude() > -122.5);

        assertEquals(Boolean.FALSE, known.isFree());
        assertEquals(Boolean.TRUE, known.requireApproval());
        assertEquals("disabled", known.waitlistStatus());
        assertEquals("open", known.registrationAvailability());

        assertEquals("Daytona", known.hostName());
    }

    @Test
    void everyExtractedEventHasNonNullSignatureFields() {
        List<RawEvent> events = extractFromFixture();
        for (RawEvent event : events) {
            assertTrue(event.apiId() != null && !event.apiId().isBlank(), "apiId must not be blank");
            assertTrue(event.name() != null && !event.name().isBlank(), "name must not be blank");
            assertTrue(event.urlSlug() != null && !event.urlSlug().isBlank(), "urlSlug must not be blank");
            assertTrue(event.startsAt() != null, "startsAt must not be null");
        }
    }

    private RawEvent findByApiId(List<RawEvent> events, String apiId) {
        Optional<RawEvent> match = events.stream().filter(e -> apiId.equals(e.apiId())).findFirst();
        assertTrue(match.isPresent(), "expected to find event with api_id " + apiId + " in the frozen fixture");
        return match.get();
    }

    private List<RawEvent> extractFromFixture() {
        String html = readFixture();
        JsonNode nextData = new NextDataExtractor(new ObjectMapper()).extract(html);
        return new EventShapeMatcher().findEvents(nextData, "discover:sf");
    }

    private String readFixture() {
        try (InputStream in = getClass().getResourceAsStream(FIXTURE)) {
            if (in == null) {
                throw new IllegalStateException("fixture not found on classpath: " + FIXTURE);
            }
            return new String(in.readAllBytes(), StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }
}
