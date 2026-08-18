import { haversineMeters } from "./stats";
import type { TrackPoint } from "./types";

/**
 * Douglas-Peucker line simplification: reduces a dense track down to the
 * handful of points that best preserve its shape, discarding points that
 * sit within `toleranceMeters` of the straight line between their
 * neighbors. Used to turn an imported GPX's raw trackpoints (which can
 * number in the thousands) into a manageable set of control waypoints for
 * editing in the route planner — a well-known ~20-line algorithm, not
 * worth pulling in a library for.
 */
export function simplifyTrack(
  points: TrackPoint[],
  toleranceMeters: number
): TrackPoint[] {
  if (points.length < 3) return points;

  let maxDistance = 0;
  let maxIndex = 0;
  const first = points[0];
  const last = points[points.length - 1];

  for (let i = 1; i < points.length - 1; i++) {
    const distance = perpendicularDistanceMeters(points[i], first, last);
    if (distance > maxDistance) {
      maxDistance = distance;
      maxIndex = i;
    }
  }

  if (maxDistance <= toleranceMeters) {
    return [first, last];
  }

  const left = simplifyTrack(points.slice(0, maxIndex + 1), toleranceMeters);
  const right = simplifyTrack(points.slice(maxIndex), toleranceMeters);
  return [...left.slice(0, -1), ...right];
}

/** Distance from `point` to the line through `lineStart`/`lineEnd` (not the
 * segment — Douglas-Peucker measures against the infinite line so a point
 * that projects outside the segment still counts as far from it). Treats
 * lat/lon as locally planar, same approximation `waytypes.ts` already uses
 * at this scale. */
function perpendicularDistanceMeters(
  point: TrackPoint,
  lineStart: TrackPoint,
  lineEnd: TrackPoint
): number {
  const lonScale = Math.cos((point.lat * Math.PI) / 180);
  const ax = lineStart.lon * lonScale;
  const ay = lineStart.lat;
  const bx = lineEnd.lon * lonScale;
  const by = lineEnd.lat;
  const px = point.lon * lonScale;
  const py = point.lat;

  const dx = bx - ax;
  const dy = by - ay;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq === 0) return haversineMeters(point, lineStart);

  const t = ((px - ax) * dx + (py - ay) * dy) / lengthSq;
  const projLon = (ax + t * dx) / lonScale;
  const projLat = ay + t * dy;

  return haversineMeters(point, { lat: projLat, lon: projLon, ele: null, time: null });
}

const INITIAL_TOLERANCE_METERS = 15;
const MAX_SIMPLIFY_ATTEMPTS = 12;

/**
 * Derives a set of editable control waypoints from a dense imported track,
 * capped at `maxWaypoints` — a raw GPX can have thousands of points, far
 * too many to hand-edit as waypoints, so this doubles the simplification
 * tolerance until the result fits the cap (rather than a single fixed
 * tolerance, which would over-simplify a short route and under-simplify a
 * long one).
 */
export function deriveEditableWaypoints(
  points: TrackPoint[],
  maxWaypoints: number
): TrackPoint[] {
  let tolerance = INITIAL_TOLERANCE_METERS;
  let simplified = simplifyTrack(points, tolerance);
  for (let attempt = 0; attempt < MAX_SIMPLIFY_ATTEMPTS && simplified.length > maxWaypoints; attempt++) {
    tolerance *= 2;
    simplified = simplifyTrack(points, tolerance);
  }
  return simplified;
}
