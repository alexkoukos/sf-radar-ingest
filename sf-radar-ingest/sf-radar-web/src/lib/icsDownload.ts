import type { EventLike } from "../types";
import { buildPlanIcs, type IcsOptions } from "./ics";

/**
 * Browser-only wrapper around buildPlanIcs: builds the .ics and triggers a
 * download. Kept out of ics.ts so the serverless feed function can import
 * the pure builder without pulling in DOM references.
 */
export function downloadPlanIcs(
  events: EventLike[],
  options: IcsOptions & { filename?: string },
): { ok: boolean; count: number; error?: string } {
  const { filename = "sf-radar-plan.ics", ...icsOptions } = options;
  const { value, count, error } = buildPlanIcs(events, icsOptions);
  if (!value) return { ok: false, count: 0, error };

  const blob = new Blob([value], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return { ok: true, count };
}
