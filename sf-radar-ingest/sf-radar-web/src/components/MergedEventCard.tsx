import type { MergedLumaEvent } from "../lib/groupMerge";
import { CATEGORY_LABELS } from "../lib/categoryLabels";
import { formatPrice, isGated, rsvpLabel, venueLabel } from "../lib/eventFormat";
import MemberChips from "./MemberChips";

/**
 * One Luma event on the group calendar, rendered ONCE no matter how many
 * members are attending. When 2+ members are going it gets the loud
 * treatment (accent border + "N of the group going") — that overlap is the
 * single most useful thing the group view surfaces.
 */
function MergedEventCard({
  merged,
  timeLabel,
}: {
  merged: MergedLumaEvent;
  timeLabel: string;
}) {
  const { event, attendees } = merged;
  const shared = attendees.length >= 2;
  const gated = isGated(event);

  return (
    <li className={`card grp-card grp-card--luma${shared ? " grp-card--shared" : ""}`}>
      <div className="grp-card__bar" aria-hidden="true">
        {attendees.map((a) => (
          <span key={a.join_order} className="grp-card__bar-seg" style={{ background: a.color }} />
        ))}
      </div>

      <div className="grp-card__body">
        <div className="card-kicker">
          {CATEGORY_LABELS[event.category] ?? event.category}
          {shared && <span className="grp-card__shared-flag"> · {attendees.length} of the group going</span>}
        </div>

        <div className="card-title grp-card__title">
          {event.url_slug ? (
            <a href={`https://luma.com/${event.url_slug}`} target="_blank" rel="noreferrer">
              {event.name}
            </a>
          ) : (
            event.name
          )}
        </div>

        <div className="card-meta grp-card__meta">
          <span>{timeLabel}</span>
          <span>{venueLabel(event)}</span>
          {event.host_name && <span>{event.host_name}</span>}
        </div>

        <div className="grp-card__foot">
          <MemberChips members={attendees} />
          <span className="grp-card__tags">
            <span className={event.is_free ? "tag tag-accent" : "tag tag-neutral"}>
              {formatPrice(event)}
            </span>
            {gated && <span className="tag tag-outline">Harder to get into</span>}
            {!gated && <span className="tag tag-accent-2">{rsvpLabel(event.rsvp_type)}</span>}
          </span>
        </div>
      </div>
    </li>
  );
}

export default MergedEventCard;
