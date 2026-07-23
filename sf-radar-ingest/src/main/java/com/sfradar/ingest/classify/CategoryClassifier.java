package com.sfradar.ingest.classify;

import com.sfradar.ingest.model.Category;
import com.sfradar.ingest.source.RawEvent;

import java.util.List;
import java.util.Locale;

/**
 * Best-effort keyword match on the event name. Unlike the extractor
 * classes in source.embedded, this is not pinned against a schema - Luma
 * doesn't expose a category field, so there is no ground truth to check
 * this against beyond "does it read right for the fixture's real event
 * names". Rules are checked in order and the first match wins; tune the
 * keyword lists as real misclassifications turn up.
 */
public final class CategoryClassifier {

    private record Rule(Category category, List<String> keywords) {
    }

    private static final List<Rule> RULES = List.of(
        // "hack" alone (not just "hackathon") catches real Day 3 misses like
        // "Hack Night", "Hack Day", "Hacks", and "HackSprint". "build day"/
        // "build fest"/"jam session" cover build-style hackathons that never
        // say "hack" at all. Deliberately no bare "build" or "challenge"-free
        // wording - "You.com...Build a Trusted Answer Experience" is a
        // product talk, not a hackathon, and would false-positive on it.
        new Rule(Category.HACKATHON,
            List.of("hackathon", "hack", "challenge", "build day", "build fest", "jam session")),
        // "demo" alone rather than just "demo day"/"demo night" - real
        // events use both, plus "AI Demo Series". "showcase" is a synonym
        // seen on "WebA Showcase".
        new Rule(Category.DEMO_DAY, List.of("demo", "pitch night", "pitch competition", "showcase")),
        // "angel" for angel investors ("Equity Angels"). Deliberately no
        // bare "capital" - "Human Performance, Capital & Innovation" and
        // "Comma Capital" (a VC's name, not the event's subject) are real
        // events that would false-positive on it.
        new Rule(Category.INVESTOR_MEETUP, List.of("investor", "venture", "angel")),
        new Rule(Category.FOUNDER_SOCIAL, List.of("founder", "startup school")),
        // The broadest, lowest-priority bucket - catches informal/social
        // gathering formats (meals, lounges, "builder" as this ecosystem's
        // catch-all self-identifier) and structured-but-still-networking
        // formats (workshop, masterclass, conference/summit/forum/congress)
        // that don't fit any more specific category above.
        new Rule(Category.GENERAL_NETWORKING, List.of(
            "networking", "mixer", "meetup", "meet up", "social", "mingle", "builder",
            "breakfast", "dinner", "happy hour", "workshop", "masterclass", "tech talk",
            "speakeasy", "conference", "summit", "forum", "congress"))
    );

    public Category classify(RawEvent event) {
        String name = event.name().toLowerCase(Locale.ROOT);
        for (Rule rule : RULES) {
            for (String keyword : rule.keywords()) {
                if (name.contains(keyword)) {
                    return rule.category();
                }
            }
        }
        return Category.OTHER;
    }
}
