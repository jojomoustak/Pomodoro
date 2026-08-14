export const FEATURES_STORAGE_KEY = "pomodoro-features-v1";
// Roughly five years at three completed sessions per day, while remaining
// small enough for reliable offline storage and backup on mobile devices.
export const MAX_HISTORY_ENTRIES = 5000;

export type FocusSession = {
  id: string;
  task: string;
  completedAt: number;
  durationSeconds: number;
};

export type TimerPreset = {
  id: string;
  name: string;
  workMinutes: number;
  shortBreakMinutes: number;
  builtIn: boolean;
};

export type PomodoroTheme = "light" | "dark" | "amoled";

export type FeatureSettings = {
  autoStartBreaks: boolean;
  autoStartWork: boolean;
  soundEnabled: boolean;
  hapticsEnabled: boolean;
  webVolume: number;
  theme: PomodoroTheme;
};

export type PomodoroFeaturesState = {
  schemaVersion: 1;
  currentTask: string;
  selectedPresetId: string;
  history: FocusSession[];
  presets: TimerPreset[];
  settings: FeatureSettings;
};

export const BUILT_IN_PRESETS: TimerPreset[] = [
  {
    id: "classic",
    name: "Classic",
    workMinutes: 25,
    shortBreakMinutes: 5,
    builtIn: true,
  },
  {
    id: "deep-work",
    name: "Deep Work",
    workMinutes: 50,
    shortBreakMinutes: 10,
    builtIn: true,
  },
  {
    id: "study",
    name: "Study",
    workMinutes: 45,
    shortBreakMinutes: 10,
    builtIn: true,
  },
];

export const createDefaultFeaturesState = (): PomodoroFeaturesState => ({
  schemaVersion: 1,
  currentTask: "",
  selectedPresetId: "classic",
  history: [],
  presets: BUILT_IN_PRESETS.map((preset) => ({ ...preset })),
  settings: {
    autoStartBreaks: false,
    autoStartWork: false,
    soundEnabled: true,
    hapticsEnabled: true,
    webVolume: 0.85,
    theme: "light",
  },
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const clampInteger = (
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number
) => {
  const numericValue = typeof value === "number" ? value : Number.NaN;
  if (!Number.isFinite(numericValue)) return fallback;
  return Math.min(maximum, Math.max(minimum, Math.round(numericValue)));
};

const sanitizePreset = (value: unknown): TimerPreset | null => {
  if (!isRecord(value)) return null;

  const id = typeof value.id === "string" ? value.id.trim().slice(0, 80) : "";
  const name =
    typeof value.name === "string" ? value.name.trim().slice(0, 30) : "";

  if (!id || !name) return null;

  return {
    id,
    name,
    workMinutes: clampInteger(value.workMinutes, 25, 1, 720),
    shortBreakMinutes: clampInteger(value.shortBreakMinutes, 5, 1, 720),
    builtIn: false,
  };
};

const sanitizeSession = (value: unknown): FocusSession | null => {
  if (!isRecord(value)) return null;

  const completedAt = clampInteger(value.completedAt, 0, 1, Number.MAX_SAFE_INTEGER);
  const durationSeconds = clampInteger(value.durationSeconds, 0, 1, 720 * 60);

  if (!completedAt || !durationSeconds) return null;

  return {
    id:
      typeof value.id === "string" && value.id.trim()
        ? value.id.trim().slice(0, 100)
        : `session-${completedAt}`,
    task:
      typeof value.task === "string" ? value.task.trim().slice(0, 80) : "",
    completedAt,
    durationSeconds,
  };
};

export const sanitizeFeaturesState = (
  value: unknown
): PomodoroFeaturesState => {
  const defaults = createDefaultFeaturesState();
  if (!isRecord(value)) return defaults;

  const rawPresets = Array.isArray(value.presets) ? value.presets : [];
  const customPresets = rawPresets
    .map(sanitizePreset)
    .filter((preset): preset is TimerPreset => Boolean(preset))
    .filter(
      (preset, index, presets) =>
        !BUILT_IN_PRESETS.some((builtIn) => builtIn.id === preset.id) &&
        presets.findIndex((candidate) => candidate.id === preset.id) === index
    )
    .slice(0, 17);

  const rawHistory = Array.isArray(value.history) ? value.history : [];
  const history = rawHistory
    .map(sanitizeSession)
    .filter((session): session is FocusSession => Boolean(session))
    .sort((left, right) => right.completedAt - left.completedAt)
    .filter(
      (session, index, sessions) =>
        sessions.findIndex((candidate) => candidate.id === session.id) === index
    )
    .slice(0, MAX_HISTORY_ENTRIES);

  const rawSettings = isRecord(value.settings) ? value.settings : {};
  const theme: PomodoroTheme =
    rawSettings.theme === "dark" || rawSettings.theme === "amoled"
      ? rawSettings.theme
      : "light";

  const presets = [
    ...BUILT_IN_PRESETS.map((preset) => ({ ...preset })),
    ...customPresets,
  ];
  const selectedPresetId =
    typeof value.selectedPresetId === "string" &&
    presets.some((preset) => preset.id === value.selectedPresetId)
      ? value.selectedPresetId
      : defaults.selectedPresetId;

  return {
    schemaVersion: 1,
    currentTask:
      typeof value.currentTask === "string"
        ? value.currentTask.slice(0, 80)
        : defaults.currentTask,
    selectedPresetId,
    history,
    presets,
    settings: {
      autoStartBreaks:
        typeof rawSettings.autoStartBreaks === "boolean"
          ? rawSettings.autoStartBreaks
          : defaults.settings.autoStartBreaks,
      autoStartWork:
        typeof rawSettings.autoStartWork === "boolean"
          ? rawSettings.autoStartWork
          : defaults.settings.autoStartWork,
      soundEnabled:
        typeof rawSettings.soundEnabled === "boolean"
          ? rawSettings.soundEnabled
          : defaults.settings.soundEnabled,
      hapticsEnabled:
        typeof rawSettings.hapticsEnabled === "boolean"
          ? rawSettings.hapticsEnabled
          : defaults.settings.hapticsEnabled,
      webVolume:
        typeof rawSettings.webVolume === "number" &&
        Number.isFinite(rawSettings.webVolume)
          ? Math.min(1, Math.max(0, rawSettings.webVolume))
          : defaults.settings.webVolume,
      theme,
    },
  };
};

export const localDayKey = (timestamp: number) => {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};
