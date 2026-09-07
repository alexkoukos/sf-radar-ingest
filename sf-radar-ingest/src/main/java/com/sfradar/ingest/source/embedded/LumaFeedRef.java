package com.sfradar.ingest.source.embedded;

import com.fasterxml.jackson.databind.JsonNode;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;

/**
 * Identifies the api.lu.ma feed that a Luma page's first screen of events is
 * only a truncated view of.
 *
 * <p>Luma server-renders just the first ~20 upcoming events of any page into
 * {@code __NEXT_DATA__}; the remainder are fetched client-side from a
 * cursor-paginated JSON API. Before the Sept 2026 fix the scraper read only
 * that embedded first screen, so every event more than a few days out was
 * silently never seen (the "10 of 14 nights" regression). This record pulls
 * the feed's kind and id out of the embedded payload so
 * {@link LumaEventApiClient} can walk the rest.
 *
 * <p>{@code initialData.kind} is {@code "discover-place"} on
 * {@code luma.com/<city>} and {@code "calendar"} on community calendar
 * pages; the id sits at {@code data.place.api_id} or
 * {@code data.calendar.api_id}. {@link #fromNextData} returns empty rather
 * than throwing when it can't find either - a page we can't paginate still
 * contributes its embedded first screen.
 */
public record LumaFeedRef(Kind kind, String id) {

    public enum Kind {
        DISCOVER_PLACE,
        CALENDAR
    }

    public static Optional<LumaFeedRef> fromNextData(JsonNode nextData) {
        JsonNode data = nextData
            .path("props").path("pageProps").path("initialData").path("data");
        String kind = text(nextData
            .path("props").path("pageProps").path("initialData").path("kind"));

        String placeId = text(data.path("place").path("api_id"));
        String calendarId = text(data.path("calendar").path("api_id"));

        // Prefer the declared kind; fall back to sniffing the id prefix so a
        // renamed "kind" field alone doesn't disable pagination.
        if ("discover-place".equals(kind) && placeId != null) {
            return Optional.of(new LumaFeedRef(Kind.DISCOVER_PLACE, placeId));
        }
        if ("calendar".equals(kind) && calendarId != null) {
            return Optional.of(new LumaFeedRef(Kind.CALENDAR, calendarId));
        }
        if (placeId != null && placeId.startsWith("discplace-")) {
            return Optional.of(new LumaFeedRef(Kind.DISCOVER_PLACE, placeId));
        }
        if (calendarId != null && calendarId.startsWith("cal-")) {
            return Optional.of(new LumaFeedRef(Kind.CALENDAR, calendarId));
        }
        return Optional.empty();
    }

    /** Path component of the api.lu.ma endpoint for this feed kind. */
    public String path() {
        return switch (kind) {
            case DISCOVER_PLACE -> "/discover/get-paginated-events";
            case CALENDAR -> "/calendar/get-items";
        };
    }

    /** Query params that select this feed, before pagination params are added. */
    public Map<String, String> selectorParams() {
        Map<String, String> params = new LinkedHashMap<>();
        switch (kind) {
            case DISCOVER_PLACE -> params.put("discover_place_api_id", id);
            case CALENDAR -> {
                params.put("calendar_api_id", id);
                params.put("period", "future");
            }
        }
        return params;
    }

    private static String text(JsonNode node) {
        return (node != null && node.isTextual() && !node.asText().isBlank())
            ? node.asText() : null;
    }
}
