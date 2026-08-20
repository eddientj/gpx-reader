import { NativeModule, requireNativeModule } from "expo";

declare class GpxFilePickerModule extends NativeModule<{}> {
  /**
   * Opens the system "Select GPX file" chooser (ACTION_OPEN_DOCUMENT, which
   * opens to a "Recent" documents view on most pickers). Resolves to the
   * picked file's content:// URI, or null if the user backed out.
   */
  pickGpxFileAsync(): Promise<string | null>;
}

export default requireNativeModule<GpxFilePickerModule>("GpxFilePicker");
