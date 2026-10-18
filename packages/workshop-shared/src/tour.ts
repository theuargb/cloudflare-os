/**
 * Interface tours: a short sequence of cards that each point at one part of the Workshop chrome or
 * of a gatekeeper app's frame. The Workshop renders every tour (one overlay over its chrome and the
 * sandboxed frame); apps only describe steps and report where their own anchors are.
 */

/** Host DOM anchors (`data-tour="…"`) a tour step may target. */
export const HOST_TOUR_ANCHORS = [
  "sidebar-modules",
  "sidebar-workspaces",
  "sidebar-toggle",
  "sidebar-utilities",
  "menu-button",
  "workplace",
  "menu",
  "inbox",
  "home-composer",
  "home-quick-actions",
  "home-suggestions",
] as const;

/** One of HOST_TOUR_ANCHORS. */
export type HostTourAnchor = (typeof HOST_TOUR_ANCHORS)[number];

/**
 * What a step points at: a host anchor, a host sidebar group by its default title (as the app
 * published it in AppSidebarGroup.title), or a `data-tour` anchor inside the app's frame. A step
 * without a target is a centered card.
 */
export type TourTarget = { host: HostTourAnchor } | { hostGroup: string } | { frame: string };

/** Preferred side of the target for the card; the host flips it when it does not fit. */
export type TourSide = "top" | "right" | "bottom" | "left";

/** One card of a tour, in the user's language. */
export type TourStep = { target?: TourTarget; side?: TourSide; title: string; body: string };

/** A tour; bump `version` to show it again to users who already finished it. */
export type Tour = { id: string; version: number; steps: TourStep[] };

/** A rect in CSS px of a viewport (the frame's own viewport when a frame reports it). */
export type TourRect = { left: number; top: number; width: number; height: number };

const TOUR_ID = /^[a-z][a-z0-9-]{0,31}$/;
const FRAME_ANCHOR = /^[a-z][a-z0-9-]{0,39}$/;
const MAX_VERSION = 9999;
const MAX_STEPS = 20;
const MAX_TITLE = 80;
const MAX_BODY = 400;
const MAX_GROUP_TITLE = 60;
const SIDES: readonly string[] = ["top", "right", "bottom", "left"];
const HOST_ANCHORS: readonly string[] = HOST_TOUR_ANCHORS;

function boundedText(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text && text.length <= max ? text : null;
}

function sanitizeTarget(raw: unknown): TourTarget | null {
  if (typeof raw !== "object" || raw === null) return null;
  const keys = Object.keys(raw);
  if (keys.length !== 1) return null;
  const { host, hostGroup, frame } = raw as Record<string, unknown>;
  if (typeof host === "string" && HOST_ANCHORS.includes(host)) return { host: host as HostTourAnchor };
  const group = boundedText(hostGroup, MAX_GROUP_TITLE);
  if (group) return { hostGroup: group };
  if (typeof frame === "string" && FRAME_ANCHOR.test(frame)) return { frame };
  return null;
}

function sanitizeStep(raw: unknown): TourStep | null {
  if (typeof raw !== "object" || raw === null) return null;
  const { target, side, title, body } = raw as Record<string, unknown>;
  const cleanTitle = boundedText(title, MAX_TITLE);
  const cleanBody = boundedText(body, MAX_BODY);
  if (!cleanTitle || !cleanBody) return null;
  if (side !== undefined && (typeof side !== "string" || !SIDES.includes(side))) return null;
  const step: TourStep = { title: cleanTitle, body: cleanBody };
  if (side !== undefined) step.side = side as TourSide;
  if (target !== undefined) {
    const cleanTarget = sanitizeTarget(target);
    if (!cleanTarget) return null;
    step.target = cleanTarget;
  }
  return step;
}

/** A well-formed copy of a tour from an untrusted app, or null when any part of it is invalid. */
export function sanitizeTour(raw: unknown): Tour | null {
  if (typeof raw !== "object" || raw === null) return null;
  const { id, version, steps } = raw as Record<string, unknown>;
  if (typeof id !== "string" || !TOUR_ID.test(id)) return null;
  if (typeof version !== "number" || !Number.isInteger(version) || version < 1 || version > MAX_VERSION) return null;
  if (!Array.isArray(steps) || steps.length === 0 || steps.length > MAX_STEPS) return null;
  const clean: TourStep[] = [];
  for (const step of steps) {
    const cleanStep = sanitizeStep(step);
    if (!cleanStep) return null;
    clean.push(cleanStep);
  }
  return { id, version, steps: clean };
}

/** Whether `raw` is a rect with finite coordinates and a non-negative size. */
export function isTourRect(raw: unknown): raw is TourRect {
  if (typeof raw !== "object" || raw === null) return false;
  const { left, top, width, height } = raw as Record<string, unknown>;
  return (
    typeof left === "number" &&
    typeof top === "number" &&
    typeof width === "number" &&
    typeof height === "number" &&
    Number.isFinite(left) &&
    Number.isFinite(top) &&
    Number.isFinite(width) &&
    Number.isFinite(height) &&
    width >= 0 &&
    height >= 0
  );
}
