import type { MemberRef } from "../lib/groupMerge";
import { initials, readableInk } from "../lib/memberColor";

/**
 * Stacked per-member colour indicators. This is how a shared event shows
 * "who's going" in one glance instead of repeating the event once per
 * member. Each chip is the member's palette colour with readable ink and
 * their initials; the full name is in the title/aria-label.
 */
function MemberChips({ members, size = "md" }: { members: MemberRef[]; size?: "sm" | "md" }) {
  return (
    <span className={`member-chips member-chips--${size}`}>
      {members.map((m) => (
        <span
          key={m.join_order}
          className={`member-chip${m.is_me ? " member-chip--me" : ""}`}
          style={{ background: m.color, color: readableInk(m.color) }}
          title={m.is_me ? `${m.display_name} (you)` : m.display_name}
          aria-label={m.is_me ? `${m.display_name} (you)` : m.display_name}
        >
          {initials(m.display_name)}
        </span>
      ))}
    </span>
  );
}

export default MemberChips;
