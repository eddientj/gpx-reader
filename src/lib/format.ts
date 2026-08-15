// content:// URIs are opaque — their last path segment is usually a provider
// row id ("33"), not a filename — so only treat a name as meaningful when it
// actually looks like a GPX file. Callers fall back to the GPX file's own
// track name instead.
export function rideNameFromFileName(fileName: string): string | null {
  if (!/\.gpx$/i.test(fileName)) return null;
  const stripped = fileName.replace(/\.gpx$/i, "").trim();
  return stripped.length > 0 ? stripped : null;
}

export function formatDistance(meters: number): string {
  return `${(meters / 1000).toFixed(2)} km`;
}

export function formatDuration(seconds: number | null): string {
  if (seconds === null) return "—";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
  return `${m}m ${String(s).padStart(2, "0")}s`;
}

// Used only when a route has no GPS timestamps to compute a real duration
// from (common for GPX files exported without time data) — a rough
// leisurely-cycling pace, not a measurement, so callers must show this
// distinguishably (e.g. a "~" prefix) rather than as a real duration.
const ASSUMED_CYCLING_SPEED_KMH = 15;

export function formatDurationOrEstimate(
  durationSeconds: number | null,
  distanceMeters: number
): string {
  if (durationSeconds !== null) return formatDuration(durationSeconds);
  const estimatedSeconds =
    (distanceMeters / 1000 / ASSUMED_CYCLING_SPEED_KMH) * 3600;
  return `~${formatDuration(estimatedSeconds)}`;
}

export function formatSpeed(kmh: number | null): string {
  if (kmh === null) return "—";
  return `${kmh.toFixed(1)} km/h`;
}

export function formatElevation(meters: number | null): string {
  if (meters === null) return "—";
  return `${Math.round(meters)} m`;
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
