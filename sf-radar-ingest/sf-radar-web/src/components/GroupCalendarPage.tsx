import { useCallback, useEffect, useState } from "react";
import { fetchGroupView, type GroupViewResult } from "../lib/groupView";
import GroupGate from "./GroupGate";
import GroupCalendar from "./GroupCalendar";
import "../App.css";
import "../styles/group.css";

/**
 * Route entry for /group/<slug> (SPA-rewritten in vercel.json). Four states:
 * loading -> the passphrase gate (401) -> the calendar (200) -> not-found /
 * error. All group data comes from /api/group/view; the anon key can't
 * reach it.
 */
function GroupCalendarPage({ slug }: { slug: string }) {
  const [result, setResult] = useState<GroupViewResult | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    let cancelled = false;
    setLoading(true);
    fetchGroupView(slug).then((r) => {
      if (!cancelled) {
        setResult(r);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  useEffect(() => load(), [load]);

  useEffect(() => {
    const meta = document.createElement("meta");
    meta.name = "robots";
    meta.content = "noindex, nofollow";
    document.head.appendChild(meta);
    const prevTitle = document.title;
    document.title = "Group calendar · SF Radar";
    return () => {
      meta.remove();
      document.title = prevTitle;
    };
  }, []);

  return (
    <main className="dashboard grp-page">
      <nav className="nav">
        <span className="nav-brand">SF RADAR</span>
        <a className="btn btn-secondary nav__log" href="/">
          Open SF Radar
        </a>
      </nav>

      {loading && (
        <ul className="ev-grid" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <li className="card ev-card ev-card--skeleton" key={i} />
          ))}
        </ul>
      )}

      {!loading && result?.status === "gate" && <GroupGate slug={slug} onUnlocked={load} />}

      {!loading && result?.status === "ok" && (
        <GroupCalendar view={result.view} meJoinOrder={result.meMember?.join_order ?? null} />
      )}

      {!loading && result?.status === "notfound" && (
        <p className="banner banner--error">
          No group with this link, or it was removed. Check the link and try again.
        </p>
      )}

      {!loading && result?.status === "error" && (
        <p className="banner banner--error">Couldn't load this group: {result.message}</p>
      )}

      <footer className="app-footer">
        <a className="app-footer__link" href="/">
          SF Radar
        </a>
      </footer>
    </main>
  );
}

export default GroupCalendarPage;
