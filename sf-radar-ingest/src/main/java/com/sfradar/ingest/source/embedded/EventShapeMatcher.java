package com.sfradar.ingest.source.embedded;

import com.fasterxml.jackson.databind.JsonNode;
import com.sfradar.ingest.source.RawEvent;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

/**
 * Walks a parsed __NEXT_DATA__ tree looking for event entries BY SHAPE
 * rather than by a hardcoded key path. This is necessary, not defensive
 * paranoia: discover pages wrap events as {@code data.events[]} while
 * community calendar pages wrap them as {@code featured_items[]} - two
 * different parent shapes around the identical inner event object. An
 * object is treated as an event entry when it has a child field named
 * "event" whose value itself carries the signature fields
 * (api_id, start_at, name, url all non-null text, end_at present).
 *
 * <p>Every field beyond the signature is read null-safe. If a signature
 * field goes missing on closer extraction after having matched the
 * signature check, that is a genuine contradiction (not just "field
 * absent from a non-matching object") and throws
 * {@link NextDataShapeException} naming the field.
 */
public final class EventShapeMatcher {

    public List<RawEvent> findEvents(JsonNode root, String discoveredVia) {
        List<RawEvent> found = new ArrayList<>();
        walk(root, discoveredVia, found);
        return found;
    }

    private void walk(JsonNode node, String discoveredVia, List<RawEvent> found) {
        if (node == null || node.isMissingNode() || node.isNull()) {
            return;
        }
        if (node.isObject()) {
            JsonNode eventNode = node.get("event");
            if (isEventShaped(eventNode)) {
                found.add(extract(node, eventNode, discoveredVia));
            }
            node.fields().forEachRemaining(e -> walk(e.getValue(), discoveredVia, found));
        } else if (node.isArray()) {
            for (JsonNode child : node) {
                walk(child, discoveredVia, found);
            }
        }
    }

    private boolean isEventShaped(JsonNode eventNode) {
        if (eventNode == null || !eventNode.isObject()) {
            return false;
        }
        return hasNonNullText(eventNode, "api_id")
            && hasNonNullText(eventNode, "start_at")
            && hasNonNullText(eventNode, "name")
            && hasNonNullText(eventNode, "url")
            && eventNode.has("end_at");
    }

    private RawEvent extract(JsonNode entry, JsonNode event, String discoveredVia) {
        String apiId = textOrThrow(event, "api_id", "event.api_id");
        String name = textOrThrow(event, "name", "event.name");
        String urlSlug = textOrThrow(event, "url", "event.url");
        Instant startsAt = instantOrThrow(event, "start_at", "event.start_at");
        Instant endsAt = instantOrNull(event, "end_at");
        boolean isOnline = "online".equals(textOrNull(event, "location_type"));

        JsonNode geo = event.get("geo_address_info");
        String city = textOrNull(geo, "city");
        String region = textOrNull(geo, "region");
        String sublocality = textOrNull(geo, "sublocality");
        String countryCode = textOrNull(geo, "country_code");

        JsonNode coordinate = event.get("coordinate");
        Double latitude = doubleOrNull(coordinate, "latitude");
        Double longitude = doubleOrNull(coordinate, "longitude");

        JsonNode hosts = entry.get("hosts");
        String hostName = null;
        if (hosts != null && hosts.isArray() && !hosts.isEmpty()) {
            hostName = textOrNull(hosts.get(0), "name");
        }

        JsonNode ticketInfo = entry.get("ticket_info");
        Boolean isFree = boolOrNull(ticketInfo, "is_free");
        Integer priceCents = null;
        if (ticketInfo != null) {
            JsonNode price = ticketInfo.get("price");
            if (price != null && price.isObject()) {
                priceCents = intOrNull(price, "cents");
            }
        }
        Boolean requireApproval = boolOrNull(ticketInfo, "require_approval");
        String waitlistStatus = textOrNull(event, "waitlist_status");
        String registrationAvailability = textOrNull(entry, "registration_availability");

        JsonNode calendar = entry.get("calendar");
        String calendarAccessLevel = textOrNull(calendar, "access_level");

        return new RawEvent(
            apiId, name, urlSlug, startsAt, endsAt, isOnline, hostName,
            city, region, sublocality, countryCode, latitude, longitude,
            isFree, priceCents, requireApproval, waitlistStatus, registrationAvailability,
            calendarAccessLevel, discoveredVia
        );
    }

    private boolean hasNonNullText(JsonNode node, String field) {
        JsonNode v = node.get(field);
        return v != null && !v.isNull() && v.isTextual() && !v.asText().isBlank();
    }

    private String textOrThrow(JsonNode node, String field, String path) {
        String v = textOrNull(node, field);
        if (v == null) {
            throw new NextDataShapeException(
                "Event matched the signature but '" + path + "' is missing on closer extraction "
                    + "- the signature check and extraction have drifted apart");
        }
        return v;
    }

    private Instant instantOrThrow(JsonNode node, String field, String path) {
        String raw = textOrNull(node, field);
        if (raw == null) {
            throw new NextDataShapeException(
                "Event matched the signature but '" + path + "' is missing on closer extraction");
        }
        try {
            return Instant.parse(raw);
        } catch (Exception e) {
            throw new NextDataShapeException(
                "Event field '" + path + "' is not a parseable ISO-8601 instant: '" + raw + "'", e);
        }
    }

    private Instant instantOrNull(JsonNode node, String field) {
        String raw = textOrNull(node, field);
        if (raw == null) {
            return null;
        }
        try {
            return Instant.parse(raw);
        } catch (Exception e) {
            return null;
        }
    }

    private String textOrNull(JsonNode node, String field) {
        if (node == null) {
            return null;
        }
        JsonNode v = node.get(field);
        return (v != null && v.isTextual()) ? v.asText() : null;
    }

    private Boolean boolOrNull(JsonNode node, String field) {
        if (node == null) {
            return null;
        }
        JsonNode v = node.get(field);
        return (v != null && v.isBoolean()) ? v.asBoolean() : null;
    }

    private Double doubleOrNull(JsonNode node, String field) {
        if (node == null) {
            return null;
        }
        JsonNode v = node.get(field);
        return (v != null && v.isNumber()) ? v.asDouble() : null;
    }

    private Integer intOrNull(JsonNode node, String field) {
        if (node == null) {
            return null;
        }
        JsonNode v = node.get(field);
        return (v != null && v.isNumber()) ? v.asInt() : null;
    }
}
