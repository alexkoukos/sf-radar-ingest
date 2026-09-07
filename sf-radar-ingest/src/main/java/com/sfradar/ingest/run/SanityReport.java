package com.sfradar.ingest.run;

import com.sfradar.ingest.model.ScoredEvent;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;
import java.util.TreeMap;

/**
 * Post-ingest coverage check. Not a gate - a total-failure gate is the only
 * thing allowed to skip the upsert (see {@link RunSummary}) - but a loud,
 * recorded signal that catches the failure mode from Sept 2026, where the
 * scraper quietly collapsed to ~2 events per night because it only ever read
 * each Luma page's first server-rendered screen.
 *
 * <p>All bucketing is done in America/Los_Angeles, the timezone the whole
 * dashboard is anchored to - never the JVM default, which on the dev machine
 * is Athens.
 */
public record SanityReport(
    int windowDays,
    int nightsCovered,
    int windowEventCount,
    TreeMap<LocalDate, Integer> perNight,
    List<String> warnings
) {

    private static final ZoneId LA = ZoneId.of("America/Los_Angeles");

    /** Nights in the next {@code windowDays} that must have at least one event
     *  before the run is considered healthy. Tuned below the ~10-13 nights a
     *  fully paginated pull covers, above the 2-3 the truncated scraper left. */
    public static final int MIN_NIGHTS_COVERED = 8;

    /** Floor on total events across the window - a paginated pull of the SF
     *  discovery feed alone clears this comfortably; the truncated scraper
     *  sat near 20. */
    public static final int MIN_WINDOW_EVENTS = 45;

    public static SanityReport of(List<ScoredEvent> events, Instant now, int windowDays) {
        LocalDate today = now.atZone(LA).toLocalDate();
        LocalDate windowEnd = today.plusDays(windowDays);

        TreeMap<LocalDate, Integer> perNight = new TreeMap<>();
        for (int i = 0; i < windowDays; i++) {
            perNight.put(today.plusDays(i), 0);
        }

        int windowEventCount = 0;
        for (ScoredEvent event : events) {
            Instant startsAt = event.raw().startsAt();
            if (startsAt == null) {
                continue;
            }
            LocalDate night = startsAt.atZone(LA).toLocalDate();
            if (!night.isBefore(today) && night.isBefore(windowEnd)) {
                perNight.merge(night, 1, Integer::sum);
                windowEventCount++;
            }
        }

        int nightsCovered = (int) perNight.values().stream().filter(count -> count > 0).count();

        List<String> warnings = new ArrayList<>();
        if (nightsCovered < MIN_NIGHTS_COVERED) {
            warnings.add("only " + nightsCovered + " of the next " + windowDays
                + " nights have any event (floor is " + MIN_NIGHTS_COVERED
                + ") - pagination may have silently stopped short again");
        }
        if (windowEventCount < MIN_WINDOW_EVENTS) {
            warnings.add("only " + windowEventCount + " events land in the next " + windowDays
                + " days (floor is " + MIN_WINDOW_EVENTS + ") - the scraper looks truncated");
        }

        return new SanityReport(windowDays, nightsCovered, windowEventCount, perNight, warnings);
    }

    public boolean isHealthy() {
        return warnings.isEmpty();
    }

    /** Human-readable per-night histogram for the run log. */
    public String render() {
        StringBuilder out = new StringBuilder();
        out.append("Window coverage (next ").append(windowDays).append(" LA nights): ")
            .append(nightsCovered).append(" nights populated, ")
            .append(windowEventCount).append(" events total");
        perNight.forEach((date, count) ->
            out.append(System.lineSeparator())
                .append("  ").append(date).append("  ")
                .append(count == 0 ? "(none)" : "#".repeat(Math.min(count, 40)))
                .append(count == 0 ? "" : " " + count));
        return out.toString();
    }
}
