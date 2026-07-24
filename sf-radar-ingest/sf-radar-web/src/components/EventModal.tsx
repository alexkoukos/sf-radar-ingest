import { useEffect, type CSSProperties } from "react";
import type { DashboardEvent } from "../types";
import { scoreBreakdown } from "../lib/scoreBreakdown";
import { CATEGORY_LABELS } from "../lib/categoryLabels";
import { formatPrice, isGated, locationLine, ptTimeFormatter, rsvpLabel } from "../lib/eventFormat";

const BREAKDOWN_BARS: Array<{ key: "keyword" | "venue" | "accessibility"; label: string }> = [
  { key: "keyword", label: "Keyword" },
  { key: "venue", label: "Venue" },
  { key: "accessibility", label: "Access" },
];

interface EventModalProps {
  event: DashboardEvent | null;
  onClose: () => void;
}

/**
 * Opened by tapping an EventCard. Same data as the card (no extra query -
 * get_dashboard_events already returned everything) just laid out with more
 * room: full score breakdown with numeric values, location line, and the
 * outbound Luma link.
 */
function EventModal({ event, onClose }: EventModalProps) {
  useEffect(() => {
    if (!event) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [event, onClose]);

  if (!event) return null;

  const breakdown = scoreBreakdown(event);
  const gated = isGated(event);
  const score = event.score ?? 0;
  const location = locationLine(event);

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div
        className="dialog ev-modal"
        role="dialog"
        aria-modal="true"
        aria-label={event.name}
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" className="btn btn-icon btn-secondary ev-modal__close" onClick={onClose} aria-label="Close">
          &times;
        </button>

        <div className="card-kicker">
          {CATEGORY_LABELS[event.category] ?? event.category} &middot; Score {Math.round(score * 100)}
        </div>
        <h2 className="dialog-title">{event.name}</h2>

        <div className="card-meta ev-modal__meta">
          {event.starts_at && <span>{ptTimeFormatter.format(new Date(event.starts_at))} PT</span>}
          {event.host_name && <span>{event.host_name}</span>}
          {location && <span>{location}</span>}
        </div>

        <div className="ev-card__tags">
          <span className={event.is_free ? "tag tag-accent" : "tag tag-neutral"}>{formatPrice(event)}</span>
          <span className={gated ? "tag tag-neutral" : "tag tag-accent-2"}>{rsvpLabel(event.rsvp_type)}</span>
          {gated && <span className="tag tag-outline">Harder to get into</span>}
        </div>

        <div className="score-breakdown" aria-label="Why this ranked here">
          {BREAKDOWN_BARS.map(({ key, label }) => (
            <div className="score-bar" key={key}>
              <span className="score-bar__label">{label}</span>
              <span className="score-bar__track">
                <span
                  className="score-bar__fill"
                  style={{ width: `${breakdown[key] * 100}%` } as CSSProperties}
                />
              </span>
              <span className="score-bar__value">{Math.round(breakdown[key] * 100)}</span>
            </div>
          ))}
        </div>

        {event.url_slug && (
          <a className="btn btn-primary ev-modal__luma-link" href={`https://luma.com/${event.url_slug}`} target="_blank" rel="noreferrer">
            Open on Luma ↗
          </a>
        )}
      </div>
    </div>
  );
}

export default EventModal;
