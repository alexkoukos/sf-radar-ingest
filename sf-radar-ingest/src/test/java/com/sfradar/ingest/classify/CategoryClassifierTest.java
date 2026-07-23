package com.sfradar.ingest.classify;

import com.sfradar.ingest.model.Category;
import com.sfradar.ingest.source.RawEvent;
import org.junit.jupiter.api.Test;

import java.time.Instant;

import static org.junit.jupiter.api.Assertions.assertEquals;

/**
 * Cases are drawn from real event names seen either in the frozen
 * discover:sf fixture (see NextDataExtractorTest) or in a live production
 * ingest run against the Day 3 curated calendars - not invented examples.
 */
class CategoryClassifierTest {

    private final CategoryClassifier classifier = new CategoryClassifier();

    @Test
    void matchesHackathonKeyword() {
        assertEquals(Category.HACKATHON, classify("Self-Evolving Agents Hackathon"));
    }

    @Test
    void matchesHackKeywordEvenWithoutTheWordHackathon() {
        assertEquals(Category.HACKATHON, classify("SF AI Tech Stack Hack Night"));
        assertEquals(Category.HACKATHON, classify("Biopharma Hack Day at AWS"));
        assertEquals(Category.HACKATHON, classify("Building Creative Agents for Brands [Magnific Hacks]"));
        assertEquals(Category.HACKATHON, classify("Daytona HackSprint w/ Braintrust - SF, July 2026"));
    }

    @Test
    void matchesOtherHackathonSynonymsWithNoHackSubstringAtAll() {
        assertEquals(Category.HACKATHON, classify("AlphaSignal's Pizza Agent Challenge ($2,500 Cash Prize)"));
        assertEquals(Category.HACKATHON, classify("MongoDB.local Build Fest: San Francisco"));
        assertEquals(Category.HACKATHON, classify("Vibe Coders Jam Session: feat. Base44"));
    }

    @Test
    void buildDayTakesPriorityOverFounderEvenWhenBothWordsArePresent() {
        // "Founders Build Day" is genuinely a founder-hosted hackathon-style
        // build day - HACKATHON is checked first, so it wins over FOUNDER_SOCIAL.
        assertEquals(Category.HACKATHON,
            classify("Founders Build Day: An afternoon of building for Early-Stage Founders (SF)"));
    }

    @Test
    void matchesDemoDayKeyword() {
        assertEquals(Category.DEMO_DAY, classify("Hardware Pitch Night - Summertime Showcase"));
    }

    @Test
    void matchesGenericDemoKeywordNotJustDemoDayOrDemoNight() {
        assertEquals(Category.DEMO_DAY, classify("Built on Baseten | AI Demo Night"));
        assertEquals(Category.DEMO_DAY, classify("AI-pilled teams: Demo Night"));
        assertEquals(Category.DEMO_DAY, classify("AI Demo Series: July Edition - Startup Grind"));
    }

    @Test
    void matchesShowcaseKeyword() {
        assertEquals(Category.DEMO_DAY, classify("WebA Showcase: Try Each Other's Products"));
    }

    @Test
    void matchesVentureKeywordEvenWithoutTheWordInvestor() {
        assertEquals(Category.INVESTOR_MEETUP, classify("Taiwan Venture Day 2026"));
    }

    @Test
    void matchesAngelKeywordForAngelInvestorEvents() {
        assertEquals(Category.INVESTOR_MEETUP, classify("GTM UNPLUGGED | Equity Angels and Wells Fargo"));
    }

    @Test
    void matchesStartupSchoolKeywordAsFounderSocial() {
        assertEquals(Category.FOUNDER_SOCIAL, classify("YC AI Startup School Afterparty"));
    }

    @Test
    void matchesMingleKeywordAsGeneralNetworking() {
        assertEquals(Category.GENERAL_NETWORKING, classify("SF Tech Mix & Mingle"));
    }

    @Test
    void matchesBuilderKeywordAsGeneralNetworking() {
        assertEquals(Category.GENERAL_NETWORKING, classify("OpenAI Builder Lounge SF with Parallel"));
        assertEquals(Category.GENERAL_NETWORKING, classify("Agentic Builders Night"));
    }

    @Test
    void matchesMealAndSocialFormatKeywordsAsGeneralNetworking() {
        assertEquals(Category.GENERAL_NETWORKING, classify("9Zero August Cohort - Welcome Breakfast"));
        assertEquals(Category.GENERAL_NETWORKING, classify("Surreal Dinner Series: Future of LLMs Part 2"));
        assertEquals(Category.GENERAL_NETWORKING,
            classify("Campfire GTM Happy Hour: Selling AI Into The Office Of The CFO"));
        assertEquals(Category.GENERAL_NETWORKING, classify("Post-Singularity Speakeasy"));
        assertEquals(Category.GENERAL_NETWORKING, classify("AI Nerd Meet Up"));
    }

    @Test
    void matchesStructuredLearningFormatKeywordsAsGeneralNetworking() {
        assertEquals(Category.GENERAL_NETWORKING,
            classify("AI Agent Workshop: Run Your Agents with Nosana On-demand GPUs"));
        assertEquals(Category.GENERAL_NETWORKING, classify("Claude Code Masterclass S02 - Build Core AI Features"));
        assertEquals(Category.GENERAL_NETWORKING, classify("Tech Talk: The Software Factory Series"));
    }

    @Test
    void matchesConferenceStyleKeywordsAsGeneralNetworking() {
        assertEquals(Category.GENERAL_NETWORKING, classify("AGI-26 Conference"));
        assertEquals(Category.GENERAL_NETWORKING, classify("AI Commerce Forum Tokyo 2026"));
        assertEquals(Category.GENERAL_NETWORKING, classify("AI Native Summit - SF TechWeek 2026"));
        assertEquals(Category.GENERAL_NETWORKING, classify("WeAreDevelopers World Congress North America"));
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
    void doesNotMatchCapitalAsAnInvestorKeywordBecauseRealEventsWouldFalsePositive() {
        // "Human Performance, Capital & Innovation" isn't investor-related, and
        // "Comma Capital" is just a VC's name sponsoring an intern social, not
        // the event's subject - both are real events, so "capital" stays out.
        assertEquals(Category.OTHER, classify("Human Performance, Capital & Innovation"));
        assertEquals(Category.OTHER, classify("SF Intern & New Grad Summerfest by Comma Capital & Pylon"));
    }

    @Test
    void fallsBackToOtherWhenNoKeywordMatches() {
        assertEquals(Category.OTHER, classify("Redesigning the Stories That Hold You Back in Life"));
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
