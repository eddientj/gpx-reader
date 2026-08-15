# Build Log

A running log of how this app was built, in the order it happened. Kept because a handful of the decisions below (especially the free-service workarounds) aren't obvious from the code alone.

## 2026-08-15 — Full-screen recording, route planning, voice navigation

- **Full-screen recording map (Phase A).** `RecordScreen` restructured so the live map fills the entire screen behind a floating, semi-transparent stats/controls card, instead of scrolling. Header and tab bar hide while a recording is active.
- **Interactive route planner (Phase B).** New `RoutePlannerScreen`: tap the map to add a waypoint, tap a waypoint then tap elsewhere to move it (this MapLibre binding has no native drag), debounced place search via Nominatim, a real cycling route (snapped to roads, with turn-by-turn steps) via a public OSRM instance, and a standard/satellite map style toggle. Saves as a new route with `origin: "planned"`.
- **Turn-by-turn voice navigation (Phase C).** `src/lib/navigation.ts` adds proximity-based maneuver announcements (checks *all* unspoken steps each poll, not just the next one — otherwise a missed 50m trigger window at riding speed could permanently stall every later instruction) and off-route detection. `RecordScreen` accepts an optional target route, draws it as a dashed reference line, speaks each instruction once via `expo-speech`, and reroutes (fresh OSRM call) if the live position strays too far from the path. Verified on-device with a stationary test: the "Head out" and next-turn announcements both fired correctly and Stop & Save produced a normal ride afterward. Off-route rerouting and the 50m/40m trigger distances still need tuning against a real ride.
- **Data model**: added a `RouteOrigin` (`"imported" | "recorded" | "planned"`) field, replacing a `sourceFileName === null` heuristic that broke once a route could exist without ever being ridden. Avg/Max Speed and the weather section are now gated on this field instead.
- **Crash fix**: background location delivery was crashing the app via `expo-task-manager`'s persisted `JobScheduler` job, which requires `android.permission.RECEIVE_BOOT_COMPLETED` — added to `app.json`.
- **Polish pass**: tab bar icons (was rendering as broken "tofu" boxes, fixed with `@expo/vector-icons`), Rides→Routes terminology, removed the separate Discard-ride flow (Stop & Save always saves; delete via swipe), route list rows show Distance/Duration(-or-estimate)/Elevation.

## 2026-08-12/13 — Theming, animation, background recording

- Nature-themed light/dark color system (`src/theme`) — every screen/component uses a `makeStyles(theme)` factory instead of static stylesheets.
- `react-native-reanimated` + `react-native-gesture-handler` for entrance/press animations and a gesture-driven swipeable row (list-item delete).
- Live GPS recording (`src/lib/tracking.ts`) via `expo-location` + `expo-task-manager`, surviving the app being backgrounded or killed mid-recording. Bottom-tab navigation (Routes / Record / Compare) replaced the original single-stack layout.

## 2026-08-10 — Route analysis, weather, data persistence

- GPX parsing extended to waypoints and track descriptions.
- Way-type/surface breakdown (`src/lib/waytypes.ts`): matches a route against OpenStreetMap via the Overpass API. A full route bounding-box query was too slow for anything but a tight loop (measured >90km² boxes timing out); querying a corridor around downsampled points instead keeps it fast.
- Historical weather lookup for the time and place a ride happened, via Open-Meteo — prefetched right after import and backfilled once per app run for older rides.
- Komoot-style ride detail screen: map, stats, elevation chart, way-type/surface bars, weather card.

## 2026-08-09 — Initial import & viewer

- Expo project scaffolded; GPX import (including Android's "Open with" file association via a custom native module), parsing, a route list, and a basic ride detail view (map + stats).

---

Every external data source used here (OSRM, Nominatim, Overpass, Open-Meteo, OpenFreeMap tiles) is free and requires no API key — each is wrapped defensively (try/catch → `null`/"not available") since none of them carry an uptime guarantee.
