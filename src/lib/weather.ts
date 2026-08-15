import { getRide, saveWeather } from "./storage";
import type { WeatherSummary } from "./types";

// Rides are imported after they happened, so "weather" means what it was
// like that day, not a forecast. Open-Meteo's historical archive is free,
// keyless, and keyed on plain lat/lon + date.
const ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive";

// https://open-meteo.com/en/docs — condensed to short labels.
const WEATHER_CODE_LABELS: Record<number, string> = {
  0: "Clear sky",
  1: "Mainly clear",
  2: "Partly cloudy",
  3: "Overcast",
  45: "Fog",
  48: "Fog",
  51: "Light drizzle",
  53: "Drizzle",
  55: "Heavy drizzle",
  56: "Freezing drizzle",
  57: "Freezing drizzle",
  61: "Light rain",
  63: "Rain",
  65: "Heavy rain",
  66: "Freezing rain",
  67: "Freezing rain",
  71: "Light snow",
  73: "Snow",
  75: "Heavy snow",
  77: "Snow grains",
  80: "Light showers",
  81: "Showers",
  82: "Heavy showers",
  85: "Snow showers",
  86: "Snow showers",
  95: "Thunderstorm",
  96: "Thunderstorm with hail",
  99: "Thunderstorm with hail",
};

function labelForWeatherCode(code: number): string {
  return WEATHER_CODE_LABELS[code] ?? "Unknown conditions";
}

type ArchiveResponse = {
  daily?: {
    temperature_2m_max?: number[];
    temperature_2m_min?: number[];
    precipitation_sum?: number[];
    weathercode?: number[];
  };
};

/**
 * Historical weather for a ride's date and starting location. Returns null
 * if the date can't be determined, the API has no data yet for very recent
 * dates, or the request fails — callers should show "not available", not an
 * error.
 */
export async function fetchHistoricalWeather(
  lat: number,
  lon: number,
  dateIso: string
): Promise<WeatherSummary | null> {
  const date = dateIso.slice(0, 10); // YYYY-MM-DD
  const url =
    `${ARCHIVE_URL}?latitude=${lat}&longitude=${lon}` +
    `&start_date=${date}&end_date=${date}` +
    `&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,weathercode` +
    `&timezone=auto`;

  try {
    const response = await fetch(url);
    if (!response.ok) return null;

    const data: ArchiveResponse = await response.json();
    const tempMaxC = data.daily?.temperature_2m_max?.[0];
    const tempMinC = data.daily?.temperature_2m_min?.[0];
    const precipitationMm = data.daily?.precipitation_sum?.[0];
    const weatherCode = data.daily?.weathercode?.[0];

    if (
      tempMaxC === undefined ||
      tempMinC === undefined ||
      precipitationMm === undefined ||
      weatherCode === undefined
    ) {
      return null;
    }

    return {
      tempMaxC,
      tempMinC,
      precipitationMm,
      condition: labelForWeatherCode(weatherCode),
    };
  } catch {
    return null;
  }
}

/**
 * Fetches and caches a ride's weather if it isn't already cached — a no-op
 * for rides that already have it. Meant to be called right after a ride is
 * saved (import or recording) so the detail screen never has to fetch live;
 * safe to call again later as a backfill since it checks the cache first.
 */
export async function ensureWeatherCached(id: string): Promise<void> {
  const ride = await getRide(id);
  if (ride.weather !== null) return;

  const first = ride.points[0];
  if (!first) return;

  const dateIso = first.time ?? ride.importedAt;
  const weather = await fetchHistoricalWeather(first.lat, first.lon, dateIso);
  if (weather) await saveWeather(id, weather);
}
