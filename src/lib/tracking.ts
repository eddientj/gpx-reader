import { File, Paths } from "expo-file-system";
import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import type { ActivityType, TrackPoint } from "./types";

const TASK_NAME = "gpx-reader-location-tracking";

// A recording in progress lives here, separate from the rides/ directory —
// it isn't a saved ride until the user stops and keeps it. Points are
// appended to this file as they arrive (not just held in memory) so an app
// kill mid-ride doesn't lose what's been recorded so far.
function recordingFile(): File {
  return new File(Paths.document, "recording.json");
}

export type RecordingState = {
  activityType: ActivityType;
  startedAt: string;
  points: TrackPoint[];
  paused: boolean;
  /** Total time already spent paused, in ms — subtracted from wall-clock
   * elapsed time so pausing actually stops the clock, not just new points. */
  pausedDurationMs: number;
  /** When the current pause began, so elapsed time can be frozen at that
   * instant instead of ticking while paused. Null while recording/resumed. */
  pausedAt: string | null;
};

/** Elapsed recording time in ms, accounting for time spent paused —
 * frozen at the moment of pausing rather than ticking while paused. */
export function elapsedMs(state: RecordingState): number {
  const started = new Date(state.startedAt).getTime();
  const reference = state.pausedAt ? new Date(state.pausedAt).getTime() : Date.now();
  return reference - started - state.pausedDurationMs;
}

function readRecording(): RecordingState | null {
  const file = recordingFile();
  if (!file.exists) return null;
  try {
    return JSON.parse(file.textSync());
  } catch {
    return null;
  }
}

function writeRecording(state: RecordingState): void {
  const file = recordingFile();
  if (!file.exists) file.create({ intermediates: true });
  file.write(JSON.stringify(state));
}

// Must be defined at module load, not inside a function — this is what
// Android relaunches (headless, if the app process was killed) to deliver
// queued location updates while a background recording is active.
TaskManager.defineTask<{ locations: Location.LocationObject[] }>(
  TASK_NAME,
  async ({ data, error }) => {
    if (error || !data) return;

    const state = readRecording();
    if (!state || state.paused) return;

    const newPoints: TrackPoint[] = data.locations.map((loc) => ({
      lat: loc.coords.latitude,
      lon: loc.coords.longitude,
      ele: loc.coords.altitude,
      time: new Date(loc.timestamp).toISOString(),
    }));

    writeRecording({ ...state, points: [...state.points, ...newPoints] });
  }
);

/** Returns whether a recording is currently in progress (started but not
 * yet stopped/discarded) — used on app launch to offer resuming/discarding
 * one left over from a killed app. */
export function getActiveRecording(): RecordingState | null {
  return readRecording();
}

/**
 * Requests foreground location first, then background — Android generally
 * can't grant "Allow all the time" in the same dialog as the initial
 * foreground prompt, so these are always two separate steps.
 */
export async function requestLocationPermissions(): Promise<{
  foregroundGranted: boolean;
  backgroundGranted: boolean;
}> {
  const foreground = await Location.requestForegroundPermissionsAsync();
  if (foreground.status !== "granted") {
    return { foregroundGranted: false, backgroundGranted: false };
  }
  const background = await Location.requestBackgroundPermissionsAsync();
  return {
    foregroundGranted: true,
    backgroundGranted: background.status === "granted",
  };
}

export async function startRecording(activityType: ActivityType): Promise<void> {
  writeRecording({
    activityType,
    startedAt: new Date().toISOString(),
    points: [],
    paused: false,
    pausedDurationMs: 0,
    pausedAt: null,
  });

  await Location.startLocationUpdatesAsync(TASK_NAME, {
    accuracy: Location.Accuracy.BestForNavigation,
    timeInterval: 3000,
    distanceInterval: 5,
    pausesUpdatesAutomatically: false,
    foregroundService: {
      notificationTitle: "Recording your ride",
      notificationBody: "gpx-reader is tracking your route in the background.",
    },
  });
}

export function pauseRecording(): void {
  const state = readRecording();
  if (!state || state.paused) return;
  writeRecording({ ...state, paused: true, pausedAt: new Date().toISOString() });
}

export function resumeRecording(): void {
  const state = readRecording();
  if (!state || !state.paused || !state.pausedAt) return;
  const pausedForMs = Date.now() - new Date(state.pausedAt).getTime();
  writeRecording({
    ...state,
    paused: false,
    pausedAt: null,
    pausedDurationMs: state.pausedDurationMs + pausedForMs,
  });
}

async function stopLocationUpdatesIfRunning(): Promise<void> {
  if (await TaskManager.isTaskRegisteredAsync(TASK_NAME)) {
    await Location.stopLocationUpdatesAsync(TASK_NAME);
  }
}

/** Stops the background task and returns the recorded points/activity type
 * for the caller to save as a ride — the in-progress file is cleared either
 * way, so a caller that doesn't want to keep it should use
 * `discardRecording` instead of just ignoring this return value. */
export async function stopRecording(): Promise<RecordingState | null> {
  const state = readRecording();
  await stopLocationUpdatesIfRunning();
  const file = recordingFile();
  if (file.exists) file.delete();
  return state;
}

export async function discardRecording(): Promise<void> {
  await stopLocationUpdatesIfRunning();
  const file = recordingFile();
  if (file.exists) file.delete();
}
