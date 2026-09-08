import { useEffect, useState } from "react";
import { normalizeDisplayName } from "../lib/displayName";
import { fetchGroupView, type GroupMember } from "../lib/groupView";
import {
  clearGroupMembership,
  createGroup,
  groupFeedUrls,
  joinGroup,
  loadGroupMembership,
  parseGroupSlug,
  saveGroupMembership,
  type GroupMembership,
} from "../lib/groupMembership";
import { readableInk } from "../lib/memberColor";
import CopyField from "./CopyField";

/** "YYYY-MM-DD" + n whole days, via UTC-midnight math (no DST drift). */
function addDaysYmd(ymd: string, n: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const t = Date.UTC(y, m - 1, d) + n * 86_400_000;
  const dt = new Date(t);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(
    dt.getUTCDate(),
  ).padStart(2, "0")}`;
}

function todayLaYmd(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

interface Props {
  /** Publishes the local plan and returns its {slug, editKey}. */
  ensurePlanPublished: () => Promise<{ slug: string; editKey: string }>;
  /** Arrival date "YYYY-MM-DD" or null — seeds the create form's window. */
  startDate: string | null;
  /** Current display name (shared with the plan-share identity). */
  name: string;
  onNameChange: (value: string) => void;
}

function GroupHubSection({ ensurePlanPublished, startDate, name, onNameChange }: Props) {
  const [group, setGroup] = useState<GroupMembership | null>(null);
  const [members, setMembers] = useState<GroupMember[] | null>(null);
  const [mode, setMode] = useState<"none" | "create" | "join">("none");

  // Shown ONCE, right after creating — never persisted (hard rule).
  const [freshPassphrase, setFreshPassphrase] = useState<string | null>(null);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setGroup(loadGroupMembership());
  }, []);

  useEffect(() => {
    if (!group) {
      setMembers(null);
      return;
    }
    let cancelled = false;
    fetchGroupView(group.slug).then((r) => {
      if (!cancelled) setMembers(r.status === "ok" ? r.view.members : null);
    });
    return () => {
      cancelled = true;
    };
  }, [group]);

  const inviteUrl =
    group && typeof window !== "undefined" ? `${window.location.origin}/group/${group.slug}` : "";
  const feed = group && group.feedToken ? groupFeedUrls(group.feedToken) : null;

  // ── create ───────────────────────────────────────────────────────────
  const defaultStart = startDate ?? todayLaYmd();
  const [gName, setGName] = useState("");
  const [gStart, setGStart] = useState(defaultStart);
  const [gEnd, setGEnd] = useState(addDaysYmd(defaultStart, 13));
  const [gPass, setGPass] = useState("");

  async function submitCreate(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    const displayName = normalizeDisplayName(name);
    if (!gName.trim()) return setError("Give the group a name.");
    if (!displayName) return setError("Add your name first (in Share my plan).");
    if (gPass.trim().length < 4) return setError("Passphrase must be at least 4 characters.");
    if (gEnd < gStart) return setError("End date can't be before the start date.");

    setBusy(true);
    setError(null);
    try {
      const { slug: planSlug, editKey } = await ensurePlanPublished();
      const res = await createGroup({
        planSlug,
        editKey,
        name: gName,
        startDate: gStart,
        endDate: gEnd,
        passphrase: gPass,
        displayName,
      });
      const m: GroupMembership = {
        slug: res.groupSlug,
        name: gName.trim(),
        color: res.color,
        joinOrder: res.joinOrder,
        feedToken: res.feedToken,
      };
      saveGroupMembership(m);
      setFreshPassphrase(gPass);
      setGPass("");
      setGroup(m);
      setMode("none");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't create the group.");
    } finally {
      setBusy(false);
    }
  }

  // ── join ─────────────────────────────────────────────────────────────
  const [jLink, setJLink] = useState("");
  const [jPass, setJPass] = useState("");

  async function submitJoin(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    const displayName = normalizeDisplayName(name);
    const slug = parseGroupSlug(jLink);
    if (!slug) return setError("Paste the group link you were sent (…/group/<code>).");
    if (!displayName) return setError("Add your name first (in Share my plan).");
    if (!jPass.trim()) return setError("Enter the group passphrase.");

    setBusy(true);
    setError(null);
    try {
      const { slug: planSlug, editKey } = await ensurePlanPublished();
      const res = await joinGroup({
        groupSlug: slug,
        passphrase: jPass,
        planSlug,
        editKey,
        displayName,
      });
      const view = await fetchGroupView(slug);
      const groupName = view.status === "ok" ? view.view.group.name : "your group";
      const m: GroupMembership = {
        slug,
        name: groupName,
        color: res.color,
        joinOrder: res.joinOrder,
        feedToken: res.feedToken,
      };
      saveGroupMembership(m);
      setJPass("");
      setJLink("");
      setGroup(m);
      setMode("none");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't join the group.");
    } finally {
      setBusy(false);
    }
  }

  function forget() {
    if (!window.confirm("Forget this group on this device? You stay a member — this only clears the local shortcut.")) {
      return;
    }
    clearGroupMembership();
    setGroup(null);
    setMembers(null);
    setFreshPassphrase(null);
  }

  // ── in a group ───────────────────────────────────────────────────────
  if (group) {
    return (
      <div className="hub-group">
        <p className="hub-group__lead">
          You're in{" "}
          <strong>{group.name}</strong> —{" "}
          <span
            className="hub-group__swatch"
            style={{ background: group.color }}
            aria-hidden="true"
          />
          your colour, member #{group.joinOrder + 1}.
        </p>

        {members && members.length > 0 && (
          <ul className="hub-group__members">
            {members.map((m) => (
              <li key={m.join_order} className="hub-group__member">
                <span
                  className="hub-group__swatch"
                  style={{ background: m.color, color: readableInk(m.color) }}
                  aria-hidden="true"
                />
                {m.display_name}
                {m.join_order === group.joinOrder ? " (you)" : ""}
              </li>
            ))}
          </ul>
        )}

        <a className="btn btn-primary hub-group__open" href={`/group/${group.slug}`}>
          Open group calendar →
        </a>

        <CopyField label="Invite link" value={inviteUrl} />
        <p className="hub__note text-muted">
          Share the link <strong>and</strong> the passphrase (the one you set) in Slack — the
          passphrase isn't stored anywhere and can't be recovered.
        </p>

        {feed && (
          <div className="hub-group__feed">
            <p className="hub__note text-muted">
              <strong>Combined calendar feed</strong> — everyone's plans in one subscribe-able
              calendar, each entry prefixed with the person's name. Meetings marked "Busy" show as{" "}
              <em>Busy</em> only.
            </p>
            <CopyField label="Feed (https)" value={feed.https} />
            <CopyField label="Feed (webcal)" value={feed.webcal} />
            <div className="hub-form__actions">
              <a
                className="btn btn-secondary"
                href={feed.google}
                target="_blank"
                rel="noreferrer"
              >
                Add to Google Calendar ↗
              </a>
            </div>
            <p className="hub__note text-muted">
              A subscription keeps updating, but calendar apps only re-check every so often (Google
              ~8–24h). It isn't instant.
            </p>
          </div>
        )}

        {freshPassphrase && (
          <div className="hub-group__passphrase">
            <CopyField label="Passphrase" value={freshPassphrase} />
            <p className="hub__note">
              Shown once. Copy it now and send it with the invite link — there's no way to get it
              back.
            </p>
          </div>
        )}

        <button type="button" className="btn btn-ghost hub-group__forget" onClick={forget}>
          Forget this group on this device
        </button>
        {error && <p className="banner banner--error hub__error">{error}</p>}
      </div>
    );
  }

  // ── not in a group ───────────────────────────────────────────────────
  return (
    <div className="hub-setup">
      <p className="hub__note text-muted">
        Coordinating a trip with other people? Make a group to overlay everyone's plans on one
        calendar.
      </p>

      {mode === "none" && (
        <div className="hub-setup__choices">
          <button type="button" className="btn btn-primary" onClick={() => { setMode("create"); setError(null); }}>
            Create a group
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => { setMode("join"); setError(null); }}>
            Join with an invite link
          </button>
        </div>
      )}

      {mode === "create" && (
        <form className="hub-form" onSubmit={submitCreate}>
          <label className="hub-field">
            <span>Group name</span>
            <input className="input" value={gName} onChange={(e) => setGName(e.target.value)} maxLength={80} placeholder="e.g. Sept SF crew" />
          </label>
          <div className="hub-form__dates">
            <label className="hub-field">
              <span>Trip start (SF)</span>
              <input className="input" type="date" value={gStart} onChange={(e) => setGStart(e.target.value)} />
            </label>
            <label className="hub-field">
              <span>Trip end (SF)</span>
              <input className="input" type="date" value={gEnd} min={gStart} onChange={(e) => setGEnd(e.target.value)} />
            </label>
          </div>
          <label className="hub-field">
            <span>Passphrase (4–64 chars — you'll share this in Slack)</span>
            <input className="input" type="text" value={gPass} onChange={(e) => setGPass(e.target.value)} maxLength={64} placeholder="e.g. blue fox river" />
          </label>
          <p className="hub__note text-muted">
            Creating adopts <strong>your current plan</strong> as member #1. Your name:{" "}
            <input
              className="input hub-name-inline"
              value={name}
              onChange={(e) => onNameChange(e.target.value)}
              maxLength={40}
              placeholder="your name"
            />
          </p>
          {error && <p className="banner banner--error hub__error">{error}</p>}
          <div className="hub-form__actions">
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {busy ? "Creating…" : "Create group"}
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => { setMode("none"); setError(null); }}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {mode === "join" && (
        <form className="hub-form" onSubmit={submitJoin}>
          <label className="hub-field">
            <span>Invite link</span>
            <input className="input" value={jLink} onChange={(e) => setJLink(e.target.value)} placeholder="https://…/group/…" />
          </label>
          <label className="hub-field">
            <span>Passphrase</span>
            <input className="input" type="password" autoComplete="off" value={jPass} onChange={(e) => setJPass(e.target.value)} maxLength={64} />
          </label>
          <p className="hub__note text-muted">
            Joining adds <strong>your current plan</strong> to the group. Your name:{" "}
            <input
              className="input hub-name-inline"
              value={name}
              onChange={(e) => onNameChange(e.target.value)}
              maxLength={40}
              placeholder="your name"
            />
          </p>
          {error && <p className="banner banner--error hub__error">{error}</p>}
          <div className="hub-form__actions">
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {busy ? "Joining…" : "Join group"}
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => { setMode("none"); setError(null); }}>
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

export default GroupHubSection;
