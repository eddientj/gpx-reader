import { haversineMeters } from "./stats";
import type { BreakdownEntry, RouteAnalysis, TrackPoint } from "./types";

// GPX files don't carry road/trail classification — the only way to know a
// route was 40% cycleway, 30% gravel, etc. is to match its coordinates
// against real-world map data. OpenStreetMap's Overpass API is the free,
// no-key way to get that data.
//
// Querying a route's whole rectangular bounding box is the obvious approach,
// but a long point-to-point route (as opposed to a tight loop) can have a
// bbox covering many times the area actually near the path — for a real
// ~10km route this produced a >90 km² box that timed out Overpass entirely
// (measured: HTTP 504 after ~15s). Querying "everything within 30m of these
// exact points" instead scopes the request to a narrow corridor along the
// route — but even that times out if too many points are passed: measured
// 354 points (one per 50m) still 504'd after 8s, 106 points (one per 300m)
// took a risky 17s, and only 69 points (one per 500m) reliably resolved in
// ~8s. So two spacings are used: a coarse one to build a cheap query, and
// the finer one only for tallying locally against whatever comes back —
// matching points against an already-fetched way list is nearly free, only
// the network request itself needed to shrink.
const OVERPASS_URL = "https://overpass-api.de/api/interpreter";
const QUERY_SPACING_METERS = 500; // keeps the Overpass request itself fast
const TALLY_SPACING_METERS = 50; // fine enough for an accurate breakdown once we have the data
const MAX_MATCH_DISTANCE_METERS = 30; // both the corridor radius and the local match cutoff

type OverpassLatLon = { lat: number; lon: number };
type OverpassWay = {
  tags?: Record<string, string>;
  geometry?: OverpassLatLon[];
};
type OverpassResponse = {
  elements: OverpassWay[];
};

function bucketHighway(highway: string | undefined): string {
  if (!highway) return "Unknown";
  if (highway === "cycleway") return "Cycleway";
  if (["track", "path", "bridleway"].includes(highway)) return "Trail";
  if (["footway", "pedestrian", "steps"].includes(highway)) return "Footpath";
  if (
    ["residential", "living_street", "service", "unclassified"].includes(
      highway
    )
  ) {
    return "Residential road";
  }
  if (["primary", "secondary", "tertiary", "trunk"].includes(highway)) {
    return "Main road";
  }
  return "Other";
}

function bucketSurface(surface: string | undefined): string {
  if (!surface) return "Unknown";
  if (
    ["paved", "asphalt", "concrete", "concrete:plates", "paving_stones"].includes(
      surface
    )
  ) {
    return "Paved";
  }
  if (["unpaved", "compacted", "fine_gravel", "gravel"].includes(surface)) {
    return "Gravel";
  }
  if (["dirt", "earth", "ground", "grass", "mud", "sand"].includes(surface)) {
    return "Unpaved";
  }
  return "Other";
}

function tally(counts: Map<string, number>, label: string): void {
  counts.set(label, (counts.get(label) ?? 0) + 1);
}

function toPercentBreakdown(counts: Map<string, number>): BreakdownEntry[] {
  const total = [...counts.values()].reduce((a, b) => a + b, 0);
  if (total === 0) return [];
  return [...counts.entries()]
    .map(([label, count]) => ({
      label,
      percent: Math.round((count / total) * 100),
    }))
    .sort((a, b) => b.percent - a.percent);
}

/** Roughly one sample every spacingMeters along the track. */
function downsample(points: TrackPoint[], spacingMeters: number): TrackPoint[] {
  const sampled: TrackPoint[] = [];
  let distanceSinceLast = spacingMeters; // force-include the first point
  for (let i = 0; i < points.length; i++) {
    if (i > 0) distanceSinceLast += haversineMeters(points[i - 1], points[i]);
    if (distanceSinceLast >= spacingMeters) {
      sampled.push(points[i]);
      distanceSinceLast = 0;
    }
  }
  return sampled;
}

/**
 * Distance from a point to a line segment, in meters. Treats lat/lon as
 * locally planar (scaling longitude by cos(latitude)) since segments here
 * span at most a few dozen meters — accurate enough at that scale. Exported
 * for reuse by src/lib/navigation.ts's off-route detection.
 */
export function distanceToSegmentMeters(
  point: TrackPoint,
  a: OverpassLatLon,
  b: OverpassLatLon
): number {
  const lonScale = Math.cos((point.lat * Math.PI) / 180);
  const ax = a.lon * lonScale;
  const ay = a.lat;
  const bx = b.lon * lonScale;
  const by = b.lat;
  const px = point.lon * lonScale;
  const py = point.lat;

  const dx = bx - ax;
  const dy = by - ay;
  const lengthSq = dx * dx + dy * dy;
  const t =
    lengthSq === 0
      ? 0
      : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSq));
  const projLon = (ax + t * dx) / lonScale;
  const projLat = ay + t * dy;

  return haversineMeters(point, {
    lat: projLat,
    lon: projLon,
    ele: null,
    time: null,
  });
}

function nearestWayTags(
  point: TrackPoint,
  ways: OverpassWay[]
): Record<string, string> | null {
  let best: { distance: number; tags: Record<string, string> } | null = null;

  for (const way of ways) {
    const geometry = way.geometry;
    if (!geometry || geometry.length < 2 || !way.tags) continue;

    for (let i = 1; i < geometry.length; i++) {
      const distance = distanceToSegmentMeters(
        point,
        geometry[i - 1],
        geometry[i]
      );
      if (distance <= MAX_MATCH_DISTANCE_METERS && (!best || distance < best.distance)) {
        best = { distance, tags: way.tags };
      }
    }
  }

  return best?.tags ?? null;
}

/**
 * Matches a track against OpenStreetMap to estimate what fraction of it runs
 * on cycleways vs roads, paved vs unpaved, etc. Returns null on any failure
 * (offline, Overpass unavailable, nothing nearby tagged) — callers should
 * treat that as "not available," not an error.
 */
export async function analyzeRoute(points: TrackPoint[]): Promise<RouteAnalysis> {
  if (points.length === 0) return null;

  const queryPoints = downsample(points, QUERY_SPACING_METERS);
  if (queryPoints.length === 0) return null;

  const corridor = queryPoints.map((p) => `${p.lat},${p.lon}`).join(",");
  const query =
    `[out:json][timeout:25];` +
    `way(around:${MAX_MATCH_DISTANCE_METERS},${corridor})["highway"];` +
    `out geom;`;

  let ways: OverpassWay[];
  try {
    const response = await fetch(OVERPASS_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
        // Overpass's Apache front-end returns a flat HTTP 406 for the
        // literal default User-Agent Android's OkHttp sends ("okhttp/x.y.z")
        // — a generic anti-scraping rule, unrelated to the query itself.
        // curl and browsers each send their own distinct UA and pass; a
        // custom one here does the same for React Native's fetch.
        "User-Agent": "gpx-reader/1.0",
      },
      body: `data=${encodeURIComponent(query)}`,
    });
    if (!response.ok) {
      const body = await response.text();
      console.error(
        "gpx-reader: Overpass returned",
        response.status,
        body.slice(0, 500)
      );
      return null;
    }
    const data: OverpassResponse = await response.json();
    ways = data.elements ?? [];
    console.log("gpx-reader: Overpass returned", ways.length, "ways");
  } catch (err) {
    console.error("gpx-reader: Overpass request failed:", err);
    return null;
  }

  if (ways.length === 0) return null;

  const highwayCounts = new Map<string, number>();
  const surfaceCounts = new Map<string, number>();

  for (const point of downsample(points, TALLY_SPACING_METERS)) {
    const tags = nearestWayTags(point, ways);
    tally(highwayCounts, bucketHighway(tags?.highway));
    tally(surfaceCounts, bucketSurface(tags?.surface));
  }

  const wayTypes = toPercentBreakdown(highwayCounts);
  const surfaces = toPercentBreakdown(surfaceCounts);
  if (wayTypes.length === 0 && surfaces.length === 0) return null;

  return { wayTypes, surfaces };
}
