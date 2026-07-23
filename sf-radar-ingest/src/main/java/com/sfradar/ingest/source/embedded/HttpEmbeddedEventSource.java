package com.sfradar.ingest.source.embedded;

import com.fasterxml.jackson.databind.JsonNode;
import com.sfradar.ingest.source.EventSource;
import com.sfradar.ingest.source.RawEvent;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.List;

/**
 * Fetches a Luma page over HTTP and pulls events out of its embedded
 * __NEXT_DATA__ payload via {@link NextDataExtractor} and
 * {@link EventShapeMatcher}. One instance per target URL in
 * luma-sources.json.
 */
public final class HttpEmbeddedEventSource implements EventSource {

    private final String label;
    private final URI uri;
    private final String userAgent;
    private final HttpClient httpClient;
    private final NextDataExtractor nextDataExtractor;
    private final EventShapeMatcher eventShapeMatcher;

    public HttpEmbeddedEventSource(
            String label,
            String url,
            String userAgent,
            HttpClient httpClient,
            NextDataExtractor nextDataExtractor,
            EventShapeMatcher eventShapeMatcher) {
        this.label = label;
        this.uri = URI.create(url);
        this.userAgent = userAgent;
        this.httpClient = httpClient;
        this.nextDataExtractor = nextDataExtractor;
        this.eventShapeMatcher = eventShapeMatcher;
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
        return eventShapeMatcher.findEvents(nextData, label);
    }
}
