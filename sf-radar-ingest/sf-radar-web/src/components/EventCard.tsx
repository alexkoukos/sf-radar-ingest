import type { DashboardEvent } from "../types";
import { formatPrice, isGated, ptStamp, rsvpLabel, venueLabel } from "../lib/eventFormat";

interface EventCardProps {
  event: DashboardEvent;
  rank: number;
  saved: boolean;
  onToggleSave: (apiId: string) => void;
}

/**
 * One event, everything needed to decide at a glance: what, when, where,
 * who, price, and whether anyone can get in. Two actions only - save it,
 * or open it on Luma. Rank is a display index into the SQL-sorted list,
 * never a re-sort. Harder-to-get-into events are dimmed, never hidden.
 */
function EventCard({ event, rank, saved, onToggleSave }: EventCardProps) {
  const gated = isGated(event);
  const lumaUrl = event.url_slug ? `https://luma.com/${event.url_slug}` : null;

  return (
    <li className={`ev${gated ? " ev--gated" : ""}${saved ? " ev--saved" : ""}`}>
      <p className="ev__rank" aria-hidden="true">
        {rank}
        <span className="dot-red">.</span>
      </p>
      <div className="ev__body">
        <h3 className="ev__title">
          <span className="sr-only">Number {rank}: </span>
          {event.name}
        </h3>
        {event.starts_at && <p className="ev__when">{ptStamp(new Date(event.starts_at))}</p>}
        <p className="ev__where">
          {venueLabel(event)}
          {event.host_name && <> · {event.host_name}</>}
        </p>
        <p className="ev__tags">
          <span className={event.is_free ? "tag tag-accent" : "tag"}>{formatPrice(event)}</span>
          <span className={gated ? "tag" : "tag tag-accent-2"}>{rsvpLabel(event.rsvp_type)}</span>
        </p>
        <div className="ev__actions">
          <button
            type="button"
            className={`btn ${saved ? "btn-primary" : "btn-secondary"} ev__save`}
            onClick={() => onToggleSave(event.api_id)}
          >
            {saved ? "✓ Saved" : "Save"}
          </button>
          {lumaUrl && (
            <a className="btn btn-ghost ev__luma" href={lumaUrl} target="_blank" rel="noreferrer">
              Open on Luma ↗
            </a>
          )}
        </div>
      </div>
    </li>
  );
}

export default EventCard;
