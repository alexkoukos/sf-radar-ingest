/**
 * "How to subscribe" panel for the group page. Collapsed by default —
 * reference material, not the main event. Menu paths were checked against
 * current Google / Apple / Microsoft support docs (Sept 2026); they drift,
 * so re-verify if this reads stale.
 */
function GroupHowTo() {
  return (
    <details className="grp-howto">
      <summary>How to put this on your own calendar</summary>
      <div className="grp-howto__body">
        <p className="grp-howto__lead">
          Grab the <strong>combined group feed</strong> URL from the “Group · Share · Calendar”
          section on the main SF Radar page (open it from the link in the header). It’s one
          calendar with everyone’s events, each titled <code>[Name] …</code>. A meeting someone
          marked private as “busy” shows only as <em>Busy</em>.
        </p>

        <dl className="grp-howto__list">
          <dt>Subscribe vs. download</dt>
          <dd>
            <strong>Subscribe</strong> (a URL) keeps updating as people change their plans — but
            calendar apps only re-check every 8–24 hours, and you can’t force it. <strong>Download
            .ics</strong> is a one-time frozen copy.
          </dd>

          <dt>Google Calendar</dt>
          <dd>
            Browser only (not the phone app). Left sidebar → <em>Other calendars</em> → <em>＋</em>{" "}
            → <em>From URL</em> → paste the <code>https://…/group/feed/…ics</code> link →{" "}
            <em>Add calendar</em>.
          </dd>

          <dt>Apple Calendar</dt>
          <dd>
            <strong>Mac:</strong> <em>File → New Calendar Subscription</em> → paste → <em>Subscribe</em>{" "}
            → set an auto-refresh interval.
            <br />
            <strong>iPhone / iPad:</strong> <em>Calendars → Add Calendar → Add Subscription
            Calendar</em> → paste → <em>Find</em>.
          </dd>

          <dt>Outlook</dt>
          <dd>
            New Outlook (web or desktop): <em>Add calendar → Subscribe from web</em> → paste →
            name it.
          </dd>

          <dt>Timezone</dt>
          <dd>
            The feed carries <code>America/Los_Angeles</code>, so events land at the right local
            moment wherever you are — nothing to set. (Only if you chose “SF times as-is” for your
            own plan would you set your calendar app’s timezone to Los Angeles.)
          </dd>
        </dl>
      </div>
    </details>
  );
}

export default GroupHowTo;
