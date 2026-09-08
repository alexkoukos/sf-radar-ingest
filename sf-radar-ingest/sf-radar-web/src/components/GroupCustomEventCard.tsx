import type { OwnedCustomEvent } from "../lib/groupMerge";
import { meetingTitle } from "../lib/groupMerge";
import { readableInk } from "../lib/memberColor";
import MemberChips from "./MemberChips";

const MEETING_TYPE_LABEL: Record<string, string> = {
  coffee: "Coffee",
  one_on_one: "1:1",
  call: "Call",
  lunch: "Lunch",
  dinner: "Dinner",
  other: "Meeting",
};

/**
 * A member-authored custom event. Always dashed + "CUSTOM"-marked so it
 * never reads as a ranked Luma event. Owned by one member (never merged),
 * shown in that member's colour.
 *
 * A `busy` entry is the server's redacted shape — it carries only times, in
 * the owner's colour, labelled "Busy". There is no hidden title/name to
 * leak because group_view never sent one (verified in the Part 1 proofs).
 */
function GroupCustomEventCard({
  owned,
  timeLabel,
}: {
  owned: OwnedCustomEvent;
  timeLabel: string;
}) {
  const { owner, custom } = owned;
  const isBusy = custom.kind === "busy";
  const isMeeting = custom.kind === "meeting";

  return (
    <li
      className={`card grp-card grp-card--custom${isBusy ? " grp-card--busy" : ""}`}
      style={{ "--member-color": owner.color } as React.CSSProperties}
    >
      <div className="grp-card__bar" aria-hidden="true">
        <span className="grp-card__bar-seg" style={{ background: owner.color }} />
      </div>

      <div className="grp-card__body">
        <div className="card-kicker grp-card__kicker-row">
          <span
            className="grp-card__custom-tag"
            style={{ background: owner.color, color: readableInk(owner.color) }}
          >
            {isBusy ? "Busy" : isMeeting ? MEETING_TYPE_LABEL[custom.meeting_type ?? "other"] ?? "Meeting" : "Custom"}
          </span>
          <span className="grp-card__owner-name">{owner.is_me ? "You" : owner.display_name}</span>
        </div>

        {isBusy ? (
          <div className="card-title grp-card__title grp-card__title--muted">Busy</div>
        ) : (
          <>
            <div className="card-title grp-card__title">{meetingTitle(custom)}</div>
            <div className="card-meta grp-card__meta">
              <span>{timeLabel}</span>
              {custom.location && <span>{custom.location}</span>}
              {isMeeting && custom.with_company && <span>{custom.with_company}</span>}
            </div>
            {custom.note && <p className="grp-card__note">{custom.note}</p>}
          </>
        )}

        <div className="grp-card__foot">
          <MemberChips members={[owner]} size="sm" />
          {isBusy && <span className="grp-card__meta">{timeLabel}</span>}
        </div>
      </div>
    </li>
  );
}

export default GroupCustomEventCard;
