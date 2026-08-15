# gpx-reader

A personal Android app for importing, viewing, recording, and planning GPX cycling routes — built to avoid paying a Komoot/Strava-style subscription just to look at my own rides.

Built with Expo / React Native (SDK 57).

## Why

Most ride-tracking apps gate basic features (route planning, turn-by-turn navigation, ride history) behind a subscription. This app does the same job for the rides I actually care about, using only free, no-API-key data sources.

## Features

- **Import GPX files** — parses tracks, waypoints, and descriptions from any standard `.gpx` file (including via Android's "Open with" file association).
- **Route analysis** — distance, duration, elevation gain/loss, and an elevation profile chart for every route.
- **Way type & surface breakdown** — matches a route's coordinates against OpenStreetMap (via the Overpass API) to estimate what fraction of it runs on cycleways, trails, paved roads, gravel, etc.
- **Historical weather** — looks up the weather at the time and place a ride happened (via Open-Meteo).
- **Live GPS recording** — background location tracking (survives the screen turning off or the app being backgrounded), with pause/resume and a full-screen live map.
- **Route planning** — an interactive map (search for a place, drop/move waypoints, toggle standard/satellite layers) that calculates a real cycling route snapped to roads via OSRM, complete with turn-by-turn maneuver data.
- **Turn-by-turn voice navigation** — start "Navigate" on a planned route and get spoken directions as you ride, with automatic off-route rerouting; the ride is recorded live at the same time.
- **Compare routes** — side-by-side stats for any two saved routes.
- **Rides vs. Routes** — a saved GPS recording, an imported GPX file, and a planned-but-unridden route are tracked distinctly, so stats like average speed only ever show up where they make sense.
- **Nature-themed light/dark UI** with animated transitions (Reanimated + Gesture Handler).

## Tech stack

| Concern | Choice | Why |
|---|---|---|
| App framework | Expo (SDK 57) / React Native | Managed native modules, fast iteration |
| Maps | [MapLibre GL](https://github.com/maplibre/maplibre-react-native) + [OpenFreeMap](https://openfreemap.org/) tiles | Free vector tiles, no API key |
| Cycling routing | [OSRM](http://project-osrm.org/) (FOSSGIS public instance) | Free cycling-profile routing with turn-by-turn steps |
| Place search | [Nominatim](https://nominatim.org/) | Free geocoding (OpenStreetMap data) |
| Way type / surface data | [Overpass API](https://overpass-api.de/) | Free OpenStreetMap tag queries |
| Historical weather | [Open-Meteo](https://open-meteo.com/) | Free, no-key historical weather API |
| Background GPS | `expo-location` + `expo-task-manager` | Headless location updates while backgrounded |
| Voice | `expo-speech` | Text-to-speech for turn-by-turn instructions |
| Animation | `react-native-reanimated` + `react-native-gesture-handler` | Smooth native-thread animations |

All third-party services used are free and require no API key — matching the project's whole reason for existing.

## Project structure

```
src/
  components/   Reusable UI (map views, stat cards, elevation chart, swipeable rows, ...)
  hooks/        useIncomingGpx — handles GPX files opened from outside the app
  lib/          Framework-free logic: gpx parsing, stats, storage, routing, geocoding,
                way-type analysis, weather, live navigation, background tracking
  navigation/   React Navigation stack/tab param types and the root navigator
  screens/      Home (route list), Ride Detail, Record, Route Planner, Compare
  theme/        Light/dark color tokens and ThemeContext
modules/        Custom native Expo module (GPX file-picker / "Open with" support)
plugins/        Expo config plugins (Android manifest tweaks for file association etc.)
assets/         App icons and a sample GPX fixture
```

## Getting started

Requires Node.js, an Android SDK (Android Studio), and a physical device or emulator — this app uses native modules, so it cannot run in Expo Go.

```bash
npm install
npx expo prebuild
npx expo run:android
```

`npx expo prebuild` regenerates the native `android/` project from `app.json` and the config plugins in `plugins/` — it isn't committed, and needs to be rerun after pulling changes that touch native config.

See [BUILD_LOG.md](BUILD_LOG.md) for the development history and notable technical decisions made along the way.

## License

MIT — see [LICENSE](LICENSE).
