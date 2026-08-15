const { withAndroidManifest } = require("expo/config-plugins");

// Declares the app as a handler for GPX files, so it appears in Android's
// "Open with" / share sheet when a .gpx file is tapped in WhatsApp, My Files,
// an email attachment, etc.
//
// This lives in a config plugin rather than app.json's `android.intentFilters`
// because Expo merges those into the same generated <intent-filter> as the
// app's own URL scheme. Android applies a filter's pathPattern list to every
// URI the filter matches, so a merged filter makes the dev-client deep link
// (exp+gpx-reader://…, no .gpx path) stop resolving. Separate filters avoid it.

const GPX_PATH_PATTERN = ".*\\\\.gpx";

// GPX has no registered MIME type, so files arrive labelled inconsistently
// depending on the sending app. Matching these without a path pattern is what
// makes the app show up for a GPX shared through WhatsApp, whose content://
// URIs are opaque and carry no filename in the path.
const GPX_MIME_TYPES = [
  "application/gpx+xml",
  "application/xml",
  "text/xml",
  "application/octet-stream",
];

const VIEW_ACTION = [{ $: { "android:name": "android.intent.action.VIEW" } }];
const DEFAULT_CATEGORY = [
  { $: { "android:name": "android.intent.category.DEFAULT" } },
];

function mimeTypeFilter() {
  return {
    action: VIEW_ACTION,
    category: DEFAULT_CATEGORY,
    data: GPX_MIME_TYPES.map((mimeType) => ({
      $: { "android:mimeType": mimeType },
    })),
  };
}

function filePathFilter() {
  return {
    action: VIEW_ACTION,
    category: DEFAULT_CATEGORY,
    data: ["file", "content"].map((scheme) => ({
      $: {
        "android:scheme": scheme,
        "android:pathPattern": GPX_PATH_PATTERN,
      },
    })),
  };
}

function declaresGpxMimeType(intentFilter) {
  return (intentFilter.data ?? []).some(
    (data) => data.$?.["android:mimeType"] === "application/gpx+xml"
  );
}

module.exports = function withGpxOpenWith(config) {
  return withAndroidManifest(config, (config) => {
    const application = config.modResults.manifest.application?.[0];
    const activity = application?.activity?.find(
      (candidate) => candidate.$["android:name"] === ".MainActivity"
    );
    if (!activity) {
      throw new Error("withGpxOpenWith: .MainActivity not found in manifest");
    }

    const filters = activity["intent-filter"] ?? [];
    if (filters.some(declaresGpxMimeType)) {
      return config;
    }

    activity["intent-filter"] = [
      ...filters,
      mimeTypeFilter(),
      filePathFilter(),
    ];
    return config;
  });
};
