import { useMemo, useState } from "react";
import type { GroupMember, GroupView } from "../lib/groupView";
import { laZoneAbbrev } from "../lib/eventFormat";
import { peekEditKey } from "../lib/plan";
import { deleteCustomEvent } from "../lib/customEvent";
import {
  buildGroupNights,
  itemStart,
  mergeAttendance,
  ownedCustomEvents,
  type GroupItem,
  type OwnedCustomEvent,
} from "../lib/groupMerge";
import { readableInk } from "../lib/memberColor";
import MergedEventCard from "./MergedEventCard";
import GroupCustomEventCard from "./GroupCustomEventCard";
import CustomEventForm from "./CustomEventForm";
import GroupHowTo from "./GroupHowTo";

type FilterMode = "everyone" | "some" | "me";

const nightHeadingFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Los_Angeles",
  weekday: "long",
  month: "short",
  day: "numeric",
});
const rangeFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Los_Angeles",
  month: "short",
  day: "numeric",
});
const clockFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Los_Angeles",
  hour: "numeric",
  minute: "2-digit",
});

/** "5:00 PM PDT" for an instant, always in SF time with an explicit suffix. */
function clockLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${clockFmt.format(d)} ${laZoneAbbrev(d)}`;
}

/** "YYYY-MM-DD" (LA date) -> a Date at LA noon, for heading formatting. */
function dateForHeading(ymd: string): Date {
  return new Date(`${ymd}T19:00:00Z`); // ~noon PDT / 11am PST — safely mid-day
}

function GroupCalendar({
  view,
  meMember,
  onChanged,
}: {
  view: GroupView;
  meMember: GroupMember | null;
  onChanged: () => void;
}) {
  const { group, members } = view;
  const meJoinOrder = meMember?.join_order ?? null;

  // Managing custom events needs the plan's WRITE credential, which lives only
  // in localStorage on the device the plan was made. meMember != null already
  // means the viewer's read slug matched a member (see fetchGroupView).
  const editKey = peekEditKey();
  const canManage = meMember !== null && editKey !== null;

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<OwnedCustomEvent | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);

  const [mode, setMode] = useState<FilterMode>("everyone");
  const [some, setSome] = useState<Set<number>>(() => new Set(members.map((m) => m.join_order)));

  const visibleSet = useMemo<Set<number> | null>(() => {
    if (mode === "everyone") return null;
    if (mode === "me") return meJoinOrder === null ? new Set() : new Set([meJoinOrder]);
    return some;
  }, [mode, some, meJoinOrder]);

  const merged = useMemo(() => mergeAttendance(members, meJoinOrder), [members, meJoinOrder]);
  const custom = useMemo(() => ownedCustomEvents(members, meJoinOrder), [members, meJoinOrder]);

  const nights = useMemo(() => {
    const inView = (item: GroupItem): boolean => {
      if (visibleSet === null) return true;
      return item.kind === "luma"
        ? item.attendees.some((a) => visibleSet.has(a.join_order))
        : visibleSet.has(item.owner.join_order);
    };
    return buildGroupNights(
      group.start_date,
      group.end_date,
      merged.filter(inView) as typeof merged,
      custom.filter(inView) as typeof custom,
    );
  }, [group.start_date, group.end_date, merged, custom, visibleSet]);

  const totalShown = nights.reduce((n, night) => n + night.items.length, 0);
  const sharedCount = merged.filter((m) => m.attendees.length >= 2).length;

  function toggleSome(joinOrder: number) {
    setSome((prev) => {
      const next = new Set(prev);
      if (next.has(joinOrder)) next.delete(joinOrder);
      else next.add(joinOrder);
      return next;
    });
  }

  function openAdd() {
    setEditing(null);
    setFormOpen(true);
    setRowError(null);
  }

  function openEdit(owned: OwnedCustomEvent) {
    setEditing(owned);
    setFormOpen(true);
    setRowError(null);
  }

  function afterSave() {
    setFormOpen(false);
    setEditing(null);
    onChanged();
  }

  async function handleDelete(owned: OwnedCustomEvent) {
    if (!meMember || !editKey) return;
    const label = owned.custom.kind === "busy" ? "this busy block" : "this custom event";
    if (!window.confirm(`Delete ${label}? This can't be undone.`)) return;
    setRowError(null);
    try {
      await deleteCustomEvent(meMember.read_slug, editKey, owned.custom.event_id);
      onChanged();
    } catch (err) {
      setRowError(err instanceof Error ? err.message : "Couldn't delete that.");
    }
  }

  return (
    <div className="grp">
      <header className="grp__head">
        <div className="hero__range">
          {group.name} · {rangeFmt.format(dateForHeading(group.start_date))} –{" "}
          {rangeFmt.format(dateForHeading(group.end_date))} · SF
        </div>
        <h1 className="grp__title">Group calendar</h1>
        <p className="grp__sub text-muted">
          {members.length} {members.length === 1 ? "member" : "members"} ·{" "}
          {sharedCount > 0
            ? `${sharedCount} event${sharedCount === 1 ? "" : "s"} two or more of you are on`
            : "no shared events yet"}
        </p>

        <ul className="grp__legend">
          {members.map((m) => (
            <li key={m.join_order} className="grp__legend-item">
              <span
                className="grp__legend-dot"
                style={{ background: m.color, color: readableInk(m.color) }}
              />
              <span>
                {m.display_name}
                {m.join_order === meJoinOrder ? " (you)" : ""}
              </span>
            </li>
          ))}
        </ul>

        {canManage && !formOpen && (
          <button type="button" className="btn btn-primary grp__add" onClick={openAdd}>
            + Add event or meeting to my plan
          </button>
        )}
        {meMember !== null && editKey === null && (
          <p className="grp__filter-hint text-muted">
            To add or change your own events, open this group on the device where you made
            your plan.
          </p>
        )}
      </header>

      {formOpen && meMember && editKey && (
        <CustomEventForm
          planSlug={meMember.read_slug}
          editKey={editKey}
          windowStart={group.start_date}
          windowEnd={group.end_date}
          existing={editing}
          onSaved={afterSave}
          onCancel={() => {
            setFormOpen(false);
            setEditing(null);
          }}
        />
      )}

      {rowError && <p className="banner banner--error">{rowError}</p>}

      <div className="grp__filter">
        <span className="view-toggle__label">Show</span>
        <div className="seg" role="group" aria-label="Filter by member">
          <label className="seg-opt">
            <input
              type="radio"
              name="grp-filter"
              checked={mode === "me"}
              disabled={meJoinOrder === null}
              onChange={() => setMode("me")}
            />
            <span>Just me</span>
          </label>
          <label className="seg-opt">
            <input
              type="radio"
              name="grp-filter"
              checked={mode === "some"}
              onChange={() => setMode("some")}
            />
            <span>Some</span>
          </label>
          <label className="seg-opt">
            <input
              type="radio"
              name="grp-filter"
              checked={mode === "everyone"}
              onChange={() => setMode("everyone")}
            />
            <span>Everyone</span>
          </label>
        </div>
        {meJoinOrder === null && (
          <span className="grp__filter-hint text-muted">
            You haven't joined this group — open SF Radar to join.
          </span>
        )}
      </div>

      {mode === "some" && (
        <div className="grp__member-toggles">
          {members.map((m) => {
            const on = some.has(m.join_order);
            return (
              <button
                key={m.join_order}
                type="button"
                className={`chip${on ? " chip--active" : ""}`}
                aria-pressed={on}
                onClick={() => toggleSome(m.join_order)}
              >
                <span
                  className="grp__legend-dot grp__legend-dot--inline"
                  style={{ background: m.color }}
                />
                {m.display_name}
              </button>
            );
          })}
        </div>
      )}

      {totalShown === 0 && (
        <p className="grp__empty">Nothing planned for the selected members yet.</p>
      )}

      <ol className="grp__nights">
        {nights.map((night) => (
          <li
            key={night.date}
            className={`grp__night${night.items.length === 0 ? " grp__night--empty" : ""}${
              night.inWindow ? "" : " grp__night--out"
            }`}
          >
            <h2 className="grp__night-head">
              {nightHeadingFmt.format(dateForHeading(night.date))}
              {!night.inWindow && <span className="grp__night-out-tag"> · outside the trip</span>}
            </h2>
            {night.items.length === 0 ? (
              <p className="grp__night-none text-muted">—</p>
            ) : (
              <ul className="grp__night-list">
                {night.items.map((item) =>
                  item.kind === "luma" ? (
                    <MergedEventCard
                      key={`luma-${item.api_id}`}
                      merged={item}
                      timeLabel={clockLabel(itemStart(item))}
                    />
                  ) : (
                    <GroupCustomEventCard
                      key={`custom-${item.custom.event_id}`}
                      owned={item}
                      timeLabel={clockLabel(itemStart(item))}
                      canManage={canManage && item.owner.is_me}
                      onEdit={() => openEdit(item)}
                      onDelete={() => handleDelete(item)}
                    />
                  ),
                )}
              </ul>
            )}
          </li>
        ))}
      </ol>

      <GroupHowTo />
    </div>
  );
}

export default GroupCalendar;
