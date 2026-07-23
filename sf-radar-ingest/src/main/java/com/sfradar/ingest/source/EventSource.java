package com.sfradar.ingest.source;

import java.util.List;

public interface EventSource {

    String label();

    List<RawEvent> fetch() throws Exception;
}
