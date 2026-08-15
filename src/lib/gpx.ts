import { XMLParser } from "fast-xml-parser";
import type { TrackPoint, Waypoint } from "./types";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
});

function asArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function toNumber(value: unknown): number | null {
  if (value === undefined || value === null) return null;
  const n = typeof value === "number" ? value : parseFloat(String(value));
  return Number.isFinite(n) ? n : null;
}

function toName(value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const trimmed = String(value).trim();
  return trimmed.length > 0 ? trimmed : null;
}

export type ParsedGpx = {
  /** The ride's own name, if the file declares one. */
  name: string | null;
  points: TrackPoint[];
  waypoints: Waypoint[];
  /** The track's own description/comment, if the file declares one. */
  description: string | null;
};

function parseWaypoints(gpx: Record<string, unknown>): Waypoint[] {
  const waypoints: Waypoint[] = [];
  for (const wpt of asArray(gpx.wpt as Record<string, unknown> | undefined)) {
    const lat = toNumber((wpt as Record<string, unknown>)["@_lat"]);
    const lon = toNumber((wpt as Record<string, unknown>)["@_lon"]);
    if (lat === null || lon === null) continue;
    waypoints.push({
      name: toName((wpt as Record<string, unknown>).name),
      lat,
      lon,
      ele: toNumber((wpt as Record<string, unknown>).ele),
    });
  }
  return waypoints;
}

export function parseGpx(xml: string): ParsedGpx {
  const doc = parser.parse(xml);
  const gpx = doc.gpx;
  if (!gpx) throw new Error("Not a valid GPX file");

  const tracks = asArray(gpx.trk);
  const points: TrackPoint[] = [];

  for (const track of tracks) {
    const segments = asArray(track.trkseg);
    for (const segment of segments) {
      const trkpts = asArray(segment.trkpt);
      for (const pt of trkpts) {
        const lat = toNumber(pt["@_lat"]);
        const lon = toNumber(pt["@_lon"]);
        if (lat === null || lon === null) continue;
        points.push({
          lat,
          lon,
          ele: toNumber(pt.ele),
          time: typeof pt.time === "string" ? pt.time : null,
        });
      }
    }
  }

  if (points.length === 0) {
    throw new Error("GPX file has no track points");
  }

  // Prefer the track's own name over the file's metadata title — it's the one
  // recording apps set per ride.
  const name = toName(tracks[0]?.name) ?? toName(gpx.metadata?.name);
  const description = toName(tracks[0]?.desc) ?? toName(tracks[0]?.cmt);
  const waypoints = parseWaypoints(gpx);

  return { name, points, waypoints, description };
}
