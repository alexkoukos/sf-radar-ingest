package com.sfradar.ingest.source.embedded;

import com.fasterxml.jackson.databind.JsonNode;
import com.sfradar.ingest.source.EventSource;
import com.sfradar.ingest.source.RawEvent;
import com.sfradar.ingest.util.Log;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * Fetches a Luma page over HTTP and pulls events out of its embedded
 * {@code __NEXT_DATA__} payload via {@link NextDataExtractor} and
 * {@link EventShapeMatcher}, then follows the page's cursor-paginated
 * api.lu.ma feed via {@link LumaEventApiClient} to pick up every event past
 * the ~20 Luma server-renders into the page. One instance per target URL in
 * luma-sources.json.
 *
 * <p>The embedded first screen is still read first and on its own terms: if
 * the feed can't be identified or the API walk fails partway, whatever was
 * embedded (plus any pages that did come back) is still returned rather than
 * failing the target.
 */
public final class HttpEmbeddedEventSource implements EventSource {

    private final String label;
    private final URI uri;
    private final String userAgent;
    private final HttpClient httpClient;
    private final NextDataExtractor nextDataExtractor;
    private final EventShapeMatcher eventShapeMatcher;
    private final LumaEventApiClient apiClient;

    public HttpEmbeddedEventSource(
            String label,
            String url,
            String userAgent,
            HttpClient httpClient,
            NextDataExtractor nextDataExtractor,
            EventShapeMatcher eventShapeMatcher,
            LumaEventApiClient apiClient) {
        this.label = label;
        this.uri = URI.create(url);
        this.userAgent = userAgent;
        this.httpClient = httpClient;
        this.nextDataExtractor = nextDataExtractor;
        this.eventShapeMatcher = eventShapeMatcher;
        this.apiClient = apiClient;
    }

    @Override
    public String label() {
        return label;
    }

    @Override
    public List<RawEvent> fetch() throws IOException, InterruptedException {
        HttpRequest request = HttpRequest.newBuilder(uri)
            .header("User-Agent", userAgent)
            .header("Accept", "text/html")
            .timeout(Duration.ofSeconds(30))
            .GET()
            .build();

        HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
        if (response.statusCode() != 200) {
            throw new IOException(
                "fetching " + label + " (" + uri + ") returned HTTP " + response.statusCode());
        }

        JsonNode nextData = nextDataExtractor.extract(response.body());
        List<RawEvent> embedded = eventShapeMatcher.findEvents(nextData, label);

        Map<String, RawEvent> byApiId = new LinkedHashMap<>();
        for (RawEvent event : embedded) {
            byApiId.putIfAbsent(event.apiId(), event);
        }

        Optional<LumaFeedRef> feed = LumaFeedRef.fromNextData(nextData);
        if (feed.isEmpty()) {
            Log.warn(label + ": no paginated feed found in __NEXT_DATA__ (kind/api_id moved?); "
                + "using only the " + embedded.size() + " server-rendered events");
            return new ArrayList<>(byApiId.values());
        }

        int embeddedUnique = byApiId.size();
        List<RawEvent> paged = apiClient.fetchAll(feed.get(), label);
        for (RawEvent event : paged) {
            byApiId.putIfAbsent(event.apiId(), event);
        }
        int gainedFromPagination = byApiId.size() - embeddedUnique;

        Log.info(label + ": " + embeddedUnique + " embedded + " + paged.size()
            + " from " + feed.get().kind() + " API -> " + byApiId.size()
            + " unique (" + gainedFromPagination + " added by pagination)");

        return new ArrayList<>(byApiId.values());
    }
}
