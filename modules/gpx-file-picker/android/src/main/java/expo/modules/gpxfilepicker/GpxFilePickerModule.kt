package expo.modules.gpxfilepicker

import android.app.Activity
import android.content.ContentUris
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.Settings
import android.provider.MediaStore
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.Exceptions
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

    AsyncFunction("pickGpxFileAsync") { promise: Promise ->
      if (pendingPromise != null) {
        promise.reject("ERR_GPX_PICKER_BUSY", "A file picker is already open", null)
        return@AsyncFunction
      }

      val intent = Intent(Intent.ACTION_GET_CONTENT).apply {
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

    // Browsing the system file picker one folder at a time only finds a GPX
    // file if you already know which app or folder it landed in. MediaStore
    // is Android's own device-wide file index — the same index that makes a
    // gallery app's search instant. Two collections are queried because
    // scoped storage restricts a sandboxed app's visibility differently per
    // collection: Files (content://media/external/file) is the broad index
    // but a regular app may only see its own entries there, while Downloads
    // is specifically carved out as visible to any app regardless of which
    // app created the file.
    AsyncFunction("searchGpxFilesAsync") { promise: Promise ->
      try {
        val resolver = appContext.reactContext?.contentResolver
          ?: throw Exceptions.ReactContextLost()

        val seenUris = mutableSetOf<String>()
        val results = mutableListOf<Map<String, Any?>>()
        for (collection in listOf(
          MediaStore.Files.getContentUri("external"),
          MediaStore.Downloads.EXTERNAL_CONTENT_URI
        )) {
          queryGpxFiles(resolver, collection).forEach { entry ->
            val uri = entry["uri"] as String
            if (seenUris.add(uri)) results.add(entry)
          }
        }
        results.sortByDescending { it["modifiedAt"] as Long }
        promise.resolve(results)
      } catch (e: Throwable) {
        promise.reject(e.toCodedException())
      }
    }

    // Without this, MediaStore's Files collection only shows entries the app
    // created itself (plus Downloads) — another app's document, like one
    // WhatsApp saved, is invisible to the same query above no matter how
    // it's written. Granting this permission is what makes MediaStore start
    // returning everything; it requires a trip to a system Settings screen
    // rather than the normal in-app permission dialog.
    Function("hasAllFilesAccess") {
      Build.VERSION.SDK_INT < Build.VERSION_CODES.R || Environment.isExternalStorageManager()
    }

    Function("openAllFilesAccessSettings") {
      val context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
      val perAppIntent = Intent(
        Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION,
        Uri.fromParts("package", context.packageName, null)
      ).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)

      try {
        context.startActivity(perAppIntent)
      } catch (e: Throwable) {
        // Some OEM builds lack the per-app variant; fall back to the general list.
        val generalIntent = Intent(Settings.ACTION_MANAGE_ALL_FILES_ACCESS_PERMISSION)
          .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        context.startActivity(generalIntent)
      }
    }
  }
}

private fun queryGpxFiles(
  resolver: android.content.ContentResolver,
  collection: android.net.Uri
): List<Map<String, Any?>> {
  val projection = arrayOf(
    MediaStore.MediaColumns._ID,
    MediaStore.MediaColumns.DISPLAY_NAME,
    MediaStore.MediaColumns.DATE_MODIFIED
  )
  val selection = "${MediaStore.MediaColumns.DISPLAY_NAME} LIKE ?"
  val selectionArgs = arrayOf("%.gpx")

  val results = mutableListOf<Map<String, Any?>>()
  // A collection this app has no visibility into (scoped storage) throws
  // rather than returning empty — treat that the same as "found nothing here".
  try {
    resolver.query(collection, projection, selection, selectionArgs, null)?.use { cursor ->
      val idCol = cursor.getColumnIndexOrThrow(MediaStore.MediaColumns._ID)
      val nameCol = cursor.getColumnIndexOrThrow(MediaStore.MediaColumns.DISPLAY_NAME)
      val dateCol = cursor.getColumnIndexOrThrow(MediaStore.MediaColumns.DATE_MODIFIED)

      while (cursor.moveToNext()) {
        val uri = ContentUris.withAppendedId(collection, cursor.getLong(idCol))
        results.add(
          mapOf(
            "uri" to uri.toString(),
            "name" to cursor.getString(nameCol),
            "modifiedAt" to cursor.getLong(dateCol) * 1000L
          )
        )
      }
    }
  } catch (_: Throwable) {
    // fall through to whatever the other collection found
  }
  return results
}
