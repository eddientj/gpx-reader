import { haversineMeters } from "./stats";
import { distanceToSegmentMeters } from "./waytypes";
import type { RouteStep, TrackPoint } from "./types";

// How close the live position needs to be to a maneuver's location before
// it gets spoken. Tune after a real ride — GPS drift and road geometry
// (e.g. a wide intersection) can make 50m feel early or late in practice.
const MANEUVER_TRIGGER_METERS = 50;

// How far the live position can stray from the route's path before it
// counts as "off route" and triggers a reroute. Matches the corridor width
// already used for map-matching in waytypes.ts.
const OFF_ROUTE_METERS = 40;

type LatLon = { lat: number; lon: number };

function asTrackPoint(p: LatLon): TrackPoint {
  return { lat: p.lat, lon: p.lon, ele: null, time: null };
}

/** Shortest distance from a position to the route's path, in meters. */
export function distanceFromRouteMeters(
  position: LatLon,
  routePoints: TrackPoint[]
): number {
  if (routePoints.length < 2) return Infinity;
  let min = Infinity;
  const point = asTrackPoint(position);
  for (let i = 1; i < routePoints.length; i++) {
    const d = distanceToSegmentMeters(point, routePoints[i - 1], routePoints[i]);
    if (d < min) min = d;
  }
  return min;
}

export function isOffRoute(position: LatLon, routePoints: TrackPoint[]): boolean {
  return distanceFromRouteMeters(position, routePoints) > OFF_ROUTE_METERS;
}

/** Compass bearing from `a` to `b`, in degrees (0 = north, 90 = east) —
 * used to orient a following navigation camera in the direction of travel,
 * the same way a driving-mode map rotates to face where you're heading
 * rather than staying locked to north. */
export function bearingBetween(a: LatLon, b: LatLon): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const toDeg = (rad: number) => (rad * 180) / Math.PI;
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const dLon = toRad(b.lon - a.lon);

  const y = Math.sin(dLon) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

/**
 * Finds the next not-yet-announced step close enough to speak now, checking
 * all unspoken steps rather than only the earliest one — a poll every few
 * seconds combined with real riding speed can put the position past a
 * step's 50m window between checks, and if only the first unspoken step
 * were ever checked, missing it would silently block every later step too.
 * Any earlier unspoken steps than the one found are returned as
 * `skippedIndices` for the caller to mark spoken without announcing them.
 */
export function findStepToAnnounce(
  position: LatLon,
  steps: RouteStep[],
  spokenIndices: ReadonlySet<number>
): { index: number; step: RouteStep; skippedIndices: number[] } | null {
  const point = asTrackPoint(position);
  const passedIndices: number[] = [];
  for (let i = 0; i < steps.length; i++) {
    if (spokenIndices.has(i)) continue;
    const step = steps[i];
    const distance = haversineMeters(point, {
      lat: step.lat,
      lon: step.lon,
      ele: null,
      time: null,
    });
    if (distance <= MANEUVER_TRIGGER_METERS) {
      return { index: i, step, skippedIndices: passedIndices };
    }
    passedIndices.push(i);
  }
  return null;
}

function phraseForModifier(modifier: string | null): string {
  switch (modifier) {
    case "left":
      return "turn left";
    case "right":
      return "turn right";
    case "slight left":
      return "bear left";
    case "slight right":
      return "bear right";
    case "sharp left":
      return "make a sharp left";
    case "sharp right":
      return "make a sharp right";
    case "straight":
      return "continue straight";
    case "uturn":
      return "make a U-turn";
    default:
      return "continue";
  }
}

/** Turns a raw OSRM step into a sentence for text-to-speech. */
export function speakableInstruction(step: RouteStep): string {
  if (step.type === "arrive") return "You have arrived at your destination.";
  if (step.type === "depart") {
    return step.name ? `Head out on ${step.name}.` : "Head out.";
  }
  const phrase = phraseForModifier(step.modifier);
  const sentence = step.name ? `${phrase} onto ${step.name}` : phrase;
  return `${sentence.charAt(0).toUpperCase()}${sentence.slice(1)}.`;
}
