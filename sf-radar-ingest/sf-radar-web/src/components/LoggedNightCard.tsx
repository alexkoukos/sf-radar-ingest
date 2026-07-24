import type { LoggedNight } from "../lib/localPlan";

interface LoggedNightCardProps {
  logged: LoggedNight;
  nightLabel: string;
  onRemove: (id: string) => void;
}

/**
 * A user-authored plan entry, not a ranked event - dashed border and the
 * absence of a rank/score badge mark it as personal rather than ranked.
 * Feeds the same "N nights planned" counter and strip "booked" fill as the
 * ranked Attending toggles (see App.tsx's unified LocalPlan state).
 */
function LoggedNightCard({ logged, nightLabel, onRemove }: LoggedNightCardProps) {
  return (
    <li className="card ev-card ev-card--logged">
      <div className="card-kicker">Your plan &middot; {nightLabel}</div>
      <div className="card-title">{logged.title}</div>
      {logged.note && <p className="card-body">{logged.note}</p>}
      <button
        type="button"
        className="btn btn-secondary ev-card__remove"
        onClick={() => onRemove(logged.id)}
      >
        Remove
      </button>
    </li>
  );
}

export default LoggedNightCard;
