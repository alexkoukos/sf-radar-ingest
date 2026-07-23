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
        new Rule(Category.HACKATHON, List.of("hackathon")),
        new Rule(Category.DEMO_DAY, List.of("demo day", "pitch night", "pitch competition")),
        new Rule(Category.INVESTOR_MEETUP, List.of("investor", "venture capital")),
        new Rule(Category.FOUNDER_SOCIAL, List.of("founder")),
        new Rule(Category.GENERAL_NETWORKING, List.of("networking", "mixer", "meetup", "social"))
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
