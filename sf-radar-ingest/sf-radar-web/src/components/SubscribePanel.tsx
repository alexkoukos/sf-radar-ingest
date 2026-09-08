import { useState } from "react";
import { feedUrls } from "../lib/plan";

interface SubscribePanelProps {
  slug: string;
  /** Include the /plan/<slug> share-page link alongside the feed URLs. */
  includePageLink?: boolean;
}

function CopyRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }
  return (
    <div className="sub-row">
      <span className="sub-row__label">{label}</span>
      <input className="input sub-row__url" value={value} readOnly onFocus={(e) => e.currentTarget.select()} />
      <button type="button" className="btn btn-secondary sub-row__copy" onClick={copy}>
        {copied ? "Copied ✓" : "Copy"}
      </button>
    </div>
  );
}

/**
 * The subscribe-able feed URLs for a plan, in the three forms calendar
 * apps expect, plus an honest note that a subscription is not instant.
 */
function SubscribePanel({ slug, includePageLink }: SubscribePanelProps) {
  const urls = feedUrls(slug);
  return (
    <div className="subscribe-panel">
      {includePageLink && <CopyRow label="Share page" value={urls.page} />}
      <CopyRow label="Feed URL (https)" value={urls.https} />
      <CopyRow label="Feed URL (webcal)" value={urls.webcal} />
      <div className="sub-row">
        <span className="sub-row__label">Google</span>
        <a className="btn btn-primary sub-row__google" href={urls.google} target="_blank" rel="noreferrer">
          Add to Google Calendar ↗
        </a>
      </div>
      <p className="subscribe-panel__note text-muted">
        A subscription <strong>keeps updating</strong> as the plan changes, but calendar apps only
        re-check every so often (Google roughly every 8 to 24h; Outlook can take 24h+; Apple is
        configurable). It is not instant. For a frozen copy of the plan as it is right now, use
        “Download .ics”.
      </p>
    </div>
  );
}

export default SubscribePanel;
