package com.sfradar.ingest.source.embedded;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sfradar.ingest.source.RawEvent;
import com.sfradar.ingest.util.Log;

import java.io.IOException;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Walks an api.lu.ma cursor-paginated event feed to exhaustion.
 *
 * <p>Each response is {@code {entries:[{event:{...}}], has_more, next_cursor}}
 * - the {@code entries[]} wrapper is the same shape {@link EventShapeMatcher}
 * already pulls events out of on embedded pages, so the same matcher runs
 * over each API page unchanged.
 *
 * <p>Bounded three ways so a misbehaving cursor can never loop forever:
 * a hard page cap, a hard event cap, and bailing the instant a cursor
 * fails to advance or a page returns nothing. A mid-walk HTTP or parse
 * failure is logged at WARN and ends the walk with whatever was gathered so
 * far - the caller's embedded first screen plus any earlier pages are still
 * returned and the target is not failed.
 *
 * <p>All ~16 targets run these walks back to back in one batch, so each page
 * fetch is spaced by a short delay and a 429/503 is retried a couple of
 * times (honouring {@code Retry-After} when present) before the walk gives
 * up - otherwise one burst of rate-limiting silently thins a night's
 * coverage for that run.
 */
public final class LumaEventApiClient {

    private static final String DEFAULT_BASE_URI = "https://api.lu.ma";
    private static final int PAGE_SIZE = 50;
    private static final int MAX_PAGES = 40;
    private static final int MAX_EVENTS = 3000;
    private static final long INTER_PAGE_DELAY_MS = 200;
    private static final int MAX_ATTEMPTS_PER_PAGE = 3;
    private static final long BACKOFF_BASE_MS = 1000;
    private static final long MAX_BACKOFF_MS = 10_000;

    private final HttpClient httpClient;
    private final String userAgent;
    private final ObjectMapper objectMapper;
    private final EventShapeMatcher eventShapeMatcher;
    private final String baseUri;
    private final long interPageDelayMs;

    public LumaEventApiClient(
            HttpClient httpClient,
            String userAgent,
            ObjectMapper objectMapper,
            EventShapeMatcher eventShapeMatcher) {
        this(httpClient, userAgent, objectMapper, eventShapeMatcher, DEFAULT_BASE_URI, INTER_PAGE_DELAY_MS);
    }

    /** Test seam: {@code baseUri} points pagination at a local stub server,
     *  {@code interPageDelayMs} keeps the walk instant under test. */
    public LumaEventApiClient(
            HttpClient httpClient,
            String userAgent,
            ObjectMapper objectMapper,
            EventShapeMatcher eventShapeMatcher,
            String baseUri) {
        this(httpClient, userAgent, objectMapper, eventShapeMatcher, baseUri, 0L);
    }

    public LumaEventApiClient(
            HttpClient httpClient,
            String userAgent,
            ObjectMapper objectMapper,
            EventShapeMatcher eventShapeMatcher,
            String baseUri,
            long interPageDelayMs) {
        this.httpClient = httpClient;
        this.userAgent = userAgent;
        this.objectMapper = objectMapper;
        this.eventShapeMatcher = eventShapeMatcher;
        this.baseUri = baseUri.endsWith("/") ? baseUri.substring(0, baseUri.length() - 1) : baseUri;
        this.interPageDelayMs = interPageDelayMs;
    }

    public List<RawEvent> fetchAll(LumaFeedRef feed, String discoveredVia) {
        Map<String, RawEvent> byApiId = new LinkedHashMap<>();
        String cursor = null;
        String previousCursor = null;
        int pages = 0;

        while (pages < MAX_PAGES && byApiId.size() < MAX_EVENTS) {
            if (pages > 0) {
                sleep(interPageDelayMs);
            }
            String url = pageUrl(feed, cursor);
            JsonNode body;
            try {
                body = getJson(url, discoveredVia);
            } catch (Exception e) {
                Log.warn("pagination for " + discoveredVia + " stopped early after "
                    + pages + " page(s), " + byApiId.size() + " events gathered", e);
                break;
            }
            pages++;

            List<RawEvent> pageEvents = eventShapeMatcher.findEvents(body, discoveredVia);
            for (RawEvent event : pageEvents) {
                byApiId.putIfAbsent(event.apiId(), event);
            }

            boolean hasMore = body.path("has_more").asBoolean(false);
            String nextCursor = text(body.path("next_cursor"));

            if (pageEvents.isEmpty()) {
                Log.warn("pagination for " + discoveredVia + " halted: page " + pages
                    + " returned 0 events" + (hasMore ? " despite has_more=true" : ""));
                break;
            }
            if (!hasMore) {
                break;
            }
            if (nextCursor == null || nextCursor.equals(cursor) || nextCursor.equals(previousCursor)) {
                Log.warn("pagination for " + discoveredVia + " halted: cursor did not advance after page "
                    + pages + " (has_more=true but next_cursor is "
                    + (nextCursor == null ? "absent" : "a repeat") + ")");
                break;
            }
            previousCursor = cursor;
            cursor = nextCursor;
        }

        if (pages >= MAX_PAGES) {
            Log.warn("pagination for " + discoveredVia + " hit the " + MAX_PAGES
                + "-page safety cap; the feed may still have more events");
        }
        return new ArrayList<>(byApiId.values());
    }

    private String pageUrl(LumaFeedRef feed, String cursor) {
        StringBuilder url = new StringBuilder(baseUri).append(feed.path()).append('?');
        boolean first = true;
        for (Map.Entry<String, String> param : feed.selectorParams().entrySet()) {
            if (!first) {
                url.append('&');
            }
            url.append(param.getKey()).append('=').append(encode(param.getValue()));
            first = false;
        }
        url.append("&pagination_limit=").append(PAGE_SIZE);
        if (cursor != null) {
            url.append("&pagination_cursor=").append(encode(cursor));
        }
        return url.toString();
    }

    private JsonNode getJson(String url, String discoveredVia) throws IOException, InterruptedException {
        HttpRequest request = HttpRequest.newBuilder(URI.create(url))
            .header("User-Agent", userAgent)
            .header("Accept", "application/json")
            .timeout(Duration.ofSeconds(30))
            .GET()
            .build();

        for (int attempt = 1; ; attempt++) {
            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            int status = response.statusCode();
            if (status == 200) {
                return objectMapper.readTree(response.body());
            }
            boolean retriable = (status == 429 || status == 503) && attempt < MAX_ATTEMPTS_PER_PAGE;
            if (!retriable) {
                throw new IOException("api.lu.ma returned HTTP " + status + " for " + url);
            }
            long waitMs = Math.min(
                retryAfterMs(response).orElse(BACKOFF_BASE_MS * attempt), MAX_BACKOFF_MS);
            Log.warn("pagination for " + discoveredVia + ": api.lu.ma HTTP " + status
                + " (attempt " + attempt + "/" + MAX_ATTEMPTS_PER_PAGE + "), backing off " + waitMs + "ms");
            sleep(waitMs);
        }
    }

    private static java.util.Optional<Long> retryAfterMs(HttpResponse<?> response) {
        return response.headers().firstValue("retry-after").flatMap(value -> {
            try {
                return java.util.Optional.of(Math.max(0L, Long.parseLong(value.trim()) * 1000L));
            } catch (NumberFormatException ignored) {
                return java.util.Optional.empty();
            }
        });
    }

    private static void sleep(long millis) {
        if (millis <= 0) {
            return;
        }
        try {
            Thread.sleep(millis);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }

    private static String encode(String value) {
        return URLEncoder.encode(value, StandardCharsets.UTF_8);
    }

    private static String text(JsonNode node) {
        return (node != null && node.isTextual() && !node.asText().isBlank()) ? node.asText() : null;
    }
}
