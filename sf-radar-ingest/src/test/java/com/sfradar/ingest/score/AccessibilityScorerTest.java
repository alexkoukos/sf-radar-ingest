package com.sfradar.ingest.score;

import com.sfradar.ingest.model.Category;
import com.sfradar.ingest.model.ClassifiedEvent;
import com.sfradar.ingest.model.RsvpType;
import com.sfradar.ingest.source.RawEvent;
import org.junit.jupiter.api.Test;

import java.time.Instant;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class AccessibilityScorerTest {

    private final AccessibilityScorer scorer = new AccessibilityScorer();

    @Test
    void freeAndOpenScoresHighestPossible() {
        assertEquals(1.0, scorer.score(event(true, RsvpType.OPEN)), 0.0001);
    }

    @Test
    void paidAndInviteOnlyScoresLowestPossible() {
        assertEquals(0.0, scorer.score(event(false, RsvpType.INVITE_ONLY)), 0.0001);
    }

    @Test
    void freeOpenMeetupOutscoresPaidInviteOnlyInvestorMixer() {
        double freeOpenMeetup = scorer.score(event(true, RsvpType.OPEN));
        double paidInviteOnlyMixer = scorer.score(event(false, RsvpType.INVITE_ONLY));

        assertTrue(freeOpenMeetup > paidInviteOnlyMixer);
    }

    @Test
    void unknownIsFreeFallsBackToTheMidpoint() {
        assertEquals(0.75, scorer.score(event(null, RsvpType.OPEN)), 0.0001);
    }

    private ClassifiedEvent event(Boolean isFree, RsvpType rsvpType) {
        RawEvent raw = new RawEvent(
            "evt-test", "Test Event", "test-event", Instant.EPOCH, null, false, null,
            null, null, null, null, null, null,
            isFree, null, null, null, null,
            null, "test"
        );
        return new ClassifiedEvent(raw, Category.OTHER, rsvpType);
    }
}
