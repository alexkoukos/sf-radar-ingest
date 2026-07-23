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
    void fetchesAndExtractsEventsOverHttp() throws Exception {
        byte[] body = readFixture().getBytes(StandardCharsets.UTF_8);
        server.createContext("/sf", exchange -> {
            exchange.getResponseHeaders().add("Content-Type", "text/html; charset=utf-8");
            exchange.sendResponseHeaders(200, body.length);
            try (OutputStream out = exchange.getResponseBody()) {
                out.write(body);
            }
        });

        HttpEmbeddedEventSource source = newSource("discover:sf", "/sf");

        List<RawEvent> events = source.fetch();

        assertEquals("discover:sf", source.label());
        assertTrue(events.size() >= 20, "expected at least 20 events, found " + events.size());
        assertTrue(events.stream().allMatch(e -> "discover:sf".equals(e.discoveredVia())));
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
        return new HttpEmbeddedEventSource(
            label, url, "SFRadarBot/1.0 (test)",
            HttpClient.newHttpClient(), new NextDataExtractor(new ObjectMapper()), new EventShapeMatcher());
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
