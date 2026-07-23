package com.sfradar.ingest.classify;

import com.sfradar.ingest.model.RsvpType;
import com.sfradar.ingest.source.RawEvent;

/**
 * Derives RsvpType from the raw signals confirmed against real Luma
 * responses: entry.registration_availability ("open" / "waitlist") and
 * ticket_info.require_approval. Checked in that priority order because a
 * waitlisted event is the more restrictive state regardless of whether it
 * also requires approval once a spot opens up.
 *
 * <p>INVITE_ONLY and MEMBERS_ONLY have no confirmed signal: calendar
 * access_level and event visibility were "public" on every event observed
 * across discover:sf and both community calendar targets (all three
 * sources only ever surface public events). Those two enum values are
 * reserved for a source that actually exposes private/members-only
 * calendars; until then they can't be produced by this classifier.
 */
public final class RsvpClassifier {

    public RsvpType classify(RawEvent event) {
        if ("waitlist".equals(event.registrationAvailability())) {
            return RsvpType.WAITLIST;
        }
        if (Boolean.TRUE.equals(event.requireApproval())) {
            return RsvpType.APPLICATION;
        }
        if ("open".equals(event.registrationAvailability())) {
            return RsvpType.OPEN;
        }
        return RsvpType.UNKNOWN;
    }
}
