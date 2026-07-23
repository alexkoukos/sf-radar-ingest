package com.sfradar.ingest.score;

import com.sfradar.ingest.source.RawEvent;

/**
 * Scores how useful an event's location is for someone physically staying
 * in SF with no local network yet: in-person beats online, and San
 * Francisco itself beats an in-person event elsewhere in the Bay Area
 * that's harder to reach without a car or local knowledge.
 */
public final class VenueScorer {

    public double score(RawEvent raw) {
        if (raw.isOnline()) {
            return 0.0;
        }
        if (isSanFrancisco(raw.city())) {
            return 1.0;
        }
        if (raw.city() != null && !raw.city().isBlank()) {
            return 0.5;
        }
        return 0.3;
    }

    private boolean isSanFrancisco(String city) {
        return city != null && city.strip().equalsIgnoreCase("San Francisco");
    }
}
