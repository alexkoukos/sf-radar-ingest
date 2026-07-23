package com.sfradar.ingest.run;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class RunSummaryTest {

    @Test
    void isTotalFailureWhenNoEventsIngestedAcrossAnyTarget() {
        RunSummary summary = new RunSummary(
            List.of(TargetOutcome.failure("discover:sf", false, "HTTP 502")), 0);

        assertTrue(summary.isTotalFailure());
    }

    @Test
    void isTotalFailureWhenAnyTargetHasAStructuralBreakEvenIfOthersSucceeded() {
        RunSummary summary = new RunSummary(
            List.of(
                TargetOutcome.success("discover:sf", 20),
                TargetOutcome.failure("calendar:x", true, "__NEXT_DATA__ script tag not found")),
            20);

        assertTrue(summary.isTotalFailure());
    }

    @Test
    void isNotTotalFailureWhenAtLeastOneTargetSucceedsAndNoStructuralBreakElsewhere() {
        RunSummary summary = new RunSummary(
            List.of(
                TargetOutcome.success("discover:sf", 20),
                TargetOutcome.failure("calendar:x", false, "HTTP 502")),
            20);

        assertFalse(summary.isTotalFailure());
    }
}
