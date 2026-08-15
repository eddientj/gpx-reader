const { withAndroidManifest } = require("expo/config-plugins");

// Declares MANAGE_EXTERNAL_STORAGE ("All files access"). Without it,
// MediaStore only shows a sandboxed app its own files plus Downloads — a
// document another app created elsewhere (e.g. a GPX file WhatsApp saved)
// is invisible to a MediaStore query no matter how it's written. The user
// grants this via a system Settings screen (GpxFilePickerModule's
// openAllFilesAccessSettings), not the normal in-app permission dialog.
//
// This is gated behind Play Store review for published apps, which doesn't
// apply here — this app is never distributed through the Play Store.

const PERMISSION_NAME = "android.permission.MANAGE_EXTERNAL_STORAGE";

module.exports = function withAllFilesAccess(config) {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults.manifest;
    manifest["uses-permission"] = manifest["uses-permission"] ?? [];

    const alreadyDeclared = manifest["uses-permission"].some(
      (entry) => entry.$["android:name"] === PERMISSION_NAME
    );
    if (!alreadyDeclared) {
      manifest["uses-permission"].push({
        $: { "android:name": PERMISSION_NAME },
      });
    }

    return config;
  });
};
