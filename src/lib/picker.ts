import GpxFilePicker from "../../modules/gpx-file-picker/src/GpxFilePickerModule";
import type { GpxFileEntry } from "../../modules/gpx-file-picker/src/GpxFilePickerModule";

export type { GpxFileEntry };

/**
 * Opens the system "Select GPX file" chooser.
 *
 * Returns the picked file's URI, or null if the user backed out.
 */
export async function pickGpxFile(): Promise<string | null> {
  return GpxFilePicker.pickGpxFileAsync();
}

/**
 * Looks up every .gpx file the device's MediaStore index knows about.
 * Instant, most recently modified first. Without the all-files-access grant
 * (see hasAllFilesAccess), this only sees files the app created itself plus
 * anything in the public Downloads folder — a document another app saved
 * elsewhere (e.g. WhatsApp's own folder) won't show up until it's granted.
 */
export async function searchGpxFiles(): Promise<GpxFileEntry[]> {
  return GpxFilePicker.searchGpxFilesAsync();
}

/** Whether the search above can see every app's files, not just ours. */
export function hasAllFilesAccess(): boolean {
  return GpxFilePicker.hasAllFilesAccess();
}

/** Sends the user to the system Settings screen to grant that access. */
export function openAllFilesAccessSettings(): void {
  GpxFilePicker.openAllFilesAccessSettings();
}
