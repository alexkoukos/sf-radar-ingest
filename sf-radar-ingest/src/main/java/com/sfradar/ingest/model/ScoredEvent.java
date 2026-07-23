package com.sfradar.ingest.model;

import com.sfradar.ingest.source.RawEvent;

/**
 * A ClassifiedEvent plus its time-invariant relevance score. Kept separate
 * from ClassifiedEvent so scoring stays its own independently testable
 * pipeline stage, not entangled with category/RSVP classification.
 */
public record ScoredEvent(ClassifiedEvent classified, double score) {

    public RawEvent raw() {
        return classified.raw();
    }

    public Category category() {
        return classified.category();
    }

    public RsvpType rsvpType() {
        return classified.rsvpType();
    }
}
