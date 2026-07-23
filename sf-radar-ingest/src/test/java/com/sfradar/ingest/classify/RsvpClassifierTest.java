package com.sfradar.ingest.classify;

import com.sfradar.ingest.model.RsvpType;
import com.sfradar.ingest.source.RawEvent;
import org.junit.jupiter.api.Test;

import java.time.Instant;

import static org.junit.jupiter.api.Assertions.assertEquals;

class RsvpClassifierTest {

    private final RsvpClassifier classifier = new RsvpClassifier();

    @Test
    void waitlistedRegistrationAlwaysWinsOverRequireApproval() {
        assertEquals(RsvpType.WAITLIST, classifier.classify(event("waitlist", null)));
        assertEquals(RsvpType.WAITLIST, classifier.classify(event("waitlist", true)));
        assertEquals(RsvpType.WAITLIST, classifier.classify(event("waitlist", false)));
    }

    @Test
    void openRegistrationRequiringApprovalIsApplication() {
        assertEquals(RsvpType.APPLICATION, classifier.classify(event("open", true)));
    }

    @Test
    void openRegistrationWithoutApprovalIsOpen() {
        assertEquals(RsvpType.OPEN, classifier.classify(event("open", false)));
        assertEquals(RsvpType.OPEN, classifier.classify(event("open", null)));
    }

    @Test
    void unrecognizedOrMissingSignalsAreUnknown() {
        assertEquals(RsvpType.UNKNOWN, classifier.classify(event(null, null)));
        assertEquals(RsvpType.UNKNOWN, classifier.classify(event("closed", false)));
    }

    private RawEvent event(String registrationAvailability, Boolean requireApproval) {
        return new RawEvent(
            "evt-test", "Test Event", "test-event", Instant.EPOCH, null, false, null,
            null, null, null, null, null, null,
            null, null, requireApproval, null, registrationAvailability,
            null, "test"
        );
    }
}
