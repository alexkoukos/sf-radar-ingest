package com.sfradar.ingest.dedupe;

import com.sfradar.ingest.model.Category;
import com.sfradar.ingest.model.ClassifiedEvent;
import com.sfradar.ingest.model.RsvpType;
import com.sfradar.ingest.source.RawEvent;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;

class EventDeduperTest {

    private final EventDeduper deduper = new EventDeduper();

    @Test
    void collapsesTheSameApiIdFoundViaTwoTargetsIntoOneRow() {
        List<ClassifiedEvent> deduped = deduper.dedupe(List.of(
            classifiedEvent("evt-shared", "discover:sf"),
            classifiedEvent("evt-shared", "calendar:cal-R9IQUb53FUrolUF")));

        assertEquals(1, deduped.size());
    }

    @Test
    void unionsDiscoveredViaAcrossTheMergedOccurrencesSortedAndDeduplicated() {
        List<ClassifiedEvent> deduped = deduper.dedupe(List.of(
            classifiedEvent("evt-shared", "calendar:cal-R9IQUb53FUrolUF"),
            classifiedEvent("evt-shared", "discover:sf"),
            classifiedEvent("evt-shared", "discover:sf")));

        assertEquals("calendar:cal-R9IQUb53FUrolUF,discover:sf", deduped.get(0).raw().discoveredVia());
    }

    @Test
    void leavesDistinctApiIdsUntouched() {
        List<ClassifiedEvent> deduped = deduper.dedupe(List.of(
            classifiedEvent("evt-one", "discover:sf"),
            classifiedEvent("evt-two", "discover:sf")));

        assertEquals(2, deduped.size());
    }

    private ClassifiedEvent classifiedEvent(String apiId, String discoveredVia) {
        RawEvent raw = new RawEvent(
            apiId, "Test Event", "test-event", Instant.EPOCH, null, false, "Acme Host",
            "San Francisco", "California", "SoMa", "US", 37.7749, -122.4194,
            true, null, false, "none", "open",
            "public", discoveredVia
        );
        return new ClassifiedEvent(raw, Category.GENERAL_NETWORKING, RsvpType.OPEN);
    }
}
