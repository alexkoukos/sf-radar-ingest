package com.sfradar.ingest.run;

import com.sfradar.ingest.model.Category;
import com.sfradar.ingest.model.ClassifiedEvent;
import com.sfradar.ingest.model.RsvpType;
import com.sfradar.ingest.model.ScoredEvent;
import com.sfradar.ingest.source.RawEvent;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class SanityReportTest {

    private static final ZoneId LA = ZoneId.of("America/Los_Angeles");
    // 2026-09-07T12:00:00Z is 05:00 in Los Angeles - "today" is Sep 7, LA.
    private static final Instant NOW = Instant.parse("2026-09-07T12:00:00Z");

    @Test
    void healthyWhenEveryNightIsWellCovered() {
        List<ScoredEvent> events = new ArrayList<>();
        for (int day = 0; day < 14; day++) {
            for (int n = 0; n < 5; n++) {
                events.add(eventOnLaNight(day, 19 + n));
            }
        }

        SanityReport report = SanityReport.of(events, NOW, 14);

        assertTrue(report.isHealthy(), report.warnings().toString());
        assertEquals(14, report.nightsCovered());
        assertEquals(70, report.windowEventCount());
    }

    @Test
    void flagsTheTruncationRegressionShape() {
        // The exact failure from Sept 2026: a couple of events on the first
        // few nights, nothing after.
        List<ScoredEvent> events = List.of(
            eventOnLaNight(1, 18),
            eventOnLaNight(1, 19),
            eventOnLaNight(2, 18),
            eventOnLaNight(3, 18));

        SanityReport report = SanityReport.of(events, NOW, 14);

        assertFalse(report.isHealthy());
        assertTrue(report.nightsCovered() < SanityReport.MIN_NIGHTS_COVERED);
        assertTrue(report.warnings().stream().anyMatch(w -> w.contains("nights have any event")));
        assertTrue(report.warnings().stream().anyMatch(w -> w.contains("events land in the next")));
    }

    @Test
    void bucketsByLosAngelesCalendarDateNotUtc() {
        // 2026-09-10T05:30:00Z is still 2026-09-09 (22:30) in Los Angeles.
        SanityReport report = SanityReport.of(
            List.of(eventAt(Instant.parse("2026-09-10T05:30:00Z"))), NOW, 14);

        assertEquals(1, report.perNight().get(java.time.LocalDate.of(2026, 9, 9)));
        assertEquals(0, report.perNight().get(java.time.LocalDate.of(2026, 9, 10)));
    }

    @Test
    void ignoresEventsOutsideTheWindow() {
        SanityReport report = SanityReport.of(
            List.of(
                eventAt(NOW.minus(2, ChronoUnit.DAYS)),
                eventAt(NOW.plus(40, ChronoUnit.DAYS))),
            NOW, 14);

        assertEquals(0, report.windowEventCount());
        assertEquals(0, report.nightsCovered());
    }

    /** An event at {@code hourLocal}:00 America/Los_Angeles on the night
     *  {@code dayOffset} days after "today" (Sep 7, 2026 LA). */
    private static ScoredEvent eventOnLaNight(int dayOffset, int hourLocal) {
        Instant startsAt = LocalDate.of(2026, 9, 7)
            .plusDays(dayOffset)
            .atTime(hourLocal % 24, 0)
            .atZone(LA)
            .toInstant();
        return eventAt(startsAt);
    }

    private static ScoredEvent eventAt(Instant startsAt) {
        RawEvent raw = new RawEvent(
            "evt-" + startsAt.toEpochMilli(), "Test", "test", startsAt, null, false, null,
            "San Francisco", null, null, null, null, null,
            true, null, null, null, null, null, "test");
        return new ScoredEvent(new ClassifiedEvent(raw, Category.OTHER, RsvpType.OPEN), 0.5);
    }
}
