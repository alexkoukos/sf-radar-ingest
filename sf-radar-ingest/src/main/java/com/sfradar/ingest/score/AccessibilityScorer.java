package com.sfradar.ingest.score;

import com.sfradar.ingest.model.ClassifiedEvent;
import com.sfradar.ingest.model.RsvpType;

/**
 * Scores how easy an event actually is to attend, from typed fields only
 * (is_free, RsvpType) - never prose-mining a description. This is the
 * product's core thesis, not a tiebreaker: it exists so a free, open-RSVP
 * meetup can score competitively against a paid, invite-only investor
 * mixer instead of always losing to it on keyword relevance alone.
 */
public final class AccessibilityScorer {

    public double score(ClassifiedEvent event) {
        return (freeComponent(event.raw().isFree()) + rsvpComponent(event.rsvpType())) / 2.0;
    }

    private double freeComponent(Boolean isFree) {
        if (isFree == null) {
            return 0.5;
        }
        return isFree ? 1.0 : 0.0;
    }

    private double rsvpComponent(RsvpType rsvpType) {
        return switch (rsvpType) {
            case OPEN -> 1.0;
            case WAITLIST -> 0.4;
            case APPLICATION -> 0.3;
            case MEMBERS_ONLY -> 0.1;
            case INVITE_ONLY -> 0.0;
            case UNKNOWN -> 0.5;
        };
    }
}
