import type { RideStats, TrackPoint } from "./types";

const EARTH_RADIUS_METERS = 6371000;

// GPS elevation readings are noisy; small point-to-point wobble should not
// count as real climbing/descending or it wildly overstates elevation gain.
const ELEVATION_NOISE_THRESHOLD_METERS = 1;

// Time deltas below this are dominated by GPS/clock jitter, not real motion,
// and can produce absurd instantaneous speeds when divided into.
const MIN_TIME_DELTA_SECONDS = 1;

export function haversineMeters(a: TrackPoint, b: TrackPoint): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(h));
}

export function computeStats(points: TrackPoint[]): RideStats {
  let distanceMeters = 0;
  let elevationGainMeters = 0;
  let elevationLossMeters = 0;
  let maxSpeedKmh: number | null = null;
  let minEle: number | null = null;
  let maxEle: number | null = null;

  for (const p of points) {
    if (p.ele === null) continue;
    if (minEle === null || p.ele < minEle) minEle = p.ele;
    if (maxEle === null || p.ele > maxEle) maxEle = p.ele;
  }

  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const segmentMeters = haversineMeters(prev, curr);
    distanceMeters += segmentMeters;

    if (prev.ele !== null && curr.ele !== null) {
      const diff = curr.ele - prev.ele;
      if (diff > ELEVATION_NOISE_THRESHOLD_METERS) {
        elevationGainMeters += diff;
      } else if (diff < -ELEVATION_NOISE_THRESHOLD_METERS) {
        elevationLossMeters += -diff;
      }
    }

    if (prev.time && curr.time) {
      const dtSeconds =
        (new Date(curr.time).getTime() - new Date(prev.time).getTime()) / 1000;
      if (dtSeconds >= MIN_TIME_DELTA_SECONDS) {
        const speedKmh = (segmentMeters / dtSeconds) * 3.6;
        if (maxSpeedKmh === null || speedKmh > maxSpeedKmh) {
          maxSpeedKmh = speedKmh;
        }
      }
    }
  }

  const first = points[0];
  const last = points[points.length - 1];
  const durationSeconds =
    first.time && last.time
      ? (new Date(last.time).getTime() - new Date(first.time).getTime()) / 1000
      : null;

  const avgSpeedKmh =
    durationSeconds && durationSeconds > 0
      ? (distanceMeters / durationSeconds) * 3.6
      : null;

  return {
    distanceMeters,
    durationSeconds,
    elevationGainMeters,
    elevationLossMeters,
    avgSpeedKmh,
    maxSpeedKmh,
    minEle,
    maxEle,
  };
}
