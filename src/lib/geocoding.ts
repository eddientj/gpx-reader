// Nominatim (OpenStreetMap's free geocoder) — no API key, but its usage
// policy requires a custom User-Agent (same fix needed for Overpass in
// waytypes.ts — React Native's fetch doesn't send one on its own) and caps
// usage at 1 request/second, so callers must debounce search input rather
// than firing on every keystroke.
const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
const NOMINATIM_REVERSE_URL = "https://nominatim.openstreetmap.org/reverse";

export type PlaceResult = {
  name: string;
  lat: number;
  lon: number;
};

type NominatimResult = {
  display_name?: string;
  lat?: string;
  lon?: string;
};

/**
 * Searches for a place by name. Returns an empty array on any failure or if
 * nothing matches — callers should treat that as "no results," not an error.
 */
export async function searchPlaces(query: string): Promise<PlaceResult[]> {
  const trimmed = query.trim();
  if (trimmed.length === 0) return [];

  const url = `${NOMINATIM_URL}?q=${encodeURIComponent(trimmed)}&format=json&limit=5`;

  try {
    const response = await fetch(url, {
      headers: { "User-Agent": "gpx-reader/1.0" },
    });
    if (!response.ok) return [];

    const data: NominatimResult[] = await response.json();
    return data
      .filter((r) => r.display_name && r.lat && r.lon)
      .map((r) => ({
        name: r.display_name as string,
        lat: parseFloat(r.lat as string),
        lon: parseFloat(r.lon as string),
      }));
  } catch {
    return [];
  }
}

/**
 * Resolves a coordinate to a human-readable address — used for a waypoint
 * that has no name of its own (e.g. dropped by tapping the map rather than
 * picked from search). Returns null on any failure; callers should cache a
 * successful result rather than re-resolving the same waypoint every time,
 * both to respect Nominatim's 1 request/second usage policy and because a
 * waypoint's coordinates never change once saved.
 */
export async function reverseGeocode(
  lat: number,
  lon: number
): Promise<string | null> {
  const url = `${NOMINATIM_REVERSE_URL}?lat=${lat}&lon=${lon}&format=json`;

  try {
    const response = await fetch(url, {
      headers: { "User-Agent": "gpx-reader/1.0" },
    });
    if (!response.ok) return null;

    const data: NominatimResult = await response.json();
    return data.display_name ?? null;
  } catch {
    return null;
  }
}
