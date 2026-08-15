// Nominatim (OpenStreetMap's free geocoder) — no API key, but its usage
// policy requires a custom User-Agent (same fix needed for Overpass in
// waytypes.ts — React Native's fetch doesn't send one on its own) and caps
// usage at 1 request/second, so callers must debounce search input rather
// than firing on every keystroke.
const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";

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
