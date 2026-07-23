package com.sfradar.ingest.model;

import com.sfradar.ingest.source.RawEvent;

/**
 * A RawEvent plus the derived fields SFRadar actually filters/sorts on.
 * Kept separate from RawEvent so the source-shaped scrape output stays
 * untouched by classification heuristics.
 */
public record ClassifiedEvent(RawEvent raw, Category category, RsvpType rsvpType) {
}
