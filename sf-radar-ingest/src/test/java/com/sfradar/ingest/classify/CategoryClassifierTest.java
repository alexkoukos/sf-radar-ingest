package com.sfradar.ingest.classify;

import com.sfradar.ingest.model.Category;
import com.sfradar.ingest.source.RawEvent;
import org.junit.jupiter.api.Test;

import java.time.Instant;

import static org.junit.jupiter.api.Assertions.assertEquals;

/**
 * Cases are drawn from real event names seen in the frozen discover:sf
 * fixture (see NextDataExtractorTest), not invented examples.
 */
class CategoryClassifierTest {

    private final CategoryClassifier classifier = new CategoryClassifier();

    @Test
    void matchesHackathonKeyword() {
        assertEquals(Category.HACKATHON, classify("Self-Evolving Agents Hackathon"));
    }

    @Test
    void matchesDemoDayKeyword() {
        assertEquals(Category.DEMO_DAY, classify("Hardware Pitch Night - Summertime Showcase"));
    }

    @Test
    void investorKeywordTakesPriorityOverFounderKeyword() {
        assertEquals(Category.INVESTOR_MEETUP, classify("YC Startup School Founder & Investor Mixer"));
    }

    @Test
    void matchesFounderKeywordWhenNoInvestorKeywordPresent() {
        assertEquals(Category.FOUNDER_SOCIAL, classify("YC Female Founders: Painting & Wine Night"));
    }

    @Test
    void matchesGeneralNetworkingKeyword() {
        assertEquals(Category.GENERAL_NETWORKING, classify("AI Engineering Leaders Dinner/Networking"));
    }

    @Test
    void fallsBackToOtherWhenNoKeywordMatches() {
        assertEquals(Category.OTHER, classify("OpenAI Builder Lounge SF with Parallel"));
    }

    private Category classify(String name) {
        RawEvent event = new RawEvent(
            "evt-test", name, "test-event", Instant.EPOCH, null, false, null,
            null, null, null, null, null, null,
            null, null, null, null, null,
            null, "test"
        );
        return classifier.classify(event);
    }
}
