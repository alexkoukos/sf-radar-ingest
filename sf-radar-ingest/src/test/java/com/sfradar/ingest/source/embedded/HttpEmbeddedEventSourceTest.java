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
import java.nio.charset.StandardCharsets;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Exercises HttpEmbeddedEventSource against a local HttpServer serving the
 * same frozen fixture NextDataExtractorTest uses, instead of a live network
 * call to luma.com.
 */
class HttpEmbeddedEventSourceTest {

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
    void fetchesTheEmbeddedScreenThenPaginatesTheRestOverHttp() throws Exception {
        byte[] body = readFixture().getBytes(StandardCharsets.UTF_8);
        server.createContext("/sf", exchange -> {
            exchange.getResponseHeaders().add("Content-Type", "text/html; charset=utf-8");
            exchange.sendResponseHeaders(200, body.length);
            try (OutputStream out = exchange.getResponseBody()) {
                out.write(body);
            }
        });
        serveDiscoverApi();

        HttpEmbeddedEventSource source = newSource("discover:sf", "/sf");

        List<RawEvent> events = source.fetch();

        assertEquals("discover:sf", source.label());
        // 20 embedded in the frozen HTML + 91 across the two frozen API pages.
        assertTrue(events.size() >= 90,
            "embedded screen should be merged with the full paginated feed, found " + events.size());
        assertTrue(events.stream().allMatch(e -> "discover:sf".equals(e.discoveredVia())));
        assertEquals(events.size(), events.stream().map(RawEvent::apiId).distinct().count(),
            "merge of embedded + paginated must be de-duplicated by api_id");
    }

    @Test
    void stillReturnsTheEmbeddedScreenWhenPaginationIsUnavailable() throws Exception {
        byte[] body = readFixture().getBytes(StandardCharsets.UTF_8);
        server.createContext("/sf", exchange -> {
            exchange.getResponseHeaders().add("Content-Type", "text/html; charset=utf-8");
            exchange.sendResponseHeaders(200, body.length);
            try (OutputStream out = exchange.getResponseBody()) {
                out.write(body);
            }
        });
        server.createContext("/discover/get-paginated-events", exchange -> {
            exchange.sendResponseHeaders(500, -1);
            exchange.close();
        });

        List<RawEvent> events = newSource("discover:sf", "/sf").fetch();

        assertTrue(events.size() >= 20, "the embedded 20 survive a dead pagination API, found " + events.size());
    }

    @Test
    void throwsWhenResponseIsNotOk() {
        server.createContext("/missing", exchange -> exchange.sendResponseHeaders(404, -1));

        HttpEmbeddedEventSource source = newSource("broken", "/missing");

        IOException ex = assertThrows(IOException.class, source::fetch);
        assertTrue(ex.getMessage().contains("404"));
    }

    private HttpEmbeddedEventSource newSource(String label, String path) {
        String url = "http://localhost:" + server.getAddress().getPort() + path;
        String baseUri = "http://localhost:" + server.getAddress().getPort();
        HttpClient httpClient = HttpClient.newHttpClient();
        ObjectMapper objectMapper = new ObjectMapper();
        EventShapeMatcher matcher = new EventShapeMatcher();
        LumaEventApiClient apiClient = new LumaEventApiClient(
            httpClient, "SFRadarBot/1.0 (test)", objectMapper, matcher, baseUri);
        return new HttpEmbeddedEventSource(
            label, url, "SFRadarBot/1.0 (test)",
            httpClient, new NextDataExtractor(objectMapper), matcher, apiClient);
    }

    private void serveDiscoverApi() {
        server.createContext("/discover/get-paginated-events", exchange -> {
            String query = exchange.getRequestURI().getQuery();
            boolean firstPage = query == null || !query.contains("pagination_cursor=");
            byte[] body = readBinaryFixture(firstPage
                ? "/luma-api-discover-sf-page1.json"
                : "/luma-api-discover-sf-page2.json");
            exchange.getResponseHeaders().add("Content-Type", "application/json");
            exchange.sendResponseHeaders(200, body.length);
            try (OutputStream out = exchange.getResponseBody()) {
                out.write(body);
            }
        });
    }

    private byte[] readBinaryFixture(String path) {
        try (InputStream in = getClass().getResourceAsStream(path)) {
            if (in == null) {
                throw new IllegalStateException("fixture not found on classpath: " + path);
            }
            return in.readAllBytes();
        } catch (IOException e) {
            throw new RuntimeException(e);
        }
    }

    private String readFixture() throws IOException {
        try (InputStream in = getClass().getResourceAsStream("/luma-discover-sf-sample.html")) {
            if (in == null) {
                throw new IllegalStateException("fixture not found on classpath: /luma-discover-sf-sample.html");
            }
            return new String(in.readAllBytes(), StandardCharsets.UTF_8);
        }
    }
}
