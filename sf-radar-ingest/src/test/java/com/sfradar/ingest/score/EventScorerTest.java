package com.sfradar.ingest.score;

import com.sfradar.ingest.model.Category;
import com.sfradar.ingest.model.ClassifiedEvent;
import com.sfradar.ingest.model.RsvpType;
import com.sfradar.ingest.model.ScoredEvent;
import com.sfradar.ingest.source.RawEvent;
import org.junit.jupiter.api.Test;

import java.time.Instant;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertTrue;

class EventScorerTest {

    private final EventScorer scorer = new EventScorer();

    @Test
    void scoredEventRetainsTheOriginalClassifiedEvent() {
        ClassifiedEvent classified = event(Category.OTHER, RsvpType.OPEN, true, false, "San Francisco");

        ScoredEvent scored = scorer.score(classified);

        assertSame(classified, scored.classified());
    }

    @Test
    void freeOpenNetworkingMeetupScoresCompetitivelyAgainstAPaidInviteOnlyInvestorMixer() {
        ClassifiedEvent freeOpenMeetup =
            event(Category.GENERAL_NETWORKING, RsvpType.OPEN, true, false, "San Francisco");
        ClassifiedEvent paidInviteOnlyMixer =
            event(Category.INVESTOR_MEETUP, RsvpType.INVITE_ONLY, false, false, "San Francisco");

        double meetupScore = scorer.score(freeOpenMeetup).score();
        double mixerScore = scorer.score(paidInviteOnlyMixer).score();

        assertTrue(meetupScore > mixerScore,
            "accessibility should let the free, open meetup (" + meetupScore
                + ") outscore the paid, invite-only mixer (" + mixerScore + ")");
    }

    @Test
    void scoreIsTheAverageOfKeywordVenueAndAccessibility() {
        ClassifiedEvent classified = event(Category.HACKATHON, RsvpType.OPEN, true, false, "San Francisco");

        double expected = (new KeywordScorer().score(Category.HACKATHON)
            + new VenueScorer().score(classified.raw())
            + new AccessibilityScorer().score(classified)) / 3.0;

        assertEquals(expected, scorer.score(classified).score(), 0.0001);
    }

    private ClassifiedEvent event(
            Category category, RsvpType rsvpType, Boolean isFree, boolean isOnline, String city) {
        RawEvent raw = new RawEvent(
            "evt-test", "Test Event", "test-event", Instant.EPOCH, null, isOnline, null,
            city, null, null, null, null, null,
            isFree, null, null, null, null,
            null, "test"
        );
        return new ClassifiedEvent(raw, category, rsvpType);
    }
}
