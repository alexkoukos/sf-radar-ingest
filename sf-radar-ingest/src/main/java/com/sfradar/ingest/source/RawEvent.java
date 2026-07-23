package com.sfradar.ingest.source;

import java.time.Instant;

/**
 * As scraped from Luma's embedded __NEXT_DATA__ payload, source-shaped and
 * deliberately loose. Every field beyond the signature fields (apiId,
 * startsAt, endsAt, name, urlSlug) may be null - Luma's own data is
 * inconsistently populated across events (e.g. price is sometimes null even
 * when isFree is false).
 */
public record RawEvent(
    String apiId,
    String name,
    String urlSlug,
    Instant startsAt,
    Instant endsAt,
    boolean isOnline,
    String hostName,
    String city,
    String region,
    String sublocality,
    String countryCode,
    Double latitude,
    Double longitude,
    Boolean isFree,
    Integer priceCents,
    Boolean requireApproval,
    String waitlistStatus,
    String registrationAvailability,
    String calendarAccessLevel,
    String discoveredVia
) {

    /** Rebuilds this event with a different discoveredVia - used to union it across targets. */
    public RawEvent withDiscoveredVia(String discoveredVia) {
        return new RawEvent(
            apiId, name, urlSlug, startsAt, endsAt, isOnline, hostName,
            city, region, sublocality, countryCode, latitude, longitude,
            isFree, priceCents, requireApproval, waitlistStatus, registrationAvailability,
            calendarAccessLevel, discoveredVia
        );
    }
}
