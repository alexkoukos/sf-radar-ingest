import type { DashboardEvent } from "../types";
import { CATEGORY_LABELS } from "../lib/categoryLabels";
import { formatPrice, isGated, ptStamp, rsvpLabel, venueLabel } from "../lib/eventFormat";

interface EventCardProps {
  event: DashboardEvent;
  rank: number;
  attending: boolean;
  /** Local "reviewed" flag (localStorage only, independent of attending). */
  seen: boolean;
  onToggleAttend: (apiId: string) => void;
  onToggleSeen: (apiId: string) => void;
  onHide: (apiId: string) => void;
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
 * Score high = visually loud, score low = visually quiet - carried here by
 * discrete rank tiers (1 / top-3 / rest) rather than a continuous fill,
 * since the Modernist card grid ranks by position, not by a score-driven
 * gradient. Paid/gated events are flagged, never hidden.
 *
 * "Seen" and "Hide" are personal, local-only (see lib/eventFlags.ts): a seen
 * card dims but stays; a hidden card is filtered out upstream and never
 * reaches this component.
 */
function EventCard({
  event,
  rank,
  attending,
  seen,
  onToggleAttend,
  onToggleSeen,
  onHide,
  onSelect,
}: EventCardProps) {
  const gated = isGated(event);
  const score = event.score ?? 0;

  return (
    <li
      className={`card ev-card ${tierClass(rank)}${seen ? " ev-card--seen" : ""}`}
      role="button"
      tabIndex={0}
      onClick={() => onSelect(event)}
      onKeyDown={(e) => {
        // Only when the keystroke lands on the card itself, not on a nested
        // control (Attend / Seen / Hide), so activating those never also
        // opens the modal.
        if (e.target !== e.currentTarget) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect(event);
        }
      }}
    >
      <span className="rank-badge">#{formatRank(rank)}</span>
      <div className="card-kicker">
        {CATEGORY_LABELS[event.category] ?? event.category} &middot; Score {Math.round(score * 100)}
      </div>
      <div className="card-title ev-card__title">{event.name}</div>
      <div className="card-meta ev-card__meta">
        {event.starts_at && <span>{ptStamp(new Date(event.starts_at))}</span>}
        <span>{venueLabel(event)}</span>
        {event.host_name && <span>{event.host_name}</span>}
      </div>
      <div className="ev-card__tags">
        {seen && <span className="tag tag-outline">Seen ✓</span>}
        <span className={event.is_free ? "tag tag-accent" : "tag tag-neutral"}>{formatPrice(event)}</span>
        <span className={gated ? "tag tag-neutral" : "tag tag-accent-2"}>{rsvpLabel(event.rsvp_type)}</span>
        {gated && <span className="tag tag-outline">Harder to get into</span>}
      </div>
      <button
        type="button"
        className={`btn btn-block ev-card__attend${attending ? " ev-card__attend--active" : ""}`}
        onClick={(e) => {
          e.stopPropagation();
          onToggleAttend(event.api_id);
        }}
        onKeyDown={(e) => e.stopPropagation()}
      >
        {attending ? "Attending ✓" : "Attend"}
      </button>
      <div className="ev-card__actions">
        <button
          type="button"
          className={`ev-card__act${seen ? " ev-card__act--on" : ""}`}
          aria-pressed={seen}
          onClick={(e) => {
            e.stopPropagation();
            onToggleSeen(event.api_id);
          }}
          onKeyDown={(e) => e.stopPropagation()}
        >
          {seen ? "Seen ✓" : "Mark seen"}
        </button>
        <button
          type="button"
          className="ev-card__act"
          onClick={(e) => {
            e.stopPropagation();
            onHide(event.api_id);
          }}
          onKeyDown={(e) => e.stopPropagation()}
        >
          Hide
        </button>
      </div>
    </li>
  );
}

export default EventCard;
