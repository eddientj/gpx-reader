# Build Log

A running log of how this app was built, in the order it happened. Kept because a handful of the decisions below (especially the free-service workarounds) aren't obvious from the code alone.

## 2026-08-18 (later) — Phase E, 3D nav camera, off-route warning, waypoint address/distance, first release APK

- **Phase E (edit an imported GPX's track).** `src/lib/simplify.ts` (new): Douglas-Peucker line simplification derives a manageable set of editable control waypoints from a dense imported track. `RoutePlannerScreen` accepts an optional `editRideId` param, loading either the derived waypoints (imported route) or the existing waypoints as-is (already-planned route). `storage.ts` gained `updateRoute()` to overwrite a route in place, alongside the existing always-new `savePlannedRoute()` — the save flow asks the user which they want via a two-option Alert. `RideDetailScreen` gained an "Edit Route" button next to Navigate.
- **3D pitched, heading-oriented navigation camera.** `LiveMapRoute.tsx` now tilts the camera (`pitch: 55`) and rotates it to face the direction of travel, computed via a new `bearingBetween()` in `navigation.ts`, with a minimum-movement threshold so GPS jitter while stationary doesn't spin the camera.
- **Off-route-start warning.** `RecordScreen`'s `handleStart` checks distance to the target route's first point before recording begins; beyond 500m it confirms via an Alert rather than silently tracking a ride that never touches the plan.
- **Waypoint address + distance-into-route.** `geocoding.ts` gained `reverseGeocode()` (Nominatim `/reverse`); `stats.ts` gained `distanceAlongRouteMeters()`. `RideDetailScreen` resolves unnamed waypoints to real addresses one at a time (Nominatim's 1 req/sec limit), persisting each as it resolves; `WaypointsList` now shows both the address and how far into the route it sits.
- **Fixed**: the "Navigate" button silently did nothing on a repeat tap. `RecordScreen`'s target-route-loading effect depended on the extracted `route.params?.navigateRouteId` string rather than the params object itself — React Navigation merges a new params object on every `navigate()` call, but the id string is identical when re-navigating to the same route, so the effect's dependency saw no change and never reran, leaving the previous session's (often already-cleared) target route in place. Fixed by depending on the whole `route.params` object. Verified via a genuinely fresh app process navigating to the same route twice.
- **First release-signed build.** Built a standalone `assembleRelease` APK (`android/app/build/outputs/apk/release/app-release.apk`) for direct install by a tester — bundles the JS with `dev=false`, so it runs without Metro. Signed with the project's debug keystore (the release build type's default `signingConfig` since prebuild) — fine for handing to a friend, **not** acceptable for a Play Store submission, which needs its own real release keystore.

## 2026-08-17 — Bug fixes, separate My Rides tab, legacy data cleanup

- **Fixed**: `MapRoute` (Ride Detail's static map) had no guard against fewer than 2 GPS points, unlike `LiveMapRoute` — caused a real "Invalid geometry" MapLibre warning on any short ride. Same guard added, plus a matching one in `RoutePlannerScreen` for a degenerate single-point OSRM route (two waypoints dragged onto each other).
- **Fixed**: `LiveMapRoute` rebuilt its GeoJSON on every render rather than only when the underlying points changed, pushing a full re-parse to MapLibre's native layer every 2s poll regardless of route size — memoized it. Caught and fixed a Rules-of-Hooks ordering bug in the same pass.
- **Fixed**: `RecordScreen` had no error handling if loading a target route failed, and could show a stale "Navigate: X" banner if reopened without one while nothing was recording.
- **Fixed**: the origin-inference fallback for rides saved before `sourceFileName` existed as a field defaulted them to `"recorded"` — but recording didn't exist as a feature that early, so they must have been imports. Corrected two legacy rows' stored data directly.
- **Root-caused, not a bug**: "the map isn't showing up" during Navigate turned out to be the device's system Location Services toggle being off, not an app issue — the app's own permissions were always correctly granted.
- **My Rides tab**: split into a separate bottom tab from Routes (rather than sections on one screen) so it scales as the list grows. Extracted a shared `RidesList` component so the two tabs' row rendering and swipe-to-delete isn't duplicated.
- **Lesson learned the hard way**: never run `adb uninstall`/`pm clear` on this app to get a "clean" test state — it wipes `files/rides/*` entirely. Android's Auto Backup happened to restore an older snapshot this time, but that's not guaranteed. Back up `files/rides/index.json` and each ride's `{id}.json` first if a clean slate is genuinely needed.

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
