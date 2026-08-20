import GpxFilePicker from "../../modules/gpx-file-picker/src/GpxFilePickerModule";

/**
 * Opens the system "Select GPX file" chooser.
 *
 * Returns the picked file's URI, or null if the user backed out.
 */
export async function pickGpxFile(): Promise<string | null> {
  return GpxFilePicker.pickGpxFileAsync();
}
