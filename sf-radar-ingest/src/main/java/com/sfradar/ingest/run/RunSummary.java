package com.sfradar.ingest.run;

import java.util.List;

/**
 * Run-level failure is a total-failure gate only: zero events across every
 * target, or any single target's structural shape-match break. Anything
 * short of that persists normally, with per-target failures visible only in
 * ingestion_runs.source_summary - a single target 502-ing must never fail
 * the run or block the other targets from being upserted.
 */
public record RunSummary(List<TargetOutcome> targets, int totalEvents) {

    public boolean isTotalFailure() {
        return totalEvents == 0 || targets.stream().anyMatch(TargetOutcome::structuralBreak);
    }
}
