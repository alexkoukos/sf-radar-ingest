import type { EventLike } from "../types";
import { CATEGORY_LABELS } from "../lib/categoryLabels";
import { formatPrice, isGated, ptStamp, rsvpLabel, venueLabel } from "../lib/eventFormat";

interface SharedEventCardProps {
  event: EventLike;
}

/**
 * Read-only sibling of EventCard for the shared-plan view: same visual
 * language, but no rank badge, no Attend button, no click-through - a
 * shared plan is a snapshot someone hands you, not something you edit.
 */
function SharedEventCard({ event }: SharedEventCardProps) {
  const gated = isGated(event);
  const score = event.score ?? 0;

  return (
    <li className="card ev-card ev-card--shared">
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
        <span className={event.is_free ? "tag tag-accent" : "tag tag-neutral"}>{formatPrice(event)}</span>
        <span className={gated ? "tag tag-neutral" : "tag tag-accent-2"}>{rsvpLabel(event.rsvp_type)}</span>
        {gated && <span className="tag tag-outline">Harder to get into</span>}
      </div>
      {event.url_slug && (
        <a
          className="btn btn-secondary btn-block ev-card__shared-link"
          href={`https://luma.com/${event.url_slug}`}
          target="_blank"
          rel="noreferrer"
        >
          Open on Luma ↗
        </a>
      )}
    </li>
  );
}

export default SharedEventCard;
