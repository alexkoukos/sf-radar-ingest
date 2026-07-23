package com.sfradar.ingest.score;

import com.sfradar.ingest.model.Category;

import java.util.Map;

/**
 * Weights each event's already-classified category by relevance to a
 * founder/investor audience. This never excludes anything - source
 * curation (which calendars get scraped) is the relevance filter; every
 * category reaching this point already passed that bar and is only being
 * ranked by degree of interest.
 */
public final class KeywordScorer {

    private static final Map<Category, Double> WEIGHTS = Map.of(
        Category.INVESTOR_MEETUP, 1.0,
        Category.DEMO_DAY, 0.9,
        Category.FOUNDER_SOCIAL, 0.85,
        Category.HACKATHON, 0.7,
        Category.GENERAL_NETWORKING, 0.6,
        Category.OTHER, 0.4
    );

    public double score(Category category) {
        return WEIGHTS.getOrDefault(category, 0.4);
    }
}
