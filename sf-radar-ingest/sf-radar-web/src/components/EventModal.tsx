import { useEffect, useRef, type CSSProperties } from "react";
import type { DashboardEvent } from "../types";
import { scoreBreakdown } from "../lib/scoreBreakdown";
import { CATEGORY_LABELS } from "../lib/categoryLabels";
import { formatPrice, isGated, locationLine, ptStamp, rsvpLabel } from "../lib/eventFormat";

// Plain-language names for the three scorer components: what each one
// actually measures, in the reader's words rather than the scorer's.
const BREAKDOWN_BARS: Array<{ key: "keyword" | "venue" | "accessibility"; label: string; hint: string }> = [
  { key: "keyword", label: "Relevance", hint: "How close to founders & investors" },
  { key: "venue", label: "Location", hint: "In person, in the city" },
  { key: "accessibility", label: "Access", hint: "Free and open to RSVP" },
];

interface EventModalProps {
  event: DashboardEvent | null;
  onClose: () => void;
  attending: boolean;
  onToggleAttend: (apiId: string) => void;
}

/**
 * Opened by tapping an EventCard. Same data as the card (no extra query -
 * get_dashboard_events already returned everything) just laid out with more
 * room: why it ranked where it did, the location line, and the two things
 * to do next - add it to your plan, and RSVP on Luma.
 */
function EventModal({ event, onClose, attending, onToggleAttend }: EventModalProps) {
  const closeRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!event) return;

    const previousOverflow = document.body.style.overflow;
    const previousFocus = document.activeElement as HTMLElement | null;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
      previousFocus?.focus?.();
    };
  }, [event, onClose]);

  if (!event) return null;

  const breakdown = scoreBreakdown(event);
  const gated = isGated(event);
  const score = Math.round((event.score ?? 0) * 100);
  const location = locationLine(event);

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div
        className="dialog ev-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ev-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          ref={closeRef}
          type="button"
          className="btn btn-icon btn-secondary ev-modal__close"
          onClick={onClose}
          aria-label="Close"
        >
          ×
        </button>

        <div className="card-kicker">
          {CATEGORY_LABELS[event.category] ?? event.category} · Score <span className="num">{score}</span>
        </div>
        <h2 id="ev-modal-title" className="dialog-title">{event.name}</h2>

        <dl className="ev-modal__facts">
          {event.starts_at && (
            <div>
              <dt>When</dt>
              <dd>{ptStamp(new Date(event.starts_at))}</dd>
            </div>
          )}
          {location && (
            <div>
              <dt>Where</dt>
              <dd>{location}</dd>
            </div>
          )}
          {event.host_name && (
            <div>
              <dt>Host</dt>
              <dd>{event.host_name}</dd>
            </div>
          )}
        </dl>

        <div className="ev-card__tags">
          <span className={event.is_free ? "tag tag-accent" : "tag tag-neutral"}>{formatPrice(event)}</span>
          <span className={gated ? "tag tag-neutral" : "tag tag-accent-2"}>{rsvpLabel(event.rsvp_type)}</span>
          {gated && <span className="tag tag-outline">Harder to get into</span>}
        </div>

        <section className="score-breakdown" aria-labelledby="ev-modal-why">
          <h3 id="ev-modal-why" className="eyebrow score-breakdown__title">Why it ranked here</h3>
          {BREAKDOWN_BARS.map(({ key, label, hint }) => (
            <div className="score-bar" key={key}>
              <span className="score-bar__label">
                {label}
                <span className="score-bar__hint">{hint}</span>
              </span>
              <span className="score-bar__track" aria-hidden="true">
                <span className="score-bar__fill" style={{ "--fill": breakdown[key] } as CSSProperties} />
              </span>
              <span className="score-bar__value num">{Math.round(breakdown[key] * 100)}</span>
            </div>
          ))}
        </section>

        <div className="ev-modal__actions">
          <button
            type="button"
            className={`btn ${attending ? "btn-secondary" : "btn-primary"}`}
            onClick={() => onToggleAttend(event.api_id)}
          >
            {attending ? "✓ In your plan · Remove" : "+ Add to plan"}
          </button>
          {event.url_slug && (
            <a
              className="btn btn-secondary ev-modal__luma-link"
              href={`https://luma.com/${event.url_slug}`}
              target="_blank"
              rel="noreferrer"
            >
              RSVP on Luma ↗
            </a>
          )}
        </div>
        <p className="ev-modal__note text-muted">
          Adding to your plan doesn't register you. RSVP on Luma to hold a spot.
        </p>
      </div>
    </div>
  );
}

export default EventModal;
