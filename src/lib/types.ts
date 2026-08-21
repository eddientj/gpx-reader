export type TrackPoint = {
  lat: number;
  lon: number;
  ele: number | null;
  time: string | null;
};

/**
 * A union on purpose, not a hardcoded single value — recording currently
 * only supports cycling, but adding "running" | "walking" later should be
 * additive (new UI + stat-label branching), not a data migration.
 */
export type ActivityType = "cycling";

/**
 * How a route entry came to exist — distinguishes an actual ride you took
 * (real speed/timestamps) from a file someone else exported (may have real
 * timestamps but isn't "your" pace) and from a route you planned but
 * haven't ridden yet (no timestamps at all). Stat visibility (e.g. Avg/Max
 * Speed) branches on this rather than on `sourceFileName`, since a planned
 * route also has a null `sourceFileName` but clearly isn't "recorded."
 */
export type RouteOrigin = "imported" | "recorded" | "planned";

export type Waypoint = {
  name: string | null;
  lat: number;
  lon: number;
  ele: number | null;
};

export type RideStats = {
  distanceMeters: number;
  durationSeconds: number | null;
  elevationGainMeters: number;
  elevationLossMeters: number;
  avgSpeedKmh: number | null;
  maxSpeedKmh: number | null;
  minEle: number | null;
  maxEle: number | null;
};

/** One entry's share of the route, e.g. { label: "Paved", percent: 72 }. */
export type BreakdownEntry = {
  label: string;
  percent: number;
};

/** One classification sample along the route, at the same spacing the
 * breakdown percentages themselves were tallied from — lets the elevation
 * chart color itself by way type/surface without a second Overpass pass. */
export type RouteSegment = {
  distanceMeters: number;
  wayType: string;
  surface: string;
};

export type RouteAnalysis = {
  wayTypes: BreakdownEntry[];
  surfaces: BreakdownEntry[];
  segments: RouteSegment[];
} | null;

export type WeatherSummary = {
  tempMaxC: number;
  tempMinC: number;
  precipitationMm: number;
  condition: string;
};

/** One turn-by-turn instruction from OSRM — lives here rather than in
 * routing.ts so RideDetail can reference it without routing.ts and types.ts
 * importing each other. */
export type RouteStep = {
  type: string; // "turn" | "depart" | "arrive" | "roundabout" | ...
  modifier: string | null; // "left" | "right" | "straight" | ...
  name: string; // street name — can be empty for unnamed ways
  distanceMeters: number;
  /** Where this maneuver happens — needed to know when the live position is
   * close enough to speak it. */
  lat: number;
  lon: number;
};

export type RideSummary = {
  id: string;
  name: string;
  importedAt: string;
  stats: RideStats;
  /**
   * The original file's display name at import time (e.g. "Botani-Route1.gpx"),
   * distinct from `name` which may come from the GPX's own internal track
   * name instead. Used to recognize a file that's already been imported.
   * Null for rides that were recorded in-app rather than imported.
   */
  sourceFileName: string | null;
  activityType: ActivityType;
  origin: RouteOrigin;
};

export type RideDetail = RideSummary & {
  points: TrackPoint[];
  waypoints: Waypoint[];
  description: string | null;
  routeAnalysis: RouteAnalysis;
  /** Cached once fetched — the ride's date never changes, so neither does its weather. */
  weather: WeatherSummary | null;
  /** Turn-by-turn steps from when a planned route's path was calculated —
   * null for imported/recorded rides, which were never "routed." Used by
   * Navigate mode to know what to speak and when. */
  navigationSteps: RouteStep[] | null;
};
