import { Directory, File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { serializeGpx } from "./gpx";
import type { RideDetail } from "./types";

const exportDir = new Directory(Paths.cache, "gpx-export");

function sanitizeFileName(name: string): string {
  // A ride's name can contain anything (it's free text, or a formatted
  // date string with slashes/colons) — none of which are safe as a literal
  // filename across Android's various share targets.
  const safe = name.replace(/[^a-zA-Z0-9-_ ]/g, "").trim();
  return (safe.length > 0 ? safe : "route") + ".gpx";
}

/**
 * Writes a ride's GPX back out to a temp file and opens the system share
 * sheet — works for any ride regardless of how it came to exist (imported,
 * recorded, or planned), so it can be sent to Strava, Komoot, saved to
 * Drive, etc. The exported file only needs to survive long enough for the
 * receiving app to read it, so it lives in the cache directory rather than
 * alongside the app's own persisted ride data.
 */
export async function exportRideGpx(ride: RideDetail): Promise<void> {
  const available = await Sharing.isAvailableAsync();
  if (!available) {
    throw new Error("Sharing isn't available on this device");
  }

  if (!exportDir.exists) {
    exportDir.create({ intermediates: true });
  }

  const xml = serializeGpx(ride.name, ride.points, ride.waypoints);
  const file = new File(exportDir, sanitizeFileName(ride.name));
  if (file.exists) {
    file.delete();
  }
  file.create();
  file.write(xml);

  await Sharing.shareAsync(file.uri, {
    mimeType: "application/gpx+xml",
    dialogTitle: `Export ${ride.name}`,
  });
}
