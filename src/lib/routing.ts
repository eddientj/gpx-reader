import type { RouteStep, TrackPoint } from "./types";

// FOSSGIS's public OSRM instance — free, no API key, and (unlike the
// default OSRM demo server) actually serves a cycling profile, since it's
// the same instance that powers bike directions on openstreetmap.org.
// Community-run with no SLA, same caveat class as Overpass in waytypes.ts —
// handled the same way: try/catch to null, never a crash.
const OSRM_URL = "https://routing.openstreetmap.de/routed-bike/route/v1/bike";

export type CalculatedRoute = {
  points: TrackPoint[];
  distanceMeters: number;
  steps: RouteStep[];
};

type OsrmManeuver = {
  type?: string;
  modifier?: string;
  location?: [number, number];
};

type OsrmStep = {
  maneuver?: OsrmManeuver;
  name?: string;
  distance?: number;
};

type OsrmLeg = {
  steps?: OsrmStep[];
};

type OsrmRoute = {
  distance?: number;
  geometry?: { coordinates?: [number, number][] };
  legs?: OsrmLeg[];
};

type OsrmResponse = {
  code?: string;
  routes?: OsrmRoute[];
};

/**
 * Calculates a cycling route (snapped to real roads) through an ordered
 * list of waypoints. Returns null on any failure, fewer than 2 waypoints,
 * or an unroutable set of points — callers should show "not available,"
 * not an error.
 */
export async function calculateRoute(
  waypoints: { lat: number; lon: number }[]
): Promise<CalculatedRoute | null> {
  if (waypoints.length < 2) return null;

  const coords = waypoints.map((w) => `${w.lon},${w.lat}`).join(";");
  const url = `${OSRM_URL}/${coords}?overview=full&geometries=geojson&steps=true`;

  try {
    const response = await fetch(url, {
      headers: { "User-Agent": "gpx-reader/1.0" },
    });
    if (!response.ok) return null;

    const data: OsrmResponse = await response.json();
    const route = data.routes?.[0];
    if (data.code !== "Ok" || !route?.geometry?.coordinates) return null;

    const points: TrackPoint[] = route.geometry.coordinates.map(
      ([lon, lat]) => ({ lat, lon, ele: null, time: null })
    );

    const steps: RouteStep[] = (route.legs ?? []).flatMap((leg) =>
      (leg.steps ?? []).map((step) => {
        const [lon, lat] = step.maneuver?.location ?? [0, 0];
        return {
          type: step.maneuver?.type ?? "turn",
          modifier: step.maneuver?.modifier ?? null,
          name: step.name ?? "",
          distanceMeters: step.distance ?? 0,
          lat,
          lon,
        };
      })
    );

    return { points, distanceMeters: route.distance ?? 0, steps };
  } catch {
    return null;
  }
}
