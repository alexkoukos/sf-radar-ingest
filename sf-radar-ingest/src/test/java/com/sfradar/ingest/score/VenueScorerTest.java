package com.sfradar.ingest.score;

import com.sfradar.ingest.source.RawEvent;
import org.junit.jupiter.api.Test;

import java.time.Instant;

import static org.junit.jupiter.api.Assertions.assertEquals;

class VenueScorerTest {

    private final VenueScorer scorer = new VenueScorer();

    @Test
    void inPersonInSanFranciscoScoresHighest() {
        assertEquals(1.0, scorer.score(event(false, "San Francisco")), 0.0001);
    }

    @Test
    void inPersonElsewhereInTheBayAreaScoresBelowSanFrancisco() {
        assertEquals(0.5, scorer.score(event(false, "Oakland")), 0.0001);
    }

    @Test
    void inPersonWithNoCityDataScoresLowerStill() {
        assertEquals(0.3, scorer.score(event(false, null)), 0.0001);
    }

    @Test
    void onlineScoresLowestRegardlessOfCity() {
        assertEquals(0.0, scorer.score(event(true, "San Francisco")), 0.0001);
    }

    @Test
    void cityMatchIsCaseInsensitive() {
        assertEquals(1.0, scorer.score(event(false, "san francisco")), 0.0001);
    }

    private RawEvent event(boolean isOnline, String city) {
        return new RawEvent(
            "evt-test", "Test Event", "test-event", Instant.EPOCH, null, isOnline, null,
            city, null, null, null, null, null,
            null, null, null, null, null,
            null, "test"
        );
    }
}
