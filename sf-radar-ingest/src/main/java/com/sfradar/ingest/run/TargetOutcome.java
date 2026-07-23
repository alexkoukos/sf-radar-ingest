package com.sfradar.ingest.run;

/**
 * Per-target result of one ingest run. structuralBreak distinguishes "Luma's
 * page shape itself changed" ({@code NextDataShapeException}) from an
 * ordinary transient failure (network error, non-200 status) - the former
 * means the scraper's core assumptions are wrong and should fail the whole
 * run, not just this target, since every target shares the same extraction
 * logic.
 */
public record TargetOutcome(String label, int eventCount, boolean structuralBreak, String error) {

    public static TargetOutcome success(String label, int eventCount) {
        return new TargetOutcome(label, eventCount, false, null);
    }

    public static TargetOutcome failure(String label, boolean structuralBreak, String error) {
        return new TargetOutcome(label, 0, structuralBreak, error);
    }
}
