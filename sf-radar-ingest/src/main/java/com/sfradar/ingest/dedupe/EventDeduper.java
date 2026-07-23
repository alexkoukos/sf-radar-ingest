package com.sfradar.ingest.dedupe;

import com.sfradar.ingest.model.ClassifiedEvent;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeSet;

/**
 * Collapses events sharing the same Luma api_id - the same event found via
 * two different scrape targets (e.g. both luma.com/sf and a community
 * calendar) - into a single row. api_id is Luma's own global event id, not
 * scoped per target, so this is the dedupe key. discovered_via is unioned
 * across the merged occurrences rather than picked from just one of them,
 * since it's observability only and was never part of the dedupe key
 * itself.
 */
public final class EventDeduper {

    public List<ClassifiedEvent> dedupe(List<ClassifiedEvent> events) {
        Map<String, ClassifiedEvent> firstByApiId = new LinkedHashMap<>();
        Map<String, TreeSet<String>> discoveredViaByApiId = new LinkedHashMap<>();

        for (ClassifiedEvent event : events) {
            String apiId = event.raw().apiId();
            firstByApiId.putIfAbsent(apiId, event);
            discoveredViaByApiId
                .computeIfAbsent(apiId, id -> new TreeSet<>())
                .add(event.raw().discoveredVia());
        }

        return firstByApiId.entrySet().stream()
            .map(entry -> merge(entry.getValue(), discoveredViaByApiId.get(entry.getKey())))
            .toList();
    }

    private ClassifiedEvent merge(ClassifiedEvent event, TreeSet<String> discoveredVia) {
        String unioned = String.join(",", discoveredVia);
        return new ClassifiedEvent(event.raw().withDiscoveredVia(unioned), event.category(), event.rsvpType());
    }
}
