package com.sfradar.ingest.score;

import com.sfradar.ingest.model.ClassifiedEvent;
import com.sfradar.ingest.model.ScoredEvent;

/**
 * Combines keyword, venue, and accessibility relevance into one
 * time-invariant score, averaged co-equally - accessibility is a
 * first-class signal here, not a tiebreaker layered on top of the other
 * two (see CLAUDE.md). HostScorer is deliberately absent: it's on the cut
 * list, so every host defaults to equal weight rather than being tiered.
 */
public final class EventScorer {

    private final KeywordScorer keywordScorer = new KeywordScorer();
    private final VenueScorer venueScorer = new VenueScorer();
    private final AccessibilityScorer accessibilityScorer = new AccessibilityScorer();

    public ScoredEvent score(ClassifiedEvent event) {
        double keyword = keywordScorer.score(event.category());
        double venue = venueScorer.score(event.raw());
        double accessibility = accessibilityScorer.score(event);
        return new ScoredEvent(event, (keyword + venue + accessibility) / 3.0);
    }
}
