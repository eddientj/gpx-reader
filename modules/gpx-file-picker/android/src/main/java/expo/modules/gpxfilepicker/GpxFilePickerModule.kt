package expo.modules.gpxfilepicker

import android.app.Activity
import android.content.Intent
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.toCodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

private const val REQUEST_CODE = 4271

// Android has no registered MIME type for .gpx, so most content providers
// label the file as application/octet-stream. Requesting that as the
// primary type (rather than */*) is what keeps the system chooser to
// file-provider apps and skips straight to a "Select GPX file" style
// picker, matching how apps like Samsung Health present their own import.
private const val PRIMARY_MIME_TYPE = "application/octet-stream"
private val ACCEPTED_MIME_TYPES = arrayOf(
  "application/octet-stream",
  "application/gpx+xml",
  "application/xml",
  "text/xml"
)

class GpxFilePickerModule : Module() {
  private var pendingPromise: Promise? = null

  override fun definition() = ModuleDefinition {
    Name("GpxFilePicker")

    // Unlike ACTION_GET_CONTENT (which can resolve to any app that claims to
    // handle "give me content" — photo pickers, cloud apps, etc.),
    // OPEN_DOCUMENT is specifically the "browse documents via SAF" action,
    // which the system's document picker (and most OEM equivalents) opens
    // straight to a "Recent" view rather than a folder root — this is the
    // only way this app finds a GPX file outside its own storage/Downloads,
    // and needs no storage permission at all.
    AsyncFunction("pickGpxFileAsync") { promise: Promise ->
      if (pendingPromise != null) {
        promise.reject("ERR_GPX_PICKER_BUSY", "A file picker is already open", null)
        return@AsyncFunction
      }

      val intent = Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
        addCategory(Intent.CATEGORY_OPENABLE)
        type = PRIMARY_MIME_TYPE
        putExtra(Intent.EXTRA_MIME_TYPES, ACCEPTED_MIME_TYPES)
      }

      try {
        pendingPromise = promise
        appContext.throwingActivity.startActivityForResult(intent, REQUEST_CODE)
      } catch (e: Throwable) {
        pendingPromise = null
        promise.reject(e.toCodedException())
      }
    }

    OnActivityResult { _, payload ->
      if (payload.requestCode != REQUEST_CODE) return@OnActivityResult

      val promise = pendingPromise ?: return@OnActivityResult
      pendingPromise = null

      if (payload.resultCode != Activity.RESULT_OK) {
        promise.resolve(null)
        return@OnActivityResult
      }

      // payload.data is the result Intent, not a Uri — its own .data field
      // holds the picked file's content:// Uri.
      promise.resolve(payload.data?.data?.toString())
    }
  }
}
