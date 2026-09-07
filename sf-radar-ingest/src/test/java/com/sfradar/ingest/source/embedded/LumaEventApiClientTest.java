package com.sfradar.ingest.source.embedded;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.sfradar.ingest.source.RawEvent;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.http.HttpClient;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Exercises the cursor walk against a local stub serving the two frozen
 * api.lu.ma discover pages (page1 has_more=true, page2 has_more=false but
 * still carries a non-null next_cursor - the exact shape that must stop the
 * walk on has_more, not on a null cursor).
 */
class LumaEventApiClientTest {

    private HttpServer server;

    @BeforeEach
    void startServer() throws IOException {
        server = HttpServer.create(new InetSocketAddress("localhost", 0), 0);
        server.start();
    }

    @AfterEach
    void stopServer() {
        server.stop(0);
    }

    @Test
    void walksEveryPageAndReturnsTheFullDeduplicatedFeed() {
        AtomicInteger calls = new AtomicInteger();
        server.createContext("/discover/get-paginated-events", exchange -> {
            String query = exchange.getRequestURI().getQuery();
            boolean firstPage = query == null || !query.contains("pagination_cursor=");
            calls.incrementAndGet();
            byte[] body = readFixture(firstPage
                ? "/luma-api-discover-sf-page1.json"
                : "/luma-api-discover-sf-page2.json");
            exchange.getResponseHeaders().add("Content-Type", "application/json");
            exchange.sendResponseHeaders(200, body.length);
            try (OutputStream out = exchange.getResponseBody()) {
                out.write(body);
            }
        });

        List<RawEvent> events = newClient().fetchAll(
            new LumaFeedRef(LumaFeedRef.Kind.DISCOVER_PLACE, "discplace-BDj7GNbGlsF7Cka"), "discover:sf");

        assertEquals(2, calls.get(), "should have fetched exactly two pages");
        assertEquals(91, events.size(), "page1 (50) + page2 (41), no overlap");
        assertTrue(events.stream().allMatch(e -> "discover:sf".equals(e.discoveredVia())));
        assertEquals(events.size(), events.stream().map(RawEvent::apiId).distinct().count(),
            "feed must be de-duplicated by api_id");
    }

    @Test
    void retriesA429ThenContinuesTheWalk() {
        AtomicInteger hits = new AtomicInteger();
        server.createContext("/discover/get-paginated-events", exchange -> {
            String query = exchange.getRequestURI().getQuery();
            boolean firstPage = query == null || !query.contains("pagination_cursor=");
            int n = hits.incrementAndGet();
            // Rate-limit the very first request once, then serve normally.
            if (n == 1) {
                exchange.getResponseHeaders().add("Retry-After", "0");
                exchange.sendResponseHeaders(429, -1);
                exchange.close();
                return;
            }
            byte[] body = readFixture(firstPage
                ? "/luma-api-discover-sf-page1.json"
                : "/luma-api-discover-sf-page2.json");
            exchange.getResponseHeaders().add("Content-Type", "application/json");
            exchange.sendResponseHeaders(200, body.length);
            try (OutputStream out = exchange.getResponseBody()) {
                out.write(body);
            }
        });

        List<RawEvent> events = newClient().fetchAll(
            new LumaFeedRef(LumaFeedRef.Kind.DISCOVER_PLACE, "discplace-BDj7GNbGlsF7Cka"), "discover:sf");

        assertEquals(3, hits.get(), "page 1 rejected once + page 1 retried + page 2");
        assertEquals(91, events.size(), "the walk completes despite the initial 429");
    }

    @Test
    void givesUpAfterThreeConsecutive429s() {
        AtomicInteger hits = new AtomicInteger();
        server.createContext("/discover/get-paginated-events", exchange -> {
            hits.incrementAndGet();
            exchange.getResponseHeaders().add("Retry-After", "0");
            exchange.sendResponseHeaders(429, -1);
            exchange.close();
        });

        List<RawEvent> events = newClient().fetchAll(
            new LumaFeedRef(LumaFeedRef.Kind.DISCOVER_PLACE, "discplace-x"), "discover:sf");

        assertEquals(3, hits.get(), "3 attempts on the first page, then the walk gives up");
        assertTrue(events.isEmpty());
    }

    @Test
    void stopsWithoutThrowingWhenApiStartsFailingMidWalk() {
        server.createContext("/discover/get-paginated-events", exchange -> {
            String query = exchange.getRequestURI().getQuery();
            if (query != null && query.contains("pagination_cursor=")) {
                exchange.sendResponseHeaders(500, -1);
                exchange.close();
                return;
            }
            byte[] body = readFixture("/luma-api-discover-sf-page1.json");
            exchange.getResponseHeaders().add("Content-Type", "application/json");
            exchange.sendResponseHeaders(200, body.length);
            try (OutputStream out = exchange.getResponseBody()) {
                out.write(body);
            }
        });

        List<RawEvent> events = newClient().fetchAll(
            new LumaFeedRef(LumaFeedRef.Kind.DISCOVER_PLACE, "discplace-BDj7GNbGlsF7Cka"), "discover:sf");

        assertEquals(50, events.size(), "keeps page 1, drops the walk when page 2 502s");
    }

    @Test
    void calendarFeedHitsTheCalendarEndpoint() {
        AtomicInteger calendarCalls = new AtomicInteger();
        server.createContext("/calendar/get-items", exchange -> {
            calendarCalls.incrementAndGet();
            byte[] body = readFixture("/luma-api-calendar-genai-sf-page1.json");
            exchange.getResponseHeaders().add("Content-Type", "application/json");
            exchange.sendResponseHeaders(200, body.length);
            try (OutputStream out = exchange.getResponseBody()) {
                out.write(body);
            }
        });
        // page1 fixture says has_more=true; the stub always returns the same
        // page, so the cursor never advances and the walk must bail on the
        // repeat rather than loop.
        List<RawEvent> events = newClient().fetchAll(
            new LumaFeedRef(LumaFeedRef.Kind.CALENDAR, "cal-JTdFQadEz0AOxyV"), "calendar:genai-sf");

        assertTrue(calendarCalls.get() >= 1 && calendarCalls.get() <= 3,
            "must not loop forever on a non-advancing cursor, was " + calendarCalls.get());
        assertTrue(events.size() >= 20);
    }

    @Test
    void throwsNothingAndReturnsEmptyWhenTheVeryFirstPageFails() {
        server.createContext("/discover/get-paginated-events", exchange -> {
            exchange.sendResponseHeaders(500, -1);
            exchange.close();
        });

        List<RawEvent> events = newClient().fetchAll(
            new LumaFeedRef(LumaFeedRef.Kind.DISCOVER_PLACE, "discplace-x"), "discover:sf");

        assertTrue(events.isEmpty());
    }

    @Test
    void feedRefBuildsTheExpectedEndpoints() {
        LumaFeedRef discover = new LumaFeedRef(LumaFeedRef.Kind.DISCOVER_PLACE, "discplace-1");
        assertEquals("/discover/get-paginated-events", discover.path());
        assertEquals("discplace-1", discover.selectorParams().get("discover_place_api_id"));

        LumaFeedRef calendar = new LumaFeedRef(LumaFeedRef.Kind.CALENDAR, "cal-1");
        assertEquals("/calendar/get-items", calendar.path());
        assertEquals("cal-1", calendar.selectorParams().get("calendar_api_id"));
        assertEquals("future", calendar.selectorParams().get("period"));
    }

    private LumaEventApiClient newClient() {
        String baseUri = "http://localhost:" + server.getAddress().getPort();
        return new LumaEventApiClient(
            HttpClient.newHttpClient(), "SFRadarBot/1.0 (test)",
            new ObjectMapper(), new EventShapeMatcher(), baseUri);
    }

    @Test
    void unreachableHostIsSwallowedIntoAnEmptyResult() {
        LumaEventApiClient client = new LumaEventApiClient(
            HttpClient.newHttpClient(), "SFRadarBot/1.0 (test)",
            new ObjectMapper(), new EventShapeMatcher(), "http://localhost:1");

        List<RawEvent> events = client.fetchAll(
            new LumaFeedRef(LumaFeedRef.Kind.CALENDAR, "cal-1"), "calendar:x");

        assertTrue(events.isEmpty());
    }

    private static byte[] readFixture(String path) {
        try (InputStream in = LumaEventApiClientTest.class.getResourceAsStream(path)) {
            if (in == null) {
                throw new IllegalStateException("fixture not found on classpath: " + path);
            }
            return in.readAllBytes();
        } catch (IOException e) {
            throw new RuntimeException(e);
        }
    }
}
