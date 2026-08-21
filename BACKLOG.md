# Backlog

Things we've decided to build eventually, but not now — kept separate from [BUILD_LOG.md](BUILD_LOG.md) (what's already done) so future work has somewhere to land instead of getting lost in a chat thread.

**Standing design principle:** keep the feature surface lean. Komoot is a genuinely good app, but the sheer number of functions and buttons makes it hard to navigate — every item below should be weighed against that cost, not just judged on whether it'd be useful in isolation.

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
