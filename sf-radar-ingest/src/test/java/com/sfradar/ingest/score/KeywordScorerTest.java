package com.sfradar.ingest.score;

import com.sfradar.ingest.model.Category;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class KeywordScorerTest {

    private final KeywordScorer scorer = new KeywordScorer();

    @Test
    void investorMeetupScoresHighestAndOtherScoresLowest() {
        assertTrue(scorer.score(Category.INVESTOR_MEETUP) > scorer.score(Category.OTHER));
    }

    @Test
    void everyCategoryHasAnExplicitWeight() {
        for (Category category : Category.values()) {
            assertTrue(scorer.score(category) > 0.0, category + " should have a positive weight");
        }
    }

    @Test
    void weightsAreStableForARepeatCall() {
        assertEquals(scorer.score(Category.HACKATHON), scorer.score(Category.HACKATHON));
    }
}
