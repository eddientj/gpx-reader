# Backlog

Things we've decided to build eventually, but not now — kept separate from [BUILD_LOG.md](BUILD_LOG.md) (what's already done) so future work has somewhere to land instead of getting lost in a chat thread.

**Standing design principle:** keep the feature surface lean. Komoot is a genuinely good app, but the sheer number of functions and buttons makes it hard to navigate — every item below should be weighed against that cost, not just judged on whether it'd be useful in isolation.

## Strava-style ride detail redesign (map full-screen + slide-up sheet, black/green theme, Health Connect, advanced analytics)

**North star, stated directly**: "basically making another Strava for ourselves, but the goal is that I want to be able to read GPX files and track and record my activities." Strava is the reference for polish/features to aim toward, not the definition of what this app is for — GPX reading + activity tracking/recording is the actual core, and stays the priority if anything below ever conflicts with it. Worth re-reading this line before any future item on this list expands scope again.

Reference: 3 Strava activity screenshots (shared 2026-08-21) — a walk's summary view, that same activity's expanded pace chart, and a separate run's paygated-features section. Re-read closely (first pass missed real detail), broken out below by what each screenshot actually shows and what it implies for this app's own data model, not just its UI. More screenshots offered if useful — none requested yet since this pass already had enough to work from.

**Priority order confirmed:** (1) layout first, (2) theme, (3) Health Connect, (4) advanced analytics — achievements excluded even from (4), deferred further still.

### 1. Full-screen map + slide-up detail sheet (build first)

`RideDetailScreen` currently renders the map as one fixed 260px section inside a plain scrolling page. Screenshot 1 shows the real target: map fills the entire screen behind a minimal floating header (back arrow, bookmark/save icon, "⋮" more-options menu — all overlaid on the map itself, not a normal nav bar), plus a small floating ▶ play button on the map (previews/replays the route animating along the path). A bottom sheet sits over this, peeking at:
- Rider's avatar + name, date/time, and location text ("Subang Jaya, Selangor") — we'd only ever show the device owner, no multi-user concept, so this row simplifies to just date/time/location
- Activity title, then a stats grid (Distance / Moving Time / Elevation Gain / **Calories**)
- "With someone who didn't record? [Add Others]" — a companion-tagging affordance; not relevant, this app has no social/multi-person concept
- A data-source pill ("Samsung Health") — our equivalent would be showing origin (imported/recorded/planned), which already exists elsewhere
- Kudos/comment counts + like/comment/share row at the very bottom — social features, not relevant for a single-user local app; **share already exists** (the GPX export icon)

Dragging the sheet up (screenshot 2) reveals: a distance-scrubber bar sitting *above* the charts — and a second round of screenshots (also 2026-08-21) confirmed this scrubber is **shared across every chart on the page** (Speed and Elevation both sit under the same one), not a per-chart control. The charts themselves have real gridlines/axis labels; Elevation is a plain gray fill, but Speed (and the earlier pace chart) is a genuine **two-series overlay** — the actual activity's data in a solid color on top of a darker, translucent comparison band (a reference — likely a previous best or segment average, not yet confirmed which). Below each chart: a stat list consistently pairing **Moving Time with Elapsed Time**, and for pace specifically, **Avg Pace, Avg *Elapsed* Pace, Fastest Split** too — this is the stats-model gap below, and it shows up everywhere, not once.

**Needs a real decision before starting**: hand-roll the sheet with `react-native-gesture-handler`/`react-native-reanimated` (both already dependencies, but correct drag-vs-inner-scroll gesture arbitration and snap points is a genuinely hard, well-trodden UI problem to get right by hand) vs. add `@gorhom/bottom-sheet` (the de facto standard RN library for exactly this, built on the same two dependencies already in the project). Leaning toward the library, not decided — justify properly before adding, per this project's own tooling rule.

**Real stats-model gap surfaced here.** This app currently has one `durationSeconds` per ride — no distinction between *moving* time and *elapsed* time, no fastest-split, no moving-vs-elapsed pace. Strava's "moving time" excludes stops detected by a speed threshold (near-zero GPS speed), not just explicit pauses — different from this app's own pause/resume, which only excludes time the user *manually* paused (e.g. stopped at a light without tapping pause still counts as "moving" today).

**Attempted 2026-08-22, missed the mark — back on the backlog, not shipped.** Built `movingTimeSeconds`/`avgMovingSpeedKmh`/`fastestSplitKmh` into `stats.ts` (speed-threshold + a sliding 1km window), added a backward-compat fix in `storage.ts` for rides whose persisted stats predate these fields, and surfaced them as new StatCards in `RideDetailScreen`. Verified the arithmetic itself is correct against real data, but the result wasn't what was actually wanted — needs to go through Eddie's exact idea for this rather than my own read of the Strava reference before touching it again. Code is left in place (typechecks, doesn't crash) but should be treated as a rough draft, not a finished feature — don't build on top of it without re-confirming the shape it should actually take.

**Map and menu detail confirmed from the map itself, not just the sheet:**
- PR/milestone markers are pinned directly on the route at the exact point they happened ("Fastest 10K Lifetime," "Fastest 30K Lifetime," "2nd longest ride Lifetime") — not just listed as text, tied to location.
- The "⋮" menu: Add Media, Edit Activity, **Crop Activity** (trim the start/end of a recorded track — genuinely useful on its own, e.g. cutting off walking to the car before a ride actually started), **Edit Map Visibility** (privacy zones — masking parts of a route, relevant even for a single-user app if GPX export could otherwise leak a home address), Save Route, Refresh, Delete Activity.
- A "Problem with your location data? [Report]" link under the elevation section — Strava's version reports to their servers, which doesn't apply here, but the underlying idea (flag a ride's GPS as suspect) doesn't need a server to be useful locally.

**Record/live-tracking screen, once it was shown**: full-screen map with a **3D toggle** and layers control, an explicit **activity-type switcher** (Walk/Run/Ride) sitting right next to Start, and "Add Route" alongside it (this app's existing Navigate-a-planned-route flow, already covered) — plus a "weekly Heatmap" banner that needs aggregated data across many users and doesn't translate to a private app.

### 2. Theme overhaul — whole app, not just ride detail

Move off the current nature-green light/dark theme toward a black-background theme with green reserved as a gradient/accent (the chart specifically was the given example — a green gradient fill rather than a flat line). Confirmed scope: **the whole app**. Touches both palettes in `src/theme/colors.ts` and needs a pass over every screen using those tokens.

### 3. Health app integration — Android Health Connect, not manual GPX merge

Confirmed direction: Health Connect (the OS-level fitness-data API other apps, including Samsung Health, can write into) rather than the manual GPX-export-and-merge approach in the item further below. **Not yet researched, real risk**: unconfirmed whether Samsung Health actually writes into Health Connect on this device/region, or keeps data in its own siloed store needing separate partner API access — needs a spike before scoping further. If it doesn't, the GPX-merge item becomes the fallback, not a duplicate effort. Two concrete stats are blocked on this specifically, since this app has no biometric input to produce either credibly on its own:
- **Calories** (screenshot 1) — or a much cruder MET-based estimate as a lesser fallback.
- **Heart Rate Zones** (second screenshot round) — a donut chart of time spent per zone. No fallback here; this one's fully blocked without either Health Connect or a paired HR sensor this app doesn't support today.

### 4. Advanced post-ride analytics (further out, after 1-3)

From Strava's *paygated* tier (useful as a feature reference, not this app's monetization model, since it has none) — bigger and more varied than first captured:
- **"Athlete Intelligence"**: an AI-generated natural-language summary of the activity ("pushed into the anaerobic zone for a significant portion..."). Needs either a local heuristic-based sentence generator or an actual LLM call — a real scoping question of its own if pursued.
- **Lap-by-lap breakdown**: auto-split pace per km/lap — computable post-hoc from stored points, same as the moving-time stats above.
- **3D "Flyover" replay**: an animated satellite flythrough following the route. Needs a 3D-capable map render — unconfirmed whether MapLibre supports this out of the box.
- **A consolidated "Results" section**, not just a Best Efforts card in isolation: counts across three categories (Best Efforts / Segments / Achievements) plus a per-ride list of exactly what that specific ride unlocked, each with a comparison line ("New 2nd best of all-time!", "New best of all-time!") and a "View All Results" expansion. Three different underlying concepts bundled into one UI:
  - **Best Efforts**: auto-detected PR segments for standard distances (best 10K *within* a longer ride), tracked **across ride history** — a cross-ride historical-comparison feature, structurally different from the single-ride analysis everything else on this list is.
  - **Segments**: Strava's community-authored leaderboards on specific named road/trail stretches — inherently social, needs other users' data to mean anything. **Doesn't translate directly to a single-user app.** Could be reimagined as a personal-only concept (your own history riding the same stretch repeatedly) if pursued at all, but that's a different, smaller feature wearing the same name, not a port.
  - **Achievements**: excluded from this pass entirely, deferred further than the rest of this list, per direct instruction.
- **Goals**: a weekly/target tracker ("Weekly Ride Goal — 1/4 rides") with a progress ring. Genuinely different in kind from everything else here — forward-looking target-setting, not analysis of a past ride. A real, separate feature if pursued.
- **Performance Predictions**: predicted 5K/10K race time extrapolated from recent training trends, shown with an improvement delta vs. a previous prediction.

**Confirmed not relevant, social/crowd-sourced by nature — excluded from this whole redesign, not just deferred:** group rides ("with 3 others" / "Manage Group"), kudos/comments, and the "weekly Heatmap" popular-routes overlay mentioned under the Record screen above. All three need other users' data to mean anything, and this stays a single-user app.

Raised 2026-08-21 with reference screenshots from Strava's activity view (two rounds — a walk's summary/chart, and a longer ride's map/menu/paygated-results view).

## Reassess Compare Routes — keep, simplify, or remove

Currently its own bottom tab (`CompareScreen.tsx`): a flat checkbox list of *every* saved ride/route with no origin filtering (recorded, imported, and planned all mixed together), plus a side-by-side stat table (distance/duration/avg+max speed/elevation gain+loss) once 2+ are selected. It's never come up in tester feedback so far, and it's one of only 4 bottom-tab slots — worth deciding whether it earns a standing tab, should fold into ride detail as a "compare with another ride" action instead, or gets cut entirely, given the lean-UI principle above.

## Personal profile / account page

Not designed at all yet — the app has no user model or login of any kind. Needs a scoping decision before any UI work starts: is this purely local-device profile info (name, preferred units, personal bests/goals?), or does it imply eventual multi-device sync/backend — which the app has deliberately avoided so far (local JSON files only, no server, see the earlier "do we need a database" discussion). The answer changes the shape of the feature a lot.

## Online and offline maps

Currently one live map source everywhere (OpenFreeMap's "liberty" vector style), plus a satellite raster layer (Esri World Imagery) as an alternate style in the route planner only. No offline capability exists — every map view needs a live connection. True offline maps (pre-downloading/caching tile regions, managing that storage, MapLibre's offline-region APIs) would be a substantial standalone feature, not a small addition.

## Merge full performance data from another app's GPX export

Originally scoped as heart-rate-only; broadened — if this gets built, target a **full performance breakdown**: heart rate, power/wattage, cadence, and pace, not heart rate alone. Combine this app's GPX export with a GPX file exported from Strava, Samsung Health, or similar, pulling in whatever performance data those apps record but this app has no sensor access to capture itself.

Explicitly scoped as **post-ride merge, not live device integration** — no live sensor pairing (heart rate monitor, power meter, cadence sensor) for now. The idea is: export a ride from here, export the same ride's activity from Samsung Health/Strava, and merge the two GPX files (matching points by timestamp) into one file carrying the GPS track plus whatever `<extensions>` data the other export includes.

**Open questions, not yet researched:**
- Whether Samsung Health's own GPX export actually includes these as standard `<gpxtpx:...>` extensions (the common convention Garmin/Strava use — covers heart rate, cadence, and sometimes power) or a different/proprietary format.
- Whether matching points between two independently-recorded tracks by timestamp is reliable enough (clock drift, differing sample rates) or needs nearest-point-in-time interpolation.
- Any free library that already does GPX merge/extension parsing, vs. hand-rolling it given `src/lib/gpx.ts` already has a working XML parser/serializer to extend.
- Whether pace is a derived stat (from GPS speed, already computable) rather than something that needs merging from an external source at all.

Raised by a tester (Chin) on 2026-08-19; deferred by Eddie in the same conversation ("no need to have live integration yet... the last one i haven't looked into it, not sure how well it can integrate or any free libraries"); scope broadened to full performance data 2026-08-21.
