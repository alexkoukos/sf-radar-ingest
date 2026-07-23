package com.sfradar.ingest.classify;

import com.sfradar.ingest.model.ClassifiedEvent;
import com.sfradar.ingest.source.RawEvent;

public final class EventClassifier {

    private final CategoryClassifier categoryClassifier = new CategoryClassifier();
    private final RsvpClassifier rsvpClassifier = new RsvpClassifier();

    public ClassifiedEvent classify(RawEvent event) {
        return new ClassifiedEvent(event, categoryClassifier.classify(event), rsvpClassifier.classify(event));
    }
}
