import { useState } from "react";
import { groupLogin } from "../lib/groupView";

/**
 * The passphrase gate. The group link alone shows nothing — this posts to
 * /api/group/login, which sets the HttpOnly session cookie on success. We
 * never see or store the passphrase or any hash; on success the parent
 * simply re-fetches the (now authorised) group view.
 */
function GroupGate({ slug, onUnlocked }: { slug: string; onUnlocked: () => void }) {
  const [passphrase, setPassphrase] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!passphrase.trim() || busy) return;
    setBusy(true);
    setError(null);
    const result = await groupLogin(slug, passphrase);
    setBusy(false);
    if (result.ok) {
      setPassphrase("");
      onUnlocked();
      return;
    }
    setError(
      result.status === 429
        ? "Too many attempts. Wait a few minutes and try again."
        : (result.message ?? "That didn't work."),
    );
  }

  return (
    <div className="grp-gate">
      <h1 className="grp-gate__title">This trip group is private</h1>
      <p className="grp-gate__lead text-muted">
        Enter the passphrase whoever set up the group shared with you (check Slack). The link
        by itself isn't enough.
      </p>
      <form className="grp-gate__form" onSubmit={submit}>
        <label htmlFor="grp-pass">Group passphrase</label>
        <input
          id="grp-pass"
          className="input"
          type="password"
          autoComplete="off"
          autoFocus
          value={passphrase}
          onChange={(e) => setPassphrase(e.target.value)}
          maxLength={64}
        />
        <button type="submit" className="btn btn-primary" disabled={busy || !passphrase.trim()}>
          {busy ? "Checking…" : "Unlock"}
        </button>
      </form>
      {error && <p className="banner banner--error grp-gate__error">{error}</p>}
    </div>
  );
}

export default GroupGate;
