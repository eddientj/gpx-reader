import { Directory, File, Paths } from "expo-file-system";
import { parseGpx } from "./gpx";
import { computeStats } from "./stats";
import type {
  ActivityType,
  RideDetail,
  RideSummary,
  RouteAnalysis,
  RouteOrigin,
  RouteStep,
  TrackPoint,
  Waypoint,
  WeatherSummary,
} from "./types";

const ridesDir = new Directory(Paths.document, "rides");

// What actually lives in a ride's {id}.json file, separate from the summary
// kept in the index. Older saves before waypoints/description/routeAnalysis/
// weather existed wrote a bare TrackPoint[] instead of this shape —
// readRideFile upgrades those on the fly rather than treating them as
// corrupted.
type RideFile = {
  points: TrackPoint[];
  waypoints: Waypoint[];
  description: string | null;
  routeAnalysis: RouteAnalysis;
  weather: WeatherSummary | null;
  navigationSteps: RouteStep[] | null;
};

function ensureRidesDir(): void {
  if (!ridesDir.exists) {
    ridesDir.create({ intermediates: true });
  }
}

function ridePointsFile(id: string): File {
  return new File(ridesDir, `${id}.json`);
}

function indexFile(): File {
  return new File(ridesDir, "index.json");
}

function writeFile(file: File, content: string): void {
  if (!file.exists) {
    file.create({ intermediates: true });
  }
  file.write(content);
}

function readIndex(): RideSummary[] {
  ensureRidesDir();
  const file = indexFile();
  if (!file.exists) return [];

  const raw = file.textSync();
  try {
    const index: RideSummary[] = JSON.parse(raw);
    // Rides saved before activityType/origin existed simply lack the field.
    // origin infers from sourceFileName, but that inference has two distinct
    // eras to account for: once sourceFileName existed as a tracked field,
    // "present -> imported, explicit null -> recorded" is unambiguous. But
    // rides saved before sourceFileName was tracked at all (the field is
    // missing from the JSON entirely, not just null) predate live recording
    // existing as a feature — at that point every ride was necessarily an
    // import, so those must default to "imported", not "recorded" (which
    // would otherwise wrongly show them with Avg/Max Speed cards).
    return index.map((r) => ({
      ...r,
      activityType: r.activityType ?? "cycling",
      origin:
        r.origin ??
        ("sourceFileName" in r
          ? r.sourceFileName
            ? "imported"
            : "recorded"
          : "imported"),
    }));
  } catch (err) {
    // Surface the actual corrupted content rather than letting listRides()
    // reject silently — a caller with no .catch() would otherwise see an
    // empty ride list that looks identical to genuine data loss.
    console.error(
      "gpx-reader: rides index.json is not valid JSON:",
      raw.slice(0, 500)
    );
    throw new Error(
      `Saved ride list is corrupted: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

function writeIndex(index: RideSummary[]): void {
  writeFile(indexFile(), JSON.stringify(index));
}

function readRideFile(id: string): RideFile {
  const parsed = JSON.parse(ridePointsFile(id).textSync());
  // Legacy files are a bare array of points.
  if (Array.isArray(parsed)) {
    return {
      points: parsed,
      waypoints: [],
      description: null,
      routeAnalysis: null,
      weather: null,
      navigationSteps: null,
    };
  }
  // Files saved before weather caching / navigationSteps existed simply
  // lack those keys.
  const ride = parsed as RideFile;
  return {
    ...ride,
    weather: ride.weather ?? null,
    navigationSteps: ride.navigationSteps ?? null,
  };
}

function writeRideFile(id: string, ride: RideFile): void {
  writeFile(ridePointsFile(id), JSON.stringify(ride));
}

type NewRide = {
  name: string;
  points: TrackPoint[];
  waypoints: Waypoint[];
  description: string | null;
  sourceFileName: string | null;
  activityType: ActivityType;
  origin: RouteOrigin;
  navigationSteps?: RouteStep[] | null;
};

/** Shared by both import (saveRide) and live recording (saveRecordedRide):
 * compute stats, write the ride's data file, and append its summary to the
 * index. */
function persistNewRide(ride: NewRide): RideSummary {
  const stats = computeStats(ride.points);
  const id = `${Date.now()}`;

  ensureRidesDir();
  writeRideFile(id, {
    points: ride.points,
    waypoints: ride.waypoints,
    description: ride.description,
    routeAnalysis: null,
    weather: null,
    navigationSteps: ride.navigationSteps ?? null,
  });

  const summary: RideSummary = {
    id,
    name: ride.name,
    importedAt: new Date().toISOString(),
    stats,
    sourceFileName: ride.sourceFileName,
    activityType: ride.activityType,
    origin: ride.origin,
  };

  const index = readIndex();
  index.push(summary);
  writeIndex(index);

  return summary;
}

export async function saveRide(
  xml: string,
  fallbackName: string,
  sourceFileName: string | null
): Promise<RideSummary> {
  const { name: trackName, points, waypoints, description } = parseGpx(xml);
  return persistNewRide({
    name: trackName ?? fallbackName,
    points,
    waypoints,
    description,
    sourceFileName,
    activityType: "cycling",
    origin: "imported",
  });
}

/** Saves a ride recorded live in-app — no GPX/XML involved, so no
 * waypoints/description/source file the way an import has. */
export async function saveRecordedRide(
  points: TrackPoint[],
  activityType: ActivityType,
  name: string
): Promise<RideSummary> {
  return persistNewRide({
    name,
    points,
    waypoints: [],
    description: null,
    sourceFileName: null,
    activityType,
    origin: "recorded",
  });
}

/** Saves a route the user designed in the planner — waypoints are the
 * user-placed stops, points are OSRM's dense snapped-to-roads path. Not
 * ridden yet, so no description/source file the way an import has either. */
export async function savePlannedRoute(
  waypoints: Waypoint[],
  points: TrackPoint[],
  name: string,
  navigationSteps: RouteStep[]
): Promise<RideSummary> {
  return persistNewRide({
    name,
    points,
    waypoints,
    description: null,
    sourceFileName: null,
    activityType: "cycling",
    origin: "planned",
    navigationSteps,
  });
}

/**
 * Overwrites an existing route's waypoints/track in place (as opposed to
 * `savePlannedRoute`, which always creates a new entry) — used when editing
 * a route from `RoutePlannerScreen` and choosing to update rather than
 * save as a new route. Once edited this way the route is a plan (explicit
 * waypoints + a recalculated path), not literally the original imported
 * file anymore, so its origin moves to `"planned"` and its stale
 * way-type/weather analysis (computed against the old track) is cleared
 * rather than left showing data for a path that no longer matches.
 */
export async function updateRoute(
  id: string,
  waypoints: Waypoint[],
  points: TrackPoint[],
  navigationSteps: RouteStep[]
): Promise<RideSummary> {
  const ride = readRideFile(id);
  writeRideFile(id, {
    ...ride,
    points,
    waypoints,
    navigationSteps,
    routeAnalysis: null,
    weather: null,
  });

  const index = readIndex();
  const existing = index.find((r) => r.id === id);
  if (!existing) throw new Error(`Ride ${id} not found`);

  const updated: RideSummary = {
    ...existing,
    stats: computeStats(points),
    origin: "planned",
  };
  writeIndex(index.map((r) => (r.id === id ? updated : r)));
  return updated;
}

export async function listRides(): Promise<RideSummary[]> {
  const index = readIndex();
  return [...index].sort((a, b) => b.importedAt.localeCompare(a.importedAt));
}

export async function getRide(id: string): Promise<RideDetail> {
  const index = readIndex();
  const summary = index.find((r) => r.id === id);
  if (!summary) throw new Error(`Ride ${id} not found`);

  const ride = readRideFile(id);

  return { ...summary, ...ride };
}

/**
 * Persists a route's way-type/surface analysis so it's computed once per
 * ride rather than re-fetched from Overpass on every screen visit.
 */
export async function saveRouteAnalysis(
  id: string,
  routeAnalysis: RouteAnalysis
): Promise<void> {
  const ride = readRideFile(id);
  writeRideFile(id, { ...ride, routeAnalysis });
}

/** Persists resolved waypoint names (e.g. reverse-geocoded addresses) so
 * they're only ever looked up once per waypoint. */
export async function saveWaypoints(
  id: string,
  waypoints: Waypoint[]
): Promise<void> {
  const ride = readRideFile(id);
  writeRideFile(id, { ...ride, waypoints });
}

/**
 * Persists a ride's historical weather so it's fetched once, not on every
 * screen visit — the ride's date and location never change after import.
 */
export async function saveWeather(
  id: string,
  weather: WeatherSummary | null
): Promise<void> {
  const ride = readRideFile(id);
  writeRideFile(id, { ...ride, weather });
}

export async function deleteRide(id: string): Promise<void> {
  const index = readIndex();
  writeIndex(index.filter((r) => r.id !== id));
  const file = ridePointsFile(id);
  if (file.exists) {
    file.delete();
  }
}
