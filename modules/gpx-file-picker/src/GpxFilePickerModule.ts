import { NativeModule, requireNativeModule } from "expo";

export type GpxFileEntry = {
  uri: string;
  name: string;
  modifiedAt: number;
};

declare class GpxFilePickerModule extends NativeModule<{}> {
  /**
   * Opens the system "Select GPX file" chooser (ACTION_GET_CONTENT).
   * Resolves to the picked file's content:// URI, or null if the user
   * backed out without picking anything.
   */
  pickGpxFileAsync(): Promise<string | null>;

  /**
   * Looks up every .gpx file MediaStore has indexed on the device, regardless
   * of which app put it there. Instant — an indexed query, not a folder walk.
   */
  searchGpxFilesAsync(): Promise<GpxFileEntry[]>;

  /**
   * Whether the app can see every app's files via MediaStore, not just its
   * own plus Downloads. Always true below Android 11, where this permission
   * doesn't exist.
   */
  hasAllFilesAccess(): boolean;

  /** Opens the system Settings screen where the user grants that access. */
  openAllFilesAccessSettings(): void;
}

export default requireNativeModule<GpxFilePickerModule>("GpxFilePicker");
