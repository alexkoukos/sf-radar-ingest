import type { CSSProperties } from "react";
import type { DashboardEvent } from "../types";
import { CATEGORY_LABELS } from "../lib/categoryLabels";
import { formatPrice, isGated, ptStamp, rsvpLabel, venueLabel } from "../lib/eventFormat";

interface EventCardProps {
  event: DashboardEvent;
  rank: number;
  attending: boolean;
  /** Local "reviewed" flag (localStorage only, independent of attending). */
  seen: boolean;
  /**
   * Which VIEW-row filter is active. "seen" and "hidden" narrow the list to
   * that subset, so the inline dim / "Seen" tag are dropped as redundant and
   * the hide control flips to "Unhide".
   */
  view: "default" | "seen" | "hidden";
  onToggleAttend: (apiId: string) => void;
  onToggleSeen: (apiId: string) => void;
  onToggleHidden: (apiId: string) => void;
  onSelect: (event: DashboardEvent) => void;
}

/** Rank is a display index into an already SQL-sorted list, never a re-sort. */
function tierClass(rank: number): string {
  if (rank === 1) return "ev-card--rank-1";
  if (rank <= 3) return "ev-card--rank-top";
  return "ev-card--rank-rest";
}

function formatRank(rank: number): string {
  return rank < 10 ? `0${rank}` : String(rank);
}

/**
 * One poster cell per event: hairline + heavy bar on top, a big light rank
 * numeral with the red full stop, then the facts a newcomer decides on
 * (when, where, who, price, how open the RSVP is) without tapping.
 *
 * Score high = loud, score low = quiet: top-3 cells get the red bar and a
 * full-ink numeral, the rest stay grey. Paid/gated events are flagged,
 * never hidden.
 *
 * The title is the keyboard/screen-reader way into the detail sheet; a
 * click anywhere else on the card does the same for pointer users. The card
 * itself is not a button, so the nested controls stay valid.
 */
function EventCard({
  event,
  rank,
  attending,
  seen,
  view,
  onToggleAttend,
  onToggleSeen,
  onToggleHidden,
  onSelect,
}: EventCardProps) {
  const gated = isGated(event);
  const score = Math.round((event.score ?? 0) * 100);
  const dimAsSeen = seen && view === "default";
  const category = CATEGORY_LABELS[event.category] ?? event.category;

  return (
    <li
      className={`card ev-card ${tierClass(rank)}${dimAsSeen ? " ev-card--seen" : ""}${attending ? " ev-card--attending" : ""}`}
      onClick={() => onSelect(event)}
    >
      <div className="ev-card__head">
        <span className="ev-rank">
          <span className="sr-only">Rank </span>
          {formatRank(rank)}
          <span className="dot-red" aria-hidden="true">.</span>
        </span>
        <span className="ev-score">
          <span className="sr-only">Score </span>
          <span className="ev-score__num">{score}</span>
          <span className="sr-only"> out of 100</span>
          <span className="ev-score__track" aria-hidden="true">
            <span className="ev-score__fill" style={{ "--score": score / 100 } as CSSProperties} />
          </span>
        </span>
      </div>

      <div className="card-kicker">{category}</div>
      <h3 className="card-title ev-card__title">
        <button
          type="button"
          className="ev-card__open"
          onClick={(e) => {
            e.stopPropagation();
            onSelect(event);
          }}
        >
          {event.name}
        </button>
      </h3>

      {event.starts_at && <div className="ev-card__when">{ptStamp(new Date(event.starts_at))}</div>}
      <div className="card-meta ev-card__meta">
        <span>{venueLabel(event)}</span>
        {event.host_name && <span>{event.host_name}</span>}
      </div>

      <div className="ev-card__tags">
        <span className={event.is_free ? "tag tag-accent" : "tag tag-neutral"}>{formatPrice(event)}</span>
        <span className={gated ? "tag tag-neutral" : "tag tag-accent-2"}>{rsvpLabel(event.rsvp_type)}</span>
        {gated && <span className="tag tag-outline">Harder to get into</span>}
        {dimAsSeen && <span className="tag tag-outline">Seen</span>}
      </div>

      <div className="ev-card__actions">
        <button
          type="button"
          className={`btn ev-card__attend${attending ? " ev-card__attend--active" : " btn-secondary"}`}
          onClick={(e) => {
            e.stopPropagation();
            onToggleAttend(event.api_id);
          }}
        >
          {attending ? "✓ In your plan" : "+ Add to plan"}
        </button>
        <button
          type="button"
          className={`ev-card__act${seen ? " ev-card__act--on" : ""}`}
          onClick={(e) => {
            e.stopPropagation();
            onToggleSeen(event.api_id);
          }}
        >
          {seen ? "Seen ✓" : "Mark seen"}
        </button>
        <button
          type="button"
          className="ev-card__act"
          onClick={(e) => {
            e.stopPropagation();
            onToggleHidden(event.api_id);
          }}
        >
          {view === "hidden" ? "Unhide" : "Hide"}
        </button>
      </div>
    </li>
  );
}

export default EventCard;
