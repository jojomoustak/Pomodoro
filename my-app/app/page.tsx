'use client'

import React, { useEffect, useMemo, useRef, useState } from "react";
import { FaInstagram, FaGithub } from "react-icons/fa";
import Median from "median-js-bridge";
import {
  FEATURES_STORAGE_KEY,
  MAX_HISTORY_ENTRIES,
  createDefaultFeaturesState,
  localDayKey,
  sanitizeFeaturesState,
  type FeatureSettings,
  type PomodoroFeaturesState,
  type PomodoroTheme,
} from "./lib/pomodoro-features";

const IS_ANDROID_OFFLINE_BUILD =
  process.env.NEXT_PUBLIC_ANDROID_OFFLINE_BUILD === "true";

const TOOLS_CLOSE_ANIMATION_MS = 360;
const CALENDAR_WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"] as const;

const getPublicAssetUrl = (fileName: string) => {
  return IS_ANDROID_OFFLINE_BUILD
    ? `/assets/web/${fileName}`
    : `/${fileName}`;
};

const parseNativeJson = <T,>(value: string | undefined): T | null => {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
};

type MedianPlatform = "web" | "android" | "ios";
type AdvancedPanel = "history" | "settings";
type HapticStyle =
  | "impactLight"
  | "impactMedium"
  | "impactHeavy"
  | "notificationSuccess"
  | "notificationWarning"
  | "notificationError"
  | "tick"
  | "click"
  | "double_click";

type PersistedPomodoroState = {
  isWorkMode: boolean;
  workMinutes: number;
  shortBreakMinutes: number;
  currentBreakMinutes: number;
  secondsLeft: number;
  isActive: boolean;
  round: number;
  completedWorkSessions: number;
  breakSessionNumber: number;
  isLongBreak: boolean;
  endTime: number | null;
};

type PomodoroNativeBridge = {
  startTimer: (
    endTimeMs: number,
    sessionType: "work" | "break" | "long-break"
  ) => boolean;
  cancelTimer: () => boolean;
  isNotificationPermissionGranted: () => boolean;
  openCompletionSoundSettings?: () => boolean;
  getActiveTimerState?: () => string;
  getPendingCompletionState?: () => string;
  acknowledgePendingCompletion?: () => boolean;
};

type NativeTimerState = {
  active: boolean;
  endTimeMs: number;
  startedAtMs: number;
  durationSeconds: number;
  sessionType: "work" | "break" | "long-break";
};

type NativePendingCompletion = Omit<NativeTimerState, "active">;

declare global {
  interface Window {
    pomodoroNative?: PomodoroNativeBridge;
  }
}
const THEME_OPTIONS: Array<{
  value: PomodoroTheme;
  label: string;
  description: string;
  color: string;
}> = [
  {
    value: "light",
    label: "Original light",
    description: "Warm and cheerful",
    color: "bg-[#ffaaa3]",
  },
  {
    value: "dark",
    label: "Dark",
    description: "Soft on the eyes",
    color: "bg-[#284b3f]",
  },
  {
    value: "amoled",
    label: "AMOLED",
    description: "True black",
    color: "bg-black border border-white/30",
  },
];

type ThemeSelectorProps = {
  value: PomodoroTheme;
  onChange: (theme: PomodoroTheme) => void;
};

type PrivacyTomatoMarkProps = {
  className?: string;
};

function PrivacyTomatoMark({
  className = "",
}: PrivacyTomatoMarkProps) {
  return (
    <span
      aria-hidden="true"
      className={`
        relative inline-grid h-[34px] w-[38px] shrink-0 place-items-center
        rounded-[48%_48%_45%_45%] bg-[#f86557]
        shadow-[inset_0_-4px_0_rgba(130,48,41,0.11)]
        ${className}
      `}
    >
      <svg
        viewBox="0 0 18 11"
        className="absolute -top-[7px] left-[10px] h-[11px] w-[18px] overflow-visible"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M9 4.73 18 0l-4.32 6.82L18 11 9.54 8.58 2.52 11 4.86 6.6 0 1.98Z"
          fill="#4a8b6d"
        />
      </svg>

      <span className="absolute left-[11px] top-[14px] h-[3px] w-[2px] rounded-full bg-[#52352f]/60" />
      <span className="absolute right-[11px] top-[14px] h-[3px] w-[2px] rounded-full bg-[#52352f]/60" />
      <span className="absolute left-1/2 top-[14px] h-2 w-[19px] -translate-x-1/2 rounded-b-[50%] border-b-2 border-[#52352f]/55" />
    </span>
  );
}

function ThemeSelector({
  value,
  onChange,
}: ThemeSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const menuId = React.useId();

  const selectedTheme =
    THEME_OPTIONS.find((theme) => theme.value === value) ??
    THEME_OPTIONS[0];

  const availableThemes = THEME_OPTIONS.filter(
    (theme) => theme.value !== selectedTheme.value
  );

  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;

      setIsOpen(false);
      triggerRef.current?.focus();
    };

    document.addEventListener("pointerdown", handlePointerDown, true);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener(
        "pointerdown",
        handlePointerDown,
        true
      );

      document.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen]);

  const focusOption = (index: number) => {
    const totalOptions = availableThemes.length;
    const nextIndex = (index + totalOptions) % totalOptions;

    optionRefs.current[nextIndex]?.focus();
  };

  const openAndFocusThemeMenu = () => {
    setIsOpen(true);

    window.requestAnimationFrame(() => {
      focusOption(0);
    });
  };

  return (
    <div ref={containerRef} className="relative min-w-[180px]">
      {/* Trigger */}
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-controls={menuId}
        onClick={() => setIsOpen((current) => !current)}
        onKeyDown={(event) => {
          if (
            event.key === "ArrowDown" ||
            event.key === "ArrowUp"
          ) {
            event.preventDefault();
            openAndFocusThemeMenu();
          }
        }}
        className="
          flex min-h-12 w-full
          items-center gap-3
          rounded-full
          border border-[var(--tools-control-border)]
          bg-[var(--tools-surface)]
          py-2 pl-4 pr-3
          text-left
          shadow-sm
          transition-all duration-200

          hover:border-[var(--tools-coral)]
          hover:bg-[var(--tools-accent-soft)]

          active:translate-y-0
          active:scale-[0.98]

          focus-visible:outline-none
          focus-visible:ring-4
          focus-visible:ring-[#ff6b5e]/20
        "
      >
        <span
          aria-hidden="true"
          className={`
            h-3.5 w-3.5 shrink-0 rounded-full
            shadow-[0_0_0_4px_rgba(255,101,85,0.12)]
            ${selectedTheme.color}
          `}
        />

        <span className="min-w-0 flex-1">
          <strong
            className="
              block truncate text-sm
              text-[var(--tools-text)]
            "
          >
            {selectedTheme.label}
          </strong>
        </span>

        <svg
          aria-hidden="true"
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`
            h-4 w-4 shrink-0
            text-[var(--tools-coral)]
            transition-transform duration-300
            ${isOpen ? "rotate-180" : "rotate-0"}
          `}
        >
          <path d="m5 7.5 5 5 5-5" />
        </svg>
      </button>

      {/* Dropdown */}
      <div
        id={menuId}
        role="menu"
        aria-hidden={!isOpen}
        className={`
          absolute bottom-[calc(100%+8px)]
          right-0 z-50 w-full min-w-[220px]
          origin-bottom overflow-hidden
          rounded-[22px]

          border border-[var(--tools-control-border)]
          bg-[var(--tools-page)] p-2
          shadow-[0_18px_42px_rgba(23,60,50,0.18)]
          backdrop-blur-xl

          transition-all duration-300 ease-out

          ${
            isOpen
              ? "pointer-events-auto translate-y-0 scale-100 opacity-100"
              : "pointer-events-none translate-y-2 scale-95 opacity-0"
          }
        `}
      >
        <p
          className="
            px-3 pb-2 pt-1
            text-[0.62rem] font-extrabold
            uppercase tracking-[0.12em]
            text-[var(--tools-muted)]
          "
        >
          Choose theme
        </p>

        <div className="grid gap-1">
          {availableThemes.map((theme, index) => {
            return (
              <button
                key={theme.value}
                ref={(element) => {
                  optionRefs.current[index] = element;
                }}
                type="button"
                role="menuitem"
                tabIndex={isOpen ? 0 : -1}
                onClick={() => {
                  onChange(theme.value);
                  setIsOpen(false);
                  triggerRef.current?.focus();
                }}
                onKeyDown={(event) => {
                  if (event.key === "ArrowDown") {
                    event.preventDefault();
                    focusOption(index + 1);
                  }

                  if (event.key === "ArrowUp") {
                    event.preventDefault();
                    focusOption(index - 1);
                  }

                  if (event.key === "Home") {
                    event.preventDefault();
                    focusOption(0);
                  }

                  if (event.key === "End") {
                    event.preventDefault();
                    focusOption(availableThemes.length - 1);
                  }
                }}
                className={`
                  flex min-h-[54px] w-full
                  items-center gap-3 rounded-2xl
                  border px-3 text-left

                  transition-all duration-200
                  active:scale-[0.97]

                  focus-visible:outline-none
                  focus-visible:ring-4
                  focus-visible:ring-[#ff6b5e]/20

                  border-transparent bg-transparent
                  hover:border-[var(--tools-control-border)]
                  hover:bg-[var(--tools-surface)]
                `}
              >
                <span
                  aria-hidden="true"
                  className={`
                    h-4 w-4 shrink-0 rounded-full
                    ${theme.color}
                  `}
                />

                <span className="min-w-0 flex-1">
                  <strong
                    className="
                      block text-sm
                      text-[var(--tools-text)]
                    "
                  >
                    {theme.label}
                  </strong>

                  <small
                    className="
                      mt-0.5 block text-[0.67rem]
                      text-[var(--tools-muted)]
                    "
                  >
                    {theme.description}
                  </small>
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}


export default function Home() {

  // =========================
  // CONSTANTS
  // =========================

  const TEST_MODE = false;

  const TEST_WORK_SECONDS = 5;
  const TEST_BREAK_SECONDS = 3;
  const TEST_LONG_BREAK_SECONDS = 10;

  const MAX_MINUTES = 12 * 60;
  const SESSIONS_BEFORE_LONG_BREAK = 4;
  const COMPLETION_FEEDBACK_GRACE_MS = 30 * 1000;

  const STORAGE_KEY = "pomodoro-state-v2";


  // =========================
  // STATE
  // =========================

  const [isWorkMode, setIsWorkMode] = useState(true);
  const [workMinutes, setWorkMinutes] = useState(25);
  const [shortBreakMinutes, setShortBreakMinutes] = useState(5);
  const [currentBreakMinutes, setCurrentBreakMinutes] = useState(5);
  const [secondsLeft, setSecondsLeft] = useState(25 * 60);
  const [isActive, setIsActive] = useState(false);
  const [round, setRound] = useState(1);
  const [completedWorkSessions, setCompletedWorkSessions] = useState(0);
  const [breakSessionNumber, setBreakSessionNumber] = useState(1);
  const [isLongBreak, setIsLongBreak] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [inputMinutes, setInputMinutes] = useState("25");
  const [features, setFeatures] = useState<PomodoroFeaturesState>(() =>
    createDefaultFeaturesState()
  );
  const [isFeaturesHydrated, setIsFeaturesHydrated] = useState(false);
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);
  const [isAdvancedVisible, setIsAdvancedVisible] = useState(false);
  const [advancedPanel, setAdvancedPanel] =
    useState<AdvancedPanel>("history");
  const [toast, setToast] = useState<string | null>(null);
  const [todayKey, setTodayKey] = useState(() => localDayKey(Date.now()));

  // Exact timestamp used instead of trusting a background setInterval.
  const [endTime, setEndTime] = useState<number | null>(null);

  // Median environment state.
  const [isMedianApp, setIsMedianApp] = useState(false);
  const [medianReady, setMedianReady] = useState(false);
  const [medianPlatform, setMedianPlatform] =
    useState<MedianPlatform>("web");

  // True only when Median.onReady has actually fired. Native features use this.
  const [medianBridgeReady, setMedianBridgeReady] = useState(false);

  // Prevent persistence from overwriting data before restoration finishes.
  const [isHydrated, setIsHydrated] = useState(false);


  const ringtoneRef = useRef<HTMLAudioElement | null>(null);
  const buttonSoundRef = useRef<HTMLAudioElement | null>(null);
  const completionLockRef = useRef(false);
  const featuresRef = useRef(features);
  const advancedOpenFrameRef = useRef<number | null>(null);
  const advancedCloseTimerRef = useRef<number | null>(null);
  const inputMinutesRef = useRef(inputMinutes);
  const minuteHoldTimerRef = useRef<number | null>(null);
  const minuteHoldStartedAtRef = useRef(0);
  const lastMinuteHapticAtRef = useRef(Number.NEGATIVE_INFINITY);
  const suppressMinuteClickUntilRef = useRef(0);
  const nativeStateReconciledRef = useRef(false);

  useEffect(() => {
    featuresRef.current = features;
  }, [features]);

  useEffect(() => {
    inputMinutesRef.current = inputMinutes;
  }, [inputMinutes]);

  const showToast = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(null), 2600);
  };


// =========================
// OFFLINE SERVICE WORKER
// =========================

useEffect(() => {
  if (IS_ANDROID_OFFLINE_BUILD) {
    return;
  }

  if (!("serviceWorker" in navigator)) {
    return;
  }

  // Do not use the offline Service Worker during local development.
  // Otherwise old Next.js JavaScript bundles can remain cached.
  if (process.env.NODE_ENV !== "production") {
    navigator.serviceWorker
      .getRegistrations()
      .then((registrations) => {
        registrations.forEach((registration) => {
          void registration.unregister();
        });
      });

    if ("caches" in window) {
      caches.keys().then((cacheNames) => {
        cacheNames.forEach((cacheName) => {
          void caches.delete(cacheName);
        });
      });
    }

    return;
  }

  const registerServiceWorker = async () => {
    try {
      const registration =
        await navigator.serviceWorker.register(
          "/sw.js",
          {
            scope: "/",
            updateViaCache: "none",
          }
        );

      await navigator.serviceWorker.ready;

      const resourceUrls = performance
        .getEntriesByType("resource")
        .map((entry) => entry.name)
        .filter((url) =>
          url.startsWith(window.location.origin)
        );

      const worker =
        registration.active ||
        registration.waiting ||
        registration.installing;

      worker?.postMessage({
        type: "CACHE_URLS",
        urls: resourceUrls,
      });

      console.log(
        "Pomodoro offline mode ready"
      );
    } catch (error) {
      console.error(
        "Service Worker registration failed:",
        error
      );
    }
  };

  void registerServiceWorker();
}, []);

  // =========================
  // MEDIAN DETECTION
  // =========================

  useEffect(() => {
    let cancelled = false;

    // The user agent is only a hint. Median allows a custom/overridden UA, so
    // native bridge initialization must not depend exclusively on this string.
    const userAgent = navigator.userAgent.toLowerCase();
    const detectedMedian =
      userAgent.includes("median") || userAgent.includes("gonative");

    queueMicrotask(() => {
      if (cancelled) return;
      setIsMedianApp(detectedMedian);
      if (!detectedMedian) setMedianPlatform("web");
    });

    // General web-app behavior must never wait forever for the native bridge.
    // medianReady means "safe to continue the app", not necessarily that native
    // commands are available. medianBridgeReady below tracks the real bridge.
    const fallbackTimer = window.setTimeout(() => {
      if (!cancelled) {
        setMedianReady(true);
      }
    }, 1500);

    try {
      Median.onReady(async () => {
        if (cancelled) return;

        try {
          const nativeApp = Median.isNativeApp();
          const platform = await Median.getPlatform();

          if (cancelled) return;

          setIsMedianApp(nativeApp || detectedMedian);
          setMedianPlatform(platform as MedianPlatform);
          setMedianBridgeReady(true);
          setMedianReady(true);
        } catch (error) {
          console.error("Median bridge initialization failed:", error);

          if (!cancelled) {
            setMedianReady(true);
          }
        }
      });
    } catch (error) {
      console.error("Median.onReady registration failed:", error);
      queueMicrotask(() => {
        if (!cancelled) setMedianReady(true);
      });
    }

    return () => {
      cancelled = true;
      window.clearTimeout(fallbackTimer);
    };
  }, []);

  // =========================
  // MEDIAN HAPTICS
  // =========================

  const triggerHaptic = (style: HapticStyle) => {
    if (
      !featuresRef.current.settings.hapticsEnabled ||
      !isMedianApp ||
      !medianBridgeReady
    ) {
      return;
    }

    try {
      Median.haptics.trigger({ style });
    } catch (error) {
      // Haptics are an enhancement. The app must still work without the plugin.
      console.debug("Median haptic unavailable:", error);
    }
  };


  // =========================
  // ANDROID LIVE TIMER NOTIFICATION
  // =========================

  const getNativeSessionType = (
    workMode: boolean,
    longBreak: boolean
  ): "work" | "break" | "long-break" => {
    if (workMode) return "work";
    return longBreak ? "long-break" : "break";
  };

  const startNativeTimerNotification = (
    sessionEndTime: number,
    workMode: boolean,
    longBreak: boolean
  ) => {
    if (typeof window === "undefined") return;

    try {
      window.pomodoroNative?.startTimer(
        sessionEndTime,
        getNativeSessionType(workMode, longBreak)
      );
    } catch (error) {
      // Native live notification is optional.
      console.debug("Native Pomodoro notification unavailable:", error);
    }
  };

  const cancelNativeTimerNotification = () => {
    if (typeof window === "undefined") return;

    try {
      window.pomodoroNative?.cancelTimer();
    } catch (error) {
      console.debug("Could not cancel native Pomodoro notification:", error);
    }
  };


  // =========================
  // DURATION HELPERS
  // =========================

  const getWorkSeconds = (minutes = workMinutes) => {
    return TEST_MODE
      ? TEST_WORK_SECONDS
      : minutes * 60;
  };

  const getBreakSeconds = (
    longBreak: boolean,
    minutes = currentBreakMinutes
  ) => {
    if (TEST_MODE) {
      return longBreak
        ? TEST_LONG_BREAK_SECONDS
        : TEST_BREAK_SECONDS;
    }

    return minutes * 60;
  };


  // =========================
  // BREAK CALCULATIONS
  // =========================

  const calculateShortBreak = (workTime: number) => {
    return Math.max(1, Math.round(workTime / 5));
  };

  const calculateLongBreak = (shortBreak: number) => {
    return Math.min(
      MAX_MINUTES,
      Math.max(15, shortBreak * 3)
    );
  };


  // =========================
  // PERSISTENCE
  // =========================

  const readPersistedState = async (): Promise<string | null> => {
    // localStorage remains the fallback for the normal Vercel web version.
    let raw = localStorage.getItem(STORAGE_KEY);

    if (!isMedianApp || !medianBridgeReady) {
      return raw;
    }

    try {
      // If the Native Datastore plugin is enabled, this survives WebView cache clears.
      const result = await Median.storage.app.get({
        key: STORAGE_KEY,
      });

      if (result?.data) {
        raw = result.data;
      }
    } catch (error) {
      // Native Datastore is optional. Fall back to localStorage.
      console.debug("Median native storage unavailable:", error);
    }

    return raw;
  };

  const persistState = (state: PersistedPomodoroState) => {
    const serialized = JSON.stringify(state);

    localStorage.setItem(STORAGE_KEY, serialized);

    if (!isMedianApp || !medianBridgeReady) return;

    try {
      Promise.resolve(
        Median.storage.app.set({
          key: STORAGE_KEY,
          value: serialized,
        })
      ).catch((error) => {
        console.debug("Median native storage unavailable:", error);
      });
    } catch (error) {
      console.debug("Median native storage unavailable:", error);
    }
  };


  // =========================
  // OPTIONAL FEATURE DATA
  // =========================

  useEffect(() => {
    if (!medianReady || isFeaturesHydrated) return;

    let cancelled = false;

    const restoreFeatures = async () => {
      try {
        let raw = localStorage.getItem(FEATURES_STORAGE_KEY);

        if (isMedianApp && medianBridgeReady) {
          try {
            const result = await Median.storage.app.get({
              key: FEATURES_STORAGE_KEY,
            });
            if (result?.data) raw = result.data;
          } catch (error) {
            console.debug("Median feature storage unavailable:", error);
          }
        }

        if (!cancelled && raw) {
          setFeatures(sanitizeFeaturesState(JSON.parse(raw)));
        }
      } catch (error) {
        console.error("Could not restore Pomodoro feature data:", error);
      } finally {
        if (!cancelled) setIsFeaturesHydrated(true);
      }
    };

    void restoreFeatures();

    return () => {
      cancelled = true;
    };
  }, [
    isFeaturesHydrated,
    isMedianApp,
    medianBridgeReady,
    medianReady,
  ]);

  useEffect(() => {
    if (!isFeaturesHydrated) return;

    const sanitized = sanitizeFeaturesState(featuresRef.current);
    const serialized = JSON.stringify(sanitized);
    localStorage.setItem(FEATURES_STORAGE_KEY, serialized);

    if (!isMedianApp || !medianBridgeReady) return;

    try {
      Promise.resolve(
        Median.storage.app.set({
          key: FEATURES_STORAGE_KEY,
          value: serialized,
        })
      ).catch((error) => {
        console.debug("Median feature storage unavailable:", error);
      });
    } catch (error) {
      console.debug("Median feature storage unavailable:", error);
    }
  }, [features, isFeaturesHydrated, isMedianApp, medianBridgeReady]);

  useEffect(() => {
    document.documentElement.dataset.pomodoroTheme = features.settings.theme;
  }, [features.settings.theme]);


  // =========================
  // RESTORE APP STATE
  // =========================

  useEffect(() => {
    if (isHydrated) return;

    let cancelled = false;

    const restore = async () => {
      try {
        const raw = await readPersistedState();

        if (!raw || cancelled) {
          if (!cancelled) setIsHydrated(true);
          return;
        }

        const saved = JSON.parse(raw) as Partial<PersistedPomodoroState>;

        const restoredWorkMinutes =
          saved.workMinutes ?? 25;
        const restoredShortBreak =
          saved.shortBreakMinutes ?? 5;
        const restoredCurrentBreak =
          saved.currentBreakMinutes ?? restoredShortBreak;
        const restoredWorkMode =
          saved.isWorkMode ?? true;
        const restoredLongBreak =
          saved.isLongBreak ?? false;
        const restoredEndTime =
          saved.endTime ?? null;
        const restoredActive =
          Boolean(saved.isActive && restoredEndTime);

        let restoredSeconds =
          saved.secondsLeft ?? restoredWorkMinutes * 60;

        if (restoredActive && restoredEndTime) {
          restoredSeconds = Math.max(
            0,
            Math.ceil((restoredEndTime - Date.now()) / 1000)
          );
        }

        if (cancelled) return;

        setWorkMinutes(restoredWorkMinutes);
        setShortBreakMinutes(restoredShortBreak);
        setCurrentBreakMinutes(restoredCurrentBreak);
        setIsWorkMode(restoredWorkMode);
        setIsLongBreak(restoredLongBreak);
        const restoredCompletedSessions = saved.completedWorkSessions ?? 0;
        const restoredRound = saved.round ?? 1;

        const fallbackBreakSessionNumber =
          ((restoredRound - 1) % SESSIONS_BEFORE_LONG_BREAK) + 1;

        setRound(restoredRound);
        setCompletedWorkSessions(restoredCompletedSessions);
        setBreakSessionNumber(
          saved.breakSessionNumber ?? fallbackBreakSessionNumber
        );
        setSecondsLeft(restoredSeconds);
        setEndTime(restoredActive ? restoredEndTime : null);
        setIsActive(restoredActive);
      } catch (error) {
        console.error("Could not restore Pomodoro state:", error);
      } finally {
        if (!cancelled) {
          setIsHydrated(true);
        }
      }
    };

    restore();

    return () => {
      cancelled = true;
    };
  }, [isHydrated]);

  useEffect(() => {
    if (
      !isHydrated ||
      !isFeaturesHydrated ||
      !medianBridgeReady ||
      nativeStateReconciledRef.current
    ) {
      return;
    }

    let cancelled = false;

    queueMicrotask(() => {
      if (cancelled || nativeStateReconciledRef.current) return;
      nativeStateReconciledRef.current = true;

      const nativeActive = parseNativeJson<NativeTimerState>(
        window.pomodoroNative?.getActiveTimerState?.()
      );

      if (
        nativeActive?.active &&
        nativeActive.endTimeMs > Date.now() &&
        nativeActive.durationSeconds > 0
      ) {
      const nativeWorkMode = nativeActive.sessionType === "work";
      const nativeLongBreak = nativeActive.sessionType === "long-break";
      const nativeMinutes = Math.max(
        1,
        Math.round(nativeActive.durationSeconds / 60)
      );

      setIsWorkMode(nativeWorkMode);
      setIsLongBreak(nativeLongBreak);
      setSecondsLeft(
        Math.max(1, Math.ceil((nativeActive.endTimeMs - Date.now()) / 1000))
      );
      setEndTime(nativeActive.endTimeMs);
      setIsActive(true);

      if (nativeWorkMode) {
        setWorkMinutes(nativeMinutes);
      } else {
        setCurrentBreakMinutes(nativeMinutes);
        if (!nativeLongBreak) setShortBreakMinutes(nativeMinutes);
      }
      }

      const pending = parseNativeJson<NativePendingCompletion>(
        window.pomodoroNative?.getPendingCompletionState?.()
      );

      if (!pending || pending.endTimeMs <= 0) return;

      if (pending.sessionType === "work") {
      const sessionId = `session-${pending.endTimeMs}`;
      setFeatures((current) => ({
        ...current,
        history: current.history.some((session) => session.id === sessionId)
          ? current.history
          : [
              {
                id: sessionId,
                task: current.currentTask.trim(),
                completedAt: pending.endTimeMs,
                durationSeconds: pending.durationSeconds,
              },
              ...current.history,
            ].slice(0, MAX_HISTORY_ENTRIES),
      }));

      const nextCompletedSessions = completedWorkSessions + 1;
      const shouldTakeLongBreak =
        nextCompletedSessions % SESSIONS_BEFORE_LONG_BREAK === 0;
      const nextBreakMinutes = shouldTakeLongBreak
        ? calculateLongBreak(shortBreakMinutes)
        : shortBreakMinutes;

      setCompletedWorkSessions(nextCompletedSessions);
      setBreakSessionNumber(
        (completedWorkSessions % SESSIONS_BEFORE_LONG_BREAK) + 1
      );
      setIsWorkMode(false);
      setIsLongBreak(shouldTakeLongBreak);
      setCurrentBreakMinutes(nextBreakMinutes);
      setSecondsLeft(getBreakSeconds(shouldTakeLongBreak, nextBreakMinutes));
      } else {
      setIsWorkMode(true);
      setIsLongBreak(false);
      setCurrentBreakMinutes(shortBreakMinutes);
      setRound((current) => current + 1);
      setSecondsLeft(getWorkSeconds(workMinutes));
      }

      setIsActive(false);
      setEndTime(null);
      window.pomodoroNative?.acknowledgePendingCompletion?.();
    });

    return () => {
      cancelled = true;
    };
  }, [
    completedWorkSessions,
    isFeaturesHydrated,
    isHydrated,
    medianBridgeReady,
    shortBreakMinutes,
    workMinutes,
  ]);


  // =========================
  // SAVE APP STATE
  // =========================

  useEffect(() => {
    if (!isHydrated) return;

    persistState({
      isWorkMode,
      workMinutes,
      shortBreakMinutes,
      currentBreakMinutes,
      secondsLeft,
      isActive,
      round,
      completedWorkSessions,
      breakSessionNumber,
      isLongBreak,
      endTime,
    });

    // secondsLeft is intentionally excluded from dependencies.
    // While the timer runs, endTime is the source of truth and avoids a storage
    // write every second. Pausing, skipping, editing, or switching mode causes
    // another dependency below to change and persists the latest secondsLeft.
  }, [
    isHydrated,
    isWorkMode,
    workMinutes,
    shortBreakMinutes,
    currentBreakMinutes,
    isActive,
    round,
    completedWorkSessions,
    breakSessionNumber,
    isLongBreak,
    endTime,
    isMedianApp,
    medianReady,
    medianBridgeReady,
  ]);


  // =========================
  // PRELOAD AUDIO
  // =========================

  useEffect(() => {
    const ringtoneAudio = new Audio(
      getPublicAssetUrl("bell.mp3")
    );
    const buttonAudio = new Audio(
      getPublicAssetUrl("button-click.mp3")
    );

    ringtoneAudio.preload = "auto";
    buttonAudio.preload = "auto";

    ringtoneRef.current = ringtoneAudio;
    buttonSoundRef.current = buttonAudio;

    return () => {
      ringtoneAudio.pause();
      ringtoneAudio.currentTime = 0;

      buttonAudio.pause();
      buttonAudio.currentTime = 0;

      ringtoneRef.current = null;
      buttonSoundRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (ringtoneRef.current) {
      ringtoneRef.current.volume = features.settings.webVolume;
    }
    if (buttonSoundRef.current) {
      buttonSoundRef.current.volume = Math.min(
        0.45,
        features.settings.webVolume
      );
    }
  }, [features.settings.webVolume]);


  // =========================
  // BUTTON SOUND
  // =========================

  const playSound = () => {
    if (!featuresRef.current.settings.soundEnabled) return;

    const audio = buttonSoundRef.current;

    if (!audio) return;

    audio.pause();
    audio.currentTime = 0;

    audio.play().catch(() => {
      // Sound is optional. Never break the timer if playback is blocked.
    });
  };


  // =========================
  // RINGTONE
  // =========================

  const ringtone = () => {
    if (!featuresRef.current.settings.soundEnabled) return;

    const audio = ringtoneRef.current;

    if (!audio) return;

    audio.pause();
    audio.currentTime = 0;
    audio.loop = true;

    audio.play().catch((error) => {
      console.error("Ringtone could not play:", error);
    });

    window.setTimeout(() => {
      audio.pause();
      audio.currentTime = 0;
      audio.loop = false;
    }, 5000);
  };


  // =========================
  // MOBILE AUDIO UNLOCK
  // =========================

  const unlockRingtone = async () => {
    const audio = ringtoneRef.current;

    if (!audio) return;

    try {
      audio.muted = true;
      audio.currentTime = 0;

      await audio.play();

      audio.pause();
      audio.currentTime = 0;
      audio.muted = false;
    } catch (error) {
      audio.muted = false;
      console.debug("Audio unlock failed:", error);
    }
  };


  // =========================
  // SESSION COMPLETE
  // =========================

  const isNativeAndroidPomodoro = () => {
    return (
      typeof window !== "undefined" &&
      typeof window.pomodoroNative?.startTimer === "function"
    );
  };

  const startNextSessionAutomatically = (
    durationSeconds: number,
    nextWorkMode: boolean,
    nextLongBreak: boolean
  ) => {
    window.setTimeout(() => {
      const nextEndTime = Date.now() + durationSeconds * 1000;
      setSecondsLeft(durationSeconds);
      setEndTime(nextEndTime);
      setIsActive(true);
      startNativeTimerNotification(
        nextEndTime,
        nextWorkMode,
        nextLongBreak
      );
    }, 0);
  };

  const completeCurrentSession = (playFeedback = true) => {
  if (completionLockRef.current) return;

  completionLockRef.current = true;

  const nativeAndroid = isNativeAndroidPomodoro();

  // Android uses ONLY the native bell.mp3.
  if (playFeedback && !nativeAndroid) {
    ringtone();
    triggerHaptic("notificationSuccess");
  }

  // Do not cancel the Android alarm exactly at completion.
  if (!nativeAndroid) {
    cancelNativeTimerNotification();
  }

  const completedAt = endTime ?? Date.now();

  setIsActive(false);
  setEndTime(null);

    if (isWorkMode) {
      const currentWorkNumber =
        (completedWorkSessions % SESSIONS_BEFORE_LONG_BREAK) + 1;

      const nextCompletedSessions = completedWorkSessions + 1;

      const sessionId = `session-${completedAt}`;
      setFeatures((current) => ({
        ...current,
        history: current.history.some((session) => session.id === sessionId)
          ? current.history
          : [
              {
                id: sessionId,
                task: current.currentTask.trim(),
                completedAt,
                durationSeconds: getWorkSeconds(workMinutes),
              },
              ...current.history,
            ].slice(0, MAX_HISTORY_ENTRIES),
      }));

      setBreakSessionNumber(currentWorkNumber);
      setCompletedWorkSessions(nextCompletedSessions);

      const shouldTakeLongBreak =
        nextCompletedSessions % SESSIONS_BEFORE_LONG_BREAK === 0;

      if (shouldTakeLongBreak) {
        const longBreakMinutes =
          calculateLongBreak(shortBreakMinutes);

        setCurrentBreakMinutes(longBreakMinutes);
        setIsLongBreak(true);
        setSecondsLeft(
          getBreakSeconds(true, longBreakMinutes)
        );

        if (featuresRef.current.settings.autoStartBreaks) {
          startNextSessionAutomatically(
            getBreakSeconds(true, longBreakMinutes),
            false,
            true
          );
        }
      } else {
        setCurrentBreakMinutes(shortBreakMinutes);
        setIsLongBreak(false);
        setSecondsLeft(
          getBreakSeconds(false, shortBreakMinutes)
        );

        if (featuresRef.current.settings.autoStartBreaks) {
          startNextSessionAutomatically(
            getBreakSeconds(false, shortBreakMinutes),
            false,
            false
          );
        }
      }

      setIsWorkMode(false);
    } else {
      setIsWorkMode(true);
      setIsLongBreak(false);
      setCurrentBreakMinutes(shortBreakMinutes);
      setRound((prev) => prev + 1);
      setSecondsLeft(getWorkSeconds(workMinutes));

      if (featuresRef.current.settings.autoStartWork) {
        startNextSessionAutomatically(
          getWorkSeconds(workMinutes),
          true,
          false
        );
      }
    }

    if (nativeAndroid) {
      window.setTimeout(() => {
        window.pomodoroNative?.acknowledgePendingCompletion?.();
      }, 750);
    }

    window.setTimeout(() => {
      completionLockRef.current = false;
    }, 0);
  };


  // =========================
  // TIMESTAMP-BASED TIMER
  // =========================

  useEffect(() => {
    if (!isActive || !endTime) return;

    const syncTimer = () => {
      const remaining = Math.max(
        0,
        Math.ceil((endTime - Date.now()) / 1000)
      );

      setSecondsLeft(remaining);

      if (remaining === 0) {
        const overdueMs = Math.max(0, Date.now() - endTime);
        const shouldPlayFeedback =
          overdueMs <= COMPLETION_FEEDBACK_GRACE_MS;

        completeCurrentSession(shouldPlayFeedback);
      }
    };

    syncTimer();

    const interval = window.setInterval(syncTimer, 250);

    return () => {
      window.clearInterval(interval);
    };
  }, [
    isActive,
    endTime,
    isWorkMode,
    completedWorkSessions,
    shortBreakMinutes,
    workMinutes,
  ]);


  // =========================
  // BACKGROUND / RESUME SYNC
  // =========================

  useEffect(() => {
    const syncWhenVisible = () => {
      if (
        document.visibilityState !== "visible" ||
        !isActive ||
        !endTime
      ) {
        return;
      }

      const remaining = Math.max(
        0,
        Math.ceil((endTime - Date.now()) / 1000)
      );

      setSecondsLeft(remaining);

      if (remaining === 0) {
        const overdueMs = Math.max(0, Date.now() - endTime);
        const shouldPlayFeedback =
          overdueMs <= COMPLETION_FEEDBACK_GRACE_MS;

        completeCurrentSession(shouldPlayFeedback);
      }
    };

    document.addEventListener("visibilitychange", syncWhenVisible);
    window.addEventListener("focus", syncWhenVisible);

    return () => {
      document.removeEventListener("visibilitychange", syncWhenVisible);
      window.removeEventListener("focus", syncWhenVisible);
    };
  }, [
    isActive,
    endTime,
    isWorkMode,
    completedWorkSessions,
    shortBreakMinutes,
    workMinutes,
  ]);


  // =========================
  // RESTORE ANDROID LIVE NOTIFICATION
  // =========================

  useEffect(() => {
    if (!isHydrated || !isActive || !endTime) return;

    const remainingMs = endTime - Date.now();

    if (remainingMs <= 0) {
      cancelNativeTimerNotification();
      return;
    }

    startNativeTimerNotification(
      endTime,
      isWorkMode,
      isLongBreak
    );
  }, [
    isHydrated,
    isActive,
    endTime,
    isWorkMode,
    isLongBreak,
  ]);


  // =========================
  // FORMAT TIME
  // =========================

  const formatTime = () => {
    const totalHours = Math.floor(secondsLeft / 3600);
    const minutes = Math.floor((secondsLeft % 3600) / 60);
    const seconds = secondsLeft % 60;

    if (totalHours > 0) {
      return `${totalHours
        .toString()
        .padStart(2, "0")}:${minutes
        .toString()
        .padStart(2, "0")}:${seconds
        .toString()
        .padStart(2, "0")}`;
    }

    return `${minutes
      .toString()
      .padStart(2, "0")}:${seconds
      .toString()
      .padStart(2, "0")}`;
  };


  // =========================
  // BROWSER TAB TITLE
  // =========================

  useEffect(() => {
    document.title = `Pomodoro - ${formatTime()}`;

    return () => {
      document.title = "Pomodoro";
    };
  }, [secondsLeft]);


  // =========================
  // START / PAUSE
  // =========================

  const handleStartPause = async () => {
    setIsEditing(false);
    playSound();
    triggerHaptic("impactLight");

    if (isActive) {
      if (endTime) {
        // User-event timestamp; this code never runs during render.
        // eslint-disable-next-line react-hooks/purity
        const pauseTime = Date.now();
        const remaining = Math.max(
          0,
          Math.ceil((endTime - pauseTime) / 1000)
        );

        setSecondsLeft(remaining);
      }

      cancelNativeTimerNotification();
      setEndTime(null);
      setIsActive(false);
      return;
    }

    if (secondsLeft <= 0) return;

    await unlockRingtone();

    // User-event timestamp; this code never runs during render.
    // eslint-disable-next-line react-hooks/purity
    const startTime = Date.now();
    const nextEndTime = startTime + secondsLeft * 1000;

    setEndTime(nextEndTime);
    setIsActive(true);

    startNativeTimerNotification(
      nextEndTime,
      isWorkMode,
      isLongBreak
    );

  };


  // =========================
  // OPEN EDIT
  // =========================

  const handleOpenEdit = () => {
    if (isActive && endTime) {
      // User-event timestamp; this code never runs during render.
      // eslint-disable-next-line react-hooks/purity
      const editTime = Date.now();
      const remaining = Math.max(
        0,
        Math.ceil((endTime - editTime) / 1000)
      );

      setSecondsLeft(remaining);
    }

    const currentMinutes = isWorkMode
      ? workMinutes
      : currentBreakMinutes;

    const currentValue = currentMinutes.toString();
    inputMinutesRef.current = currentValue;
    setInputMinutes(currentValue);
    cancelNativeTimerNotification();
    setEndTime(null);
    setIsActive(false);
    setIsEditing(true);

    playSound();
    triggerHaptic("impactLight");
  };


  // =========================
  // SAVE EDIT
  // =========================

  const handleSaveTime = () => {
    const newMinutes = Number(inputMinutes);

    if (
      !Number.isInteger(newMinutes) ||
      newMinutes < 1 ||
      newMinutes > MAX_MINUTES
    ) {
      triggerHaptic("notificationError");
      return;
    }

    cancelNativeTimerNotification();
    setEndTime(null);
    setIsActive(false);

    if (isWorkMode) {
      setWorkMinutes(newMinutes);

      const newShortBreak = calculateShortBreak(newMinutes);

      setShortBreakMinutes(newShortBreak);
      setCurrentBreakMinutes(newShortBreak);
      setSecondsLeft(getWorkSeconds(newMinutes));
    } else {
      setCurrentBreakMinutes(newMinutes);

      if (!isLongBreak) {
        setShortBreakMinutes(newMinutes);
      }

      setSecondsLeft(getBreakSeconds(isLongBreak, newMinutes));
    }

    setIsEditing(false);
    playSound();
    triggerHaptic("notificationSuccess");
  };


  // =========================
  // CANCEL EDIT
  // =========================

  const handleCancelEdit = () => {
    setIsEditing(false);
    playSound();
    triggerHaptic("impactLight");
  };


  // =========================
  // INCREASE / DECREASE
  // =========================

  const stopMinuteHold = React.useCallback(() => {
    if (minuteHoldTimerRef.current !== null) {
      window.clearTimeout(minuteHoldTimerRef.current);
      minuteHoldTimerRef.current = null;
    }
  }, []);

  const adjustMinutes = (direction: -1 | 1, step = 1) => {
    const parsedMinutes = Number(inputMinutesRef.current);
    const currentMinutes = Number.isFinite(parsedMinutes)
      ? Math.trunc(parsedMinutes)
      : direction > 0
        ? 0
        : 1;

    const nextMinutes = Math.min(
      MAX_MINUTES,
      Math.max(1, currentMinutes + direction * step)
    );

    if (nextMinutes === currentMinutes) return false;

    const nextValue = nextMinutes.toString();
    inputMinutesRef.current = nextValue;
    setInputMinutes(nextValue);

    const hapticTime = performance.now();
    if (hapticTime - lastMinuteHapticAtRef.current >= 200) {
      lastMinuteHapticAtRef.current = hapticTime;
      triggerHaptic(medianPlatform === "android" ? "tick" : "impactLight");
    }

    return true;
  };

  const repeatMinuteChange = (direction: -1 | 1) => {
    const elapsed = performance.now() - minuteHoldStartedAtRef.current;

    const acceleration =
      elapsed < 1200
        ? { step: 1, delay: 180 }
        : elapsed < 3000
          ? { step: 1, delay: 95 }
          : elapsed < 6000
            ? { step: 2, delay: 70 }
            : { step: 5, delay: 55 };

    if (!adjustMinutes(direction, acceleration.step)) {
      stopMinuteHold();
      return;
    }

    minuteHoldTimerRef.current = window.setTimeout(
      () => repeatMinuteChange(direction),
      acceleration.delay
    );
  };

  const startMinuteHold = (direction: -1 | 1) => {
    stopMinuteHold();
    minuteHoldStartedAtRef.current = performance.now();
    lastMinuteHapticAtRef.current = Number.NEGATIVE_INFINITY;
    suppressMinuteClickUntilRef.current = Number.POSITIVE_INFINITY;

    if (!adjustMinutes(direction)) return;

    minuteHoldTimerRef.current = window.setTimeout(
      () => repeatMinuteChange(direction),
      420
    );
  };

  const finishMinuteHold = () => {
    stopMinuteHold();
    suppressMinuteClickUntilRef.current = performance.now() + 500;
  };

  const handleMinuteButtonClick = (direction: -1 | 1) => {
    if (performance.now() <= suppressMinuteClickUntilRef.current) {
      suppressMinuteClickUntilRef.current = 0;
      return;
    }

    lastMinuteHapticAtRef.current = Number.NEGATIVE_INFINITY;
    adjustMinutes(direction);
  };

  useEffect(() => {
    if (!isEditing) stopMinuteHold();
  }, [isEditing, stopMinuteHold]);

  useEffect(() => {
    return () => stopMinuteHold();
  }, [stopMinuteHold]);


  // =========================
  // INPUT CHANGE
  // =========================

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const value = e.target.value;

    if (value === "") {
      inputMinutesRef.current = "";
      setInputMinutes("");
      return;
    }

    if (!/^\d+$/.test(value)) return;

    const numericValue = Number(value);

    if (numericValue > MAX_MINUTES) return;

    inputMinutesRef.current = value;
    setInputMinutes(value);
  };


  // =========================
  // SKIP
  // =========================

  const handleSkip = () => {
    cancelNativeTimerNotification();
    setEndTime(null);
    setIsActive(false);
    setIsEditing(false);

    playSound();
    triggerHaptic("impactMedium");

    if (isWorkMode) {
      // A skipped work block is not a completed Pomodoro.
      const currentWorkNumber =
        (completedWorkSessions % SESSIONS_BEFORE_LONG_BREAK) + 1;

      setBreakSessionNumber(currentWorkNumber);
      setCurrentBreakMinutes(shortBreakMinutes);
      setIsLongBreak(false);
      setIsWorkMode(false);
      setSecondsLeft(
        getBreakSeconds(false, shortBreakMinutes)
      );
      return;
    }

    setIsWorkMode(true);
    setIsLongBreak(false);
    setCurrentBreakMinutes(shortBreakMinutes);
    setRound((prev) => prev + 1);
    setSecondsLeft(getWorkSeconds(workMinutes));
  };


  // =========================
  // OPTIONAL TOOLS
  // =========================

  const openAdvancedTools = () => {
    if (advancedCloseTimerRef.current !== null) {
      window.clearTimeout(advancedCloseTimerRef.current);
      advancedCloseTimerRef.current = null;
    }

    if (advancedOpenFrameRef.current !== null) {
      window.cancelAnimationFrame(advancedOpenFrameRef.current);
    }

    setAdvancedPanel("history");
    setIsAdvancedOpen(true);
    setIsAdvancedVisible(false);

    advancedOpenFrameRef.current = window.requestAnimationFrame(() => {
      advancedOpenFrameRef.current = null;
      setIsAdvancedVisible(true);
    });

    playSound();
    triggerHaptic("impactLight");
  };

  const closeAdvancedTools = React.useCallback(() => {
    if (advancedOpenFrameRef.current !== null) {
      window.cancelAnimationFrame(advancedOpenFrameRef.current);
      advancedOpenFrameRef.current = null;
    }

    setIsAdvancedVisible(false);

    if (advancedCloseTimerRef.current !== null) {
      window.clearTimeout(advancedCloseTimerRef.current);
    }

    advancedCloseTimerRef.current = window.setTimeout(() => {
      advancedCloseTimerRef.current = null;
      setIsAdvancedOpen(false);
    }, TOOLS_CLOSE_ANIMATION_MS);
  }, []);

  useEffect(() => {
    if (!isAdvancedOpen) return;

    const previousOverflow = document.body.style.overflow;
    const previousPaddingRight = document.body.style.paddingRight;
    const scrollbarWidth = Math.max(
      0,
      window.innerWidth - document.documentElement.clientWidth
    );

    if (scrollbarWidth > 0) {
      const currentPaddingRight = Number.parseFloat(
        window.getComputedStyle(document.body).paddingRight
      ) || 0;

      document.body.style.paddingRight = `${
        currentPaddingRight + scrollbarWidth
      }px`;
    }

    document.body.style.overflow = "hidden";

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeAdvancedTools();
    };

    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.body.style.paddingRight = previousPaddingRight;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [closeAdvancedTools, isAdvancedOpen]);

  useEffect(() => {
    return () => {
      if (advancedOpenFrameRef.current !== null) {
        window.cancelAnimationFrame(advancedOpenFrameRef.current);
      }

      if (advancedCloseTimerRef.current !== null) {
        window.clearTimeout(advancedCloseTimerRef.current);
      }
    };
  }, []);

  const updateFeatureSetting = <K extends keyof FeatureSettings>(
    key: K,
    value: FeatureSettings[K]
  ) => {
    setFeatures((current) => ({
      ...current,
      settings: { ...current.settings, [key]: value },
    }));
  };

  const clearHistory = () => {
    if (!window.confirm("Delete all completed session history?")) return;
    setFeatures((current) => ({ ...current, history: [] }));
    showToast("History deleted.");
  };

  const openNativeSoundSettings = () => {
    const opened = window.pomodoroNative?.openCompletionSoundSettings?.();
    if (!opened) showToast("Open notification settings from Android Settings.");
  };

  const todaySessions = useMemo(
    () =>
      features.history.filter(
        (session) => localDayKey(session.completedAt) === todayKey
      ),
    [features.history, todayKey]
  );
  const todayFocusMinutes = Math.floor(
    todaySessions.reduce(
      (sum, session) => sum + session.durationSeconds,
      0
    ) / 60
  );
  const totalFocusMinutes = Math.floor(
    features.history.reduce(
      (sum, session) => sum + session.durationSeconds,
      0
    ) / 60
  );
  const totalFocusHours = Math.floor(totalFocusMinutes / 60);
  const remainingFocusMinutes = totalFocusMinutes % 60;

  const focusSecondsByDay = useMemo(() => {
    const totals = new Map<string, number>();

    features.history.forEach((session) => {
      const dayKey = localDayKey(session.completedAt);
      totals.set(dayKey, (totals.get(dayKey) ?? 0) + session.durationSeconds);
    });

    return totals;
  }, [features.history]);

  const weeklyFocusDays = useMemo(() => {
    const currentDay = new Date(`${todayKey}T12:00:00`);
    const weekdayFormatter = new Intl.DateTimeFormat("en-US", {
      weekday: "short",
    });

    return Array.from({ length: 7 }, (_, index) => {
      const date = new Date(currentDay);
      date.setDate(currentDay.getDate() - (6 - index));
      const key = localDayKey(date.getTime());

      return {
        key,
        label: weekdayFormatter.format(date).slice(0, 2),
        minutes: Math.floor((focusSecondsByDay.get(key) ?? 0) / 60),
        isToday: key === todayKey,
      };
    });
  }, [focusSecondsByDay, todayKey]);

  const weeklyMaxMinutes = Math.max(
    1,
    ...weeklyFocusDays.map((day) => day.minutes)
  );
  const weeklyFocusMinutes = weeklyFocusDays.reduce(
    (sum, day) => sum + day.minutes,
    0
  );

  const focusCalendar = useMemo(() => {
    const currentDay = new Date(`${todayKey}T12:00:00`);
    const year = currentDay.getFullYear();
    const month = currentDay.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstWeekday = new Date(year, month, 1).getDay();
    const leadingEmptyDays = (firstWeekday + 6) % 7;
    const monthLabel = new Intl.DateTimeFormat("en-US", {
      month: "long",
      year: "numeric",
    }).format(currentDay);

    const days = [
      ...Array.from({ length: leadingEmptyDays }, () => null),
      ...Array.from({ length: daysInMonth }, (_, index) => {
        const day = index + 1;
        const date = new Date(year, month, day, 12);
        const key = localDayKey(date.getTime());
        const minutes = Math.floor((focusSecondsByDay.get(key) ?? 0) / 60);

        return {
          key,
          day,
          minutes,
          isToday: key === todayKey,
          intensity:
            minutes >= 100
              ? 4
              : minutes >= 50
                ? 3
                : minutes >= 25
                  ? 2
                  : minutes > 0
                    ? 1
                    : 0,
        };
      }),
    ];

    return { monthLabel, days };
  }, [focusSecondsByDay, todayKey]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setTodayKey(localDayKey(Date.now()));
    }, 60 * 1000);

    return () => window.clearInterval(interval);
  }, []);

  const currentSessionTotalSeconds = Math.max(
    1,
    isWorkMode
      ? getWorkSeconds(workMinutes)
      : getBreakSeconds(isLongBreak, currentBreakMinutes)
  );

  const timerProgress = Math.min(
    1,
    Math.max(0, secondsLeft / currentSessionTotalSeconds)
  );


  // =========================
  // UI
  // =========================

  return (

    <main
      className="w-full"
      data-platform={medianPlatform}
      data-median-app={isMedianApp ? "true" : "false"}
    >

      {/* =====================================================
          SECTION 1 — TIMER
      ===================================================== */}

      <section
        id="timer"
        style={
          isMedianApp
            ? {
                paddingTop: "env(safe-area-inset-top)",
                paddingBottom: "calc(4rem + env(safe-area-inset-bottom))",
              }
            : undefined
        }
        className={`
          relative
          isolate
          min-h-screen
          w-full

          flex
          flex-col
          items-center

          overflow-hidden

          transition-colors
          duration-700

          pb-16

          ${
            isWorkMode
              ? "bg-[#fff9f5]"
              : "bg-[#f5faf7]"
          }
        `}
      >

        <div
          aria-hidden="true"
          className={`
            pointer-events-none absolute -right-[82px] -top-[96px] z-0
            h-[252px] w-[252px] rotate-[8deg]
            rounded-[44%_56%_52%_48%]
            border opacity-70 transition-colors duration-700
            ${
              features.settings.theme === "light"
                ? isWorkMode
                  ? "border-[#f7ddd7] bg-[#fff0ec]"
                  : "border-[#d9eadf] bg-[#e7f3ec]"
                : "border-white/[0.045] bg-white/[0.025]"
            }
          `}
        >
          <span
            className={`
              absolute inset-[22%] rounded-full border
              ${
                features.settings.theme === "light"
                  ? isWorkMode
                    ? "border-[#efcfc8]/65"
                    : "border-[#cde2d5]/70"
                  : "border-white/[0.045]"
              }
            `}
          />
        </div>

        <div
          aria-hidden="true"
          className={`
            pointer-events-none absolute -bottom-[112px] -left-[94px] z-0
            h-[218px] w-[218px] -rotate-[12deg]
            rounded-[56%_44%_47%_53%]
            border opacity-55 transition-colors duration-700
            ${
              features.settings.theme === "light"
                ? isWorkMode
                  ? "border-[#d8e9df] bg-[#e8f3ed]"
                  : "border-[#f3d8d2] bg-[#fff0ec]"
                : "border-white/[0.04] bg-white/[0.02]"
            }
          `}
        />


        {/* =========================
            TITLE
        ========================= */}

        <div
          className="
            relative
            z-10
            mt-12

            flex
            flex-col
            items-center

            gap-2
          "
        >


          <a
            onClick={playSound}
            href="#about"
            className="
              pomodoro-main-title

              text-5xl

              font-black

              tracking-tight

              text-emerald-900

              leading-none

              select-none

              cursor-pointer

              transition-colors
              duration-200

              hover:text-[#e4573f]
            "
          >

            P o m o d o r o

          </a>


          <p
            className="
              pomodoro-mode-label

              text-sm

              font-semibold

              uppercase

              tracking-[0.22em]

              text-emerald-800/80

              select-none
            "
          >

            #{isWorkMode
              ? (completedWorkSessions % SESSIONS_BEFORE_LONG_BREAK) + 1
              : breakSessionNumber}

            {" · "}

            {isWorkMode
              ? "Work"
              : isLongBreak
                ? "Long Break"
                : "Break"}

          </p>

        </div>


        {/* =====================================================
            TOMATO
        ===================================================== */}

        <div
          className="
            relative
            z-10

            mt-15

            w-[345px]
            h-[355px]

            sm:w-[375px]
            sm:h-[380px]
          "
        >

          <svg
            aria-hidden="true"
            viewBox="0 0 100 100"
            className="
              pointer-events-none absolute left-1/2 top-[55%] z-0
              h-[386px] w-[386px] -translate-x-1/2 -translate-y-1/2
              sm:h-[416px] sm:w-[416px]
            "
            xmlns="http://www.w3.org/2000/svg"
          >
            <circle
              cx="50"
              cy="50"
              r="47.5"
              fill={
                features.settings.theme === "light"
                  ? "rgba(255,255,255,0.22)"
                  : "rgba(255,255,255,0.018)"
              }
              stroke={
                features.settings.theme === "light"
                  ? isWorkMode
                    ? "#efdcd6"
                    : "#d7e8de"
                  : "rgba(255,255,255,0.055)"
              }
              strokeWidth="0.7"
            />

            <circle
              cx="50"
              cy="50"
              r="47.5"
              fill="none"
              stroke={isWorkMode ? "#f58b80" : "#74a98c"}
              strokeWidth="1.25"
              strokeLinecap="round"
              pathLength="100"
              strokeDasharray="100"
              strokeDashoffset={100 - timerProgress * 100}
              transform="rotate(-90 50 50)"
              opacity={isActive ? 0.78 : 0.36}
              style={{
                transition: isActive
                  ? "stroke-dashoffset 1s linear, stroke 700ms ease, opacity 200ms ease"
                  : "stroke-dashoffset 220ms ease, stroke 700ms ease, opacity 200ms ease",
              }}
            />
          </svg>


          {/* =========================
              TOMATO BODY
          ========================= */}

          <div
            className={`
              absolute

              bottom-0
              left-0
              z-10

              w-full

              h-[325px]
              sm:h-[350px]

              flex
              items-center
              justify-center

              overflow-visible

              transition-transform
              duration-700
              ease-in-out
            `}
          >

            <svg
              aria-hidden="true"
              viewBox="0 0 360 350"
              preserveAspectRatio="none"
              className={`
                pointer-events-none absolute inset-0 h-full w-full
                overflow-visible transition-all duration-700
                ${
                  isWorkMode
                    ? "drop-shadow-[0_22px_25px_rgba(111,55,47,0.16)]"
                    : "drop-shadow-[0_22px_25px_rgba(35,80,61,0.14)]"
                }
              `}
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M180 44 C159 19 128 18 111 43 C54 47 17 103 19 190 C21 283 84 333 180 337 C276 333 339 283 341 190 C343 103 306 47 249 43 C232 18 201 19 180 44Z"
                fill={isWorkMode ? "#f86557" : "#4a8b6d"}
                style={{ transition: "fill 700ms ease" }}
              />

              <path
                d="M35 222 C48 296 103 329 180 333 C257 329 312 296 325 222"
                fill="none"
                stroke={isWorkMode ? "#b7453b" : "#2d684f"}
                strokeWidth="8"
                strokeLinecap="round"
                opacity="0.1"
                style={{ transition: "stroke 700ms ease" }}
              />

              <ellipse
                cx="108"
                cy="91"
                rx="47"
                ry="22"
                transform="rotate(-15 108 91)"
                fill="white"
                opacity="0.115"
              />

              <ellipse
                cx="82"
                cy="128"
                rx="11"
                ry="7"
                transform="rotate(-15 82 128)"
                fill="white"
                opacity="0.13"
              />
            </svg>


            {/* =========================
                CONTENT AREA
            ========================= */}

            <div
              className="
                absolute

                left-1/2
                top-1/2

                -translate-x-1/2
                -translate-y-1/2

                w-[310px]
                sm:w-[330px]

                h-[180px]

                z-10
              "
            >


              {/* =========================
                  TIMER VIEW
              ========================= */}

              <div
                className={`
                  absolute
                  inset-0

                  flex
                  flex-col
                  items-center
                  justify-center

                  transition-all
                  duration-300
                  ease-out

                  ${
                    isEditing
                      ? "opacity-0 scale-95 pointer-events-none"
                      : "opacity-100 scale-100"
                  }
                `}
              >


                <span
                  className="
                    text-white

                    text-6xl
                    sm:text-7xl

                    font-black

                    tracking-[-0.04em]

                    drop-shadow-sm

                    tabular-nums

                    select-none
                  "
                >

                  {formatTime()}

                </span>


                {/* =========================
                    EDIT BUTTON
                ========================= */}

                <button
                  onClick={handleOpenEdit}
                  aria-label="Edit timer"
                  className={`
                    absolute

                    left-1/2
                    top-40

                    -translate-x-1/2
                    -translate-y-1/2

                    w-11
                    h-11

                    rounded-full

                    bg-white

                    flex
                    items-center
                    justify-center

                    text-xl

                    shadow-md

                    hover:scale-110

                    active:scale-95

                    transition-all
                    duration-200

                    ${
                      isWorkMode
                        ? "text-[#f86557]"
                        : "text-[#4a8b6d]"
                    }
                  `}
                >

                  ✎

                </button>

              </div>


              {/* =========================
                  EDIT PANEL
              ========================= */}

              <div
                className={`
                  absolute
                  inset-0

                  flex
                  flex-col
                  items-center
                  justify-center

                  gap-4

                  text-white

                  transition-all
                  duration-300
                  ease-out

                  ${
                    isEditing
                      ? "opacity-100 scale-100"
                      : "opacity-0 scale-105 pointer-events-none"
                  }
                `}
              >


                <div className="h-6" />


                {/* =========================
                    MINUTES
                ========================= */}

                <div
                  className="
                    flex
                    items-center
                    gap-5
                  "
                >


                  {/* MINUS */}

                  <button
                    type="button"
                    onPointerDown={(event) => {
                      if (!event.isPrimary || event.button !== 0) return;
                      event.currentTarget.setPointerCapture(event.pointerId);
                      startMinuteHold(-1);
                    }}
                    onPointerUp={finishMinuteHold}
                    onPointerCancel={finishMinuteHold}
                    onLostPointerCapture={finishMinuteHold}
                    onClick={() => handleMinuteButtonClick(-1)}
                    onContextMenu={(event) => event.preventDefault()}
                    aria-label="Decrease minutes. Press and hold to accelerate."
                    className="
                      w-11
                      h-11

                      rounded-full

                      bg-white/20

                      text-white
                      text-2xl
                      font-bold

                      flex
                      items-center
                      justify-center

                      touch-manipulation
                      select-none

                      hover:bg-white/30

                      hover:scale-110

                      active:scale-95

                      transition-all
                      duration-200
                    "
                  >

                    −

                  </button>


                  {/* INPUT */}

                  <input
                    type="text"

                    inputMode="numeric"

                    pattern="[0-9]*"

                    value={inputMinutes}

                    onChange={
                      handleInputChange
                    }

                    onFocus={(e) => {

                      e.currentTarget.select();

                    }}

                    onKeyDown={(e) => {

                      if (
                        e.key === "Enter"
                      ) {

                        handleSaveTime();

                      }

                    }}

                    maxLength={3}

                    aria-label="Minutes"

                    className="
                      w-28
                      h-16

                      rounded-2xl

                      bg-white/15

                      border-2
                      border-white/35

                      text-center

                      text-4xl
                      font-black

                      text-white

                      tabular-nums

                      shadow-inner

                      outline-none

                      caret-white

                      transition-all
                      duration-200

                      hover:bg-white/20

                      focus:bg-white/20
                      focus:border-white/70
                      focus:scale-105
                    "
                  />


                  {/* PLUS */}

                  <button
                    type="button"
                    onPointerDown={(event) => {
                      if (!event.isPrimary || event.button !== 0) return;
                      event.currentTarget.setPointerCapture(event.pointerId);
                      startMinuteHold(1);
                    }}
                    onPointerUp={finishMinuteHold}
                    onPointerCancel={finishMinuteHold}
                    onLostPointerCapture={finishMinuteHold}
                    onClick={() => handleMinuteButtonClick(1)}
                    onContextMenu={(event) => event.preventDefault()}
                    aria-label="Increase minutes. Press and hold to accelerate."
                    className="
                      w-11
                      h-11

                      rounded-full

                      bg-white/20

                      text-white
                      text-2xl
                      font-bold

                      flex
                      items-center
                      justify-center

                      touch-manipulation
                      select-none

                      hover:bg-white/30

                      hover:scale-110

                      active:scale-95

                      transition-all
                      duration-200
                    "
                  >

                    +

                  </button>

                </div>


                {/* =========================
                    EDIT INFO
                ========================= */}

                <p
                  className="
                    text-xs

                    font-medium

                    text-white/75
                  "
                >

                  {isWorkMode
                    ? "Short break adjusts automatically"
                    : isLongBreak
                      ? "Editing this long break only"
                      : "Custom short break"}

                </p>

                {/* =========================
                    EDIT ACTIONS
                ========================= */}

                <div
                  className="
                    flex
                    items-center
                    gap-2
                  "
                >


                  {/* CANCEL */}

                  <button
                    onClick={() => {

                      handleCancelEdit();

                    }}
                    className="
                      px-5
                      py-2

                      rounded-full

                      bg-white/20

                      text-white

                      font-bold

                      hover:bg-white/30

                      hover:scale-105

                      active:scale-95

                      transition-all
                      duration-200
                    "
                  >

                    Cancel

                  </button>


                  {/* OPTIONAL TOOLS — visible only inside the editor */}

                  <button
                    onClick={openAdvancedTools}
                    className="
                      min-h-10 rounded-full
                      border-2 border-white/40
                      bg-white/15 px-5 py-2
                      font-bold text-white
                      shadow-md backdrop-blur-sm
                      transition-all duration-200
                      hover:scale-105 hover:bg-white/30
                      active:scale-95
                      focus-visible:outline-none
                      focus-visible:ring-4
                      focus-visible:ring-white/30
                    "
                  >

                    Tools

                  </button>


                  {/* SAVE */}

                  <button
                    onClick={() => {

                      handleSaveTime();

                    }}
                    disabled={
                      inputMinutes === "" ||
                      Number(inputMinutes) < 1 ||
                      Number(inputMinutes) >
                        MAX_MINUTES
                    }
                    className={`
                      px-6
                      py-2

                      rounded-full

                      bg-white

                      font-bold

                      shadow-md

                      hover:scale-105

                      active:scale-95

                      transition-all
                      duration-200

                      disabled:opacity-40
                      disabled:cursor-not-allowed
                      disabled:hover:scale-100

                      ${
                        isWorkMode
                          ? "text-[#f86557]"
                          : "text-[#4a8b6d]"
                      }
                    `}
                  >

                    Save

                  </button>

                </div>

              </div>

            </div>

          </div>

          {/* =========================
              LEAF CROWN
          ========================= */}

          <div
            className="
              absolute

              top-[15px]
              left-1/2

              -translate-x-1/2

              z-30

              w-[122px]
              h-[74px]

              pointer-events-none
            "
          >

            <svg
              viewBox="0 0 130 78"
              className="
                w-full
                h-full

                overflow-visible

                drop-shadow-[0_3px_2px_rgba(35,64,56,0.08)]
              "
              xmlns="http://www.w3.org/2000/svg"
            >


              <path
                d="M66 6 C70 17 68 27 64 36"
                fill="none"
                stroke={isWorkMode ? "#3f795f" : "#255e48"}
                strokeWidth="6"
                strokeLinecap="round"
                style={{ transition: "stroke 700ms ease" }}
              />

              <path
                d="M65 36 C56 20 44 14 33 18 C42 26 48 37 50 50 C56 44 61 39 65 36Z"
                fill={isWorkMode ? "#69aa86" : "#477f66"}
                style={{ transition: "fill 700ms ease" }}
              />

              <path
                d="M65 36 C74 20 86 14 97 18 C88 26 82 37 80 50 C74 44 69 39 65 36Z"
                fill={isWorkMode ? "#69aa86" : "#477f66"}
                style={{ transition: "fill 700ms ease" }}
              />

              <path
                d="M63 38 C47 29 31 31 20 42 C36 42 49 49 58 61 C58 51 60 43 63 38Z"
                fill={isWorkMode ? "#4a8b6d" : "#2f6e54"}
                style={{ transition: "fill 700ms ease" }}
              />

              <path
                d="M67 38 C83 29 99 31 110 42 C94 42 81 49 72 61 C72 51 70 43 67 38Z"
                fill={isWorkMode ? "#4a8b6d" : "#2f6e54"}
                style={{ transition: "fill 700ms ease" }}
              />

              <path
                d="M65 34 C57 45 55 58 59 70 C62 66 64 67 65 74 C66 67 68 66 71 70 C75 58 73 45 65 34Z"
                fill={isWorkMode ? "#3f795f" : "#255e48"}
                style={{ transition: "fill 700ms ease" }}
              />

            </svg>

          </div>

        </div>


        {/* =========================
            START / SKIP
        ========================= */}

        <div
          className="
            relative
            z-10
            flex
            flex-col
            items-center

            top-3
            gap-3

            mt-8
          "
        >


          {/* START / PAUSE */}

          <button
            onClick={handleStartPause}
            className={`
              bg-white

              font-bold
              text-xl

              px-10
              py-3

              rounded-full

              shadow-lg

              hover:scale-105

              active:scale-95

              transition-all
              duration-200

              w-44

              ${
                isWorkMode
                  ? "text-[#f86557]"
                  : "text-[#4a8b6d]"
              }
            `}
          >

            {isActive
              ? "Pause"
              : "Start"}

          </button>


          {/* SKIP */}

          <button
            onClick={() => {

              handleSkip();

            }}
            className={`
              bg-white/90

              font-bold
              text-xl

              px-10
              py-3

              rounded-full

              shadow-md

              hover:bg-white

              hover:scale-105

              active:scale-95

              transition-all
              duration-200

              w-44

              ${
                isWorkMode
                  ? "text-[#f86557]"
                  : "text-[#4a8b6d]"
              }
            `}
          >

            Skip

          </button>

        </div>

      </section>



      {/* =====================================================
          SECTION 2 — ABOUT
      ===================================================== */}

      <section
        className="
          min-h-screen
          w-full

          bg-[#fffdf9]

          px-6
          py-24
        "
      >

        <div
          className="
            w-full
            max-w-5xl
            mx-auto
          "
        >


          {/* =========================
              ABOUT INTRO
          ========================= */}

          <div
            id="about"
            className="
              max-w-2xl

              mb-16

              scroll-mt-8
            "
          >

            <p
              className="
                text-sm

                font-bold
                uppercase

                tracking-[0.2em]

                text-[#e4573f]

                mb-3
              "
            >

              The technique

            </p>


            <h2
              className="
                text-4xl
                md:text-5xl

                font-black

                tracking-tight

                text-stone-900

                mb-6
              "
            >

              What is Pomodoro?

            </h2>


            <p
              className="
                text-lg
                md:text-xl

                leading-8

                text-stone-600
              "
            >

              The Pomodoro Technique is a simple
              time-management method designed to
              help you stay focused without
              working for long, exhausting
              periods.

            </p>

          </div>


          {/* =========================
              THREE STEPS
          ========================= */}

          <div
            className="
              grid
              grid-cols-1
              md:grid-cols-3

              gap-6
            "
          >


            {/* FOCUS */}

            <article
              className="
                border-t
                border-stone-300

                pt-6
              "
            >

              <span
                className="
                  text-sm

                  font-bold

                  text-[#e4573f]
                "
              >

                01

              </span>


              <h3
                className="
                  text-2xl

                  font-bold

                  text-stone-900

                  mt-4
                  mb-3
                "
              >

                Focus

              </h3>


              <p
                className="
                  text-stone-600

                  leading-7
                "
              >

                Start with 25 minutes of focused
                work, or choose a custom duration
                that fits your task.

              </p>

            </article>


            {/* BREAK */}

            <article
              className="
                border-t
                border-stone-300

                pt-6
              "
            >

              <span
                className="
                  text-sm

                  font-bold

                  text-emerald-600
                "
              >

                02

              </span>


              <h3
                className="
                  text-2xl

                  font-bold

                  text-stone-900

                  mt-4
                  mb-3
                "
              >

                Break

              </h3>


              <p
                className="
                  text-stone-600

                  leading-7
                "
              >

                A standard 25-minute focus session
                uses a 5-minute break. Custom work
                durations automatically adjust the
                short break, and you can still
                change it manually.

              </p>

            </article>


            {/* REPEAT */}

            <article
              className="
                border-t
                border-stone-300

                pt-6
              "
            >

              <span
                className="
                  text-sm

                  font-bold

                  text-stone-500
                "
              >

                03

              </span>


              <h3
                className="
                  text-2xl

                  font-bold

                  text-stone-900

                  mt-4
                  mb-3
                "
              >

                Repeat

              </h3>


              <p
                className="
                  text-stone-600

                  leading-7
                "
              >

                Complete four focus sessions.
                After the fourth session, the
                normal short break is replaced
                with a longer recovery break.

              </p>

            </article>

          </div>


          {/* =========================
              25 / 5 / 15
          ========================= */}

          <div
            className="
              mt-20

              border-y
              border-stone-200

              py-10

              grid
              grid-cols-1
              md:grid-cols-3

              gap-10
            "
          >


            {/* WORK */}

            <div>

              <p
                className="
                  text-6xl

                  font-black

                  tracking-tight

                  text-[#e4573f]
                "
              >

                25

              </p>


              <p
                className="
                  mt-1

                  text-sm

                  font-semibold
                  uppercase

                  tracking-[0.16em]

                  text-stone-500
                "
              >

                minutes of focus

              </p>

            </div>


            {/* SHORT BREAK */}

            <div>

              <p
                className="
                  text-6xl

                  font-black

                  tracking-tight

                  text-emerald-600
                "
              >

                5

              </p>


              <p
                className="
                  mt-1

                  text-sm

                  font-semibold
                  uppercase

                  tracking-[0.16em]

                  text-stone-500
                "
              >

                short break

              </p>

            </div>


            {/* LONG BREAK */}

            <div>

              <p
                className="
                  text-6xl

                  font-black

                  tracking-tight

                  text-emerald-800
                "
              >

                15

              </p>


              <p
                className="
                  mt-1

                  text-sm

                  font-semibold
                  uppercase

                  tracking-[0.16em]

                  text-stone-500
                "
              >

                after 4 sessions

              </p>

            </div>

          </div>


          {/* =========================
              FOOTER
          ========================= */}

          <footer
            className="
              mt-20
              pt-8

              border-t
              border-stone-200

              flex
              flex-col
              sm:flex-row

              items-center
              justify-between

              gap-4
            "
          >


            <p
              className="
                text-sm

                text-stone-500
              "
            >

              © {new Date().getFullYear()}{" "}
              Jojo Moustak · Pomodoro

            </p>


            <div
              className="
                flex
                items-center
                gap-5
              "
            >


              {/* INSTAGRAM */}

              <a
                href="https://www.instagram.com/jojomoustak/"
                onClick={playSound}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Instagram"
                className="
                  text-stone-500

                  hover:text-[#e4573f]
                  hover:scale-110

                  transition-all
                  duration-200
                "
              >

                <FaInstagram size={23} />

              </a>


              {/* GITHUB */}

              <a
                href="https://github.com/jojomoustak"
                onClick={playSound}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="GitHub"
                className="
                  text-stone-500

                  hover:text-stone-900
                  hover:scale-110

                  transition-all
                  duration-200
                "
              >

                <FaGithub size={23} />

              </a>

            </div>

          </footer>

        </div>

      </section>

      <>
  {isAdvancedOpen && (
    <div
      className={`
        fixed inset-0 z-[1000] grid place-items-center
        bg-[#173c32]/25 p-4 backdrop-blur-md
        transition-opacity duration-300 ease-out
        max-[430px]:items-end max-[430px]:justify-items-stretch
        max-[430px]:p-0

        ${isAdvancedVisible ? "opacity-100" : "opacity-0"}
      `}
      onPointerDown={(event) => {
        if (event.currentTarget === event.target) {
          playSound();
          closeAdvancedTools();
        }
      }}
    >
      <section
        data-theme={features.settings.theme}
        className={`
          group/tools grid w-full max-w-[720px]
          max-h-[calc(100dvh-32px)]
          grid-rows-[auto_auto_minmax(0,1fr)]
          overflow-hidden rounded-[32px]
          border border-[var(--tools-border)]
          bg-[var(--tools-page)] text-[var(--tools-text)]
          shadow-[0_28px_80px_rgba(23,60,50,0.18)]
          backdrop-blur-xl
          transition-all duration-[360ms]
          ease-[cubic-bezier(0.22,1,0.36,1)]
          motion-reduce:transition-none

          [--tools-page:rgba(255,250,247,0.92)]
          [--tools-surface:rgba(255,255,255,0.72)]
          [--tools-soft:rgba(255,224,220,0.62)]
          [--tools-accent-soft:rgba(255,107,94,0.09)]
          [--tools-text:#264139]
          [--tools-muted:#667871]
          [--tools-line:rgba(38,65,57,0.09)]
          [--tools-border:rgba(255,255,255,0.76)]
          [--tools-control-border:rgba(255,107,94,0.18)]
          [--tools-coral:#ff6b5e]
          [--tools-green:#4b8b6d]
          [--tools-toggle-off:#dce5e1]

          data-[theme=dark]:[--tools-page:rgba(24,34,31,0.94)]
          data-[theme=dark]:[--tools-surface:rgba(255,255,255,0.055)]
          data-[theme=dark]:[--tools-soft:rgba(255,255,255,0.07)]
          data-[theme=dark]:[--tools-accent-soft:rgba(255,107,94,0.12)]
          data-[theme=dark]:[--tools-text:#f3f8f5]
          data-[theme=dark]:[--tools-muted:#aab9b3]
          data-[theme=dark]:[--tools-line:rgba(237,248,242,0.1)]
          data-[theme=dark]:[--tools-border:rgba(255,255,255,0.11)]
          data-[theme=dark]:[--tools-control-border:rgba(255,255,255,0.13)]
          data-[theme=dark]:[--tools-toggle-off:#53615c]

          data-[theme=amoled]:[--tools-page:rgba(0,0,0,0.96)]
          data-[theme=amoled]:[--tools-surface:rgba(255,255,255,0.055)]
          data-[theme=amoled]:[--tools-soft:rgba(255,255,255,0.07)]
          data-[theme=amoled]:[--tools-accent-soft:rgba(255,107,94,0.13)]
          data-[theme=amoled]:[--tools-text:#f7f7f7]
          data-[theme=amoled]:[--tools-muted:#a6a6a6]
          data-[theme=amoled]:[--tools-line:rgba(255,255,255,0.1)]
          data-[theme=amoled]:[--tools-border:rgba(255,255,255,0.12)]
          data-[theme=amoled]:[--tools-control-border:rgba(255,255,255,0.14)]
          data-[theme=amoled]:[--tools-toggle-off:#333333]

          max-[700px]:max-h-[calc(100dvh-16px)]
          max-[700px]:rounded-[28px]

          max-[430px]:h-[92dvh]
          max-[430px]:max-h-[92dvh]
          max-[430px]:max-w-none
          max-[430px]:rounded-b-none
          max-[430px]:rounded-t-[32px]
          max-[430px]:border-x-0
          max-[430px]:border-b-0

          ${
            isAdvancedVisible
              ? "translate-y-0 scale-100 opacity-100"
              : "translate-y-3 scale-[0.98] opacity-0 max-[430px]:translate-y-10"
          }
        `}
        role="dialog"
        aria-modal="true"
        aria-labelledby="pomodoro-tools-title"
        onClickCapture={(event) => {
          if (!(event.target instanceof Element)) return;

          const control = event.target.closest(
            "button, a, select, input[type='checkbox'], input[type='range']"
          );

          if (control) playSound();
        }}
      >
        <header
          className="
            relative flex min-h-[82px] items-center justify-between
            gap-5 px-7 pb-3 pt-5

            before:absolute before:left-1/2 before:top-2
            before:hidden before:h-1 before:w-10
            before:-translate-x-1/2 before:rounded-full
            before:bg-[var(--tools-line)] before:content-['']

            max-[430px]:before:block
            max-[700px]:min-h-[76px]
            max-[700px]:px-4
            max-[700px]:pb-2.5
            max-[700px]:pt-5
          "
        >
          <div className="flex items-center gap-3">
            <PrivacyTomatoMark />

            <div>
              <p
                className="
                  mb-0.5 text-[0.62rem] font-extrabold
                  uppercase tracking-[0.13em]
                  text-[var(--tools-coral)]
                "
              >
                Pomodoro
              </p>

              <h2
                id="pomodoro-tools-title"
                className="
                  text-[clamp(1.2rem,4vw,1.55rem)]
                  font-black leading-none tracking-[-0.035em]
                  text-[var(--tools-text)]
                "
              >
                Focus tools
              </h2>
            </div>
          </div>

          <button
            type="button"
            onClick={closeAdvancedTools}
            aria-label="Close tools"
            className="
              grid h-10 w-10 shrink-0 place-items-center
              rounded-full border border-[var(--tools-control-border)]
              bg-[var(--tools-surface)]
              text-[var(--tools-muted)]
              shadow-sm
              transition-all duration-200
              hover:bg-[var(--tools-accent-soft)]
              hover:text-[var(--tools-coral)]
              active:scale-95
              focus-visible:outline-none
              focus-visible:ring-4
              focus-visible:ring-[#ff6b5e]/25
            "
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              className="h-4 w-4"
            >
              <path d="m6 6 8 8M14 6l-8 8" />
            </svg>
          </button>
        </header>

        <nav
          className="
            mx-7 grid grid-cols-2 gap-1
            rounded-[18px] border border-[var(--tools-line)]
            bg-[var(--tools-surface)] p-1 shadow-sm
            max-[700px]:mx-4
          "
          aria-label="Optional tools"
        >
          {(
            [
              ["history", "History"],
              ["settings", "Settings"],
            ] as const
          ).map(([panel, label]) => {
            const isSelected = advancedPanel === panel;

            return (
              <button
                type="button"
                key={panel}
                aria-current={isSelected ? "page" : undefined}
                onClick={() => setAdvancedPanel(panel)}
                className={`
                  flex min-h-10 items-center justify-center gap-2
                  rounded-[14px] border
                  text-[0.76rem] font-extrabold
                  transition-all duration-200
                  active:scale-95
                  focus-visible:outline-none
                  focus-visible:ring-4
                  focus-visible:ring-[#ff6b5e]/25

                  ${
                    isSelected
                      ? "border-[var(--tools-control-border)] bg-[var(--tools-soft)] text-[var(--tools-text)] shadow-sm"
                      : "border-transparent bg-transparent text-[var(--tools-muted)] hover:bg-[var(--tools-accent-soft)] hover:text-[var(--tools-text)]"
                  }
                `}
              >
                <span
                  aria-hidden="true"
                  className={`
                    h-1.5 w-1.5 rounded-full transition-colors duration-200
                    ${isSelected ? "bg-[var(--tools-coral)]" : "bg-[var(--tools-line)]"}
                  `}
                />
                {label}
              </button>
            );
          })}
        </nav>

        <div
          className="
            min-h-0 overflow-y-auto overscroll-contain
            px-7 pb-7 pt-5
            [scrollbar-color:var(--tools-control-border)_transparent]
            [scrollbar-width:thin]
            max-[700px]:px-4
            max-[700px]:pb-[calc(24px+env(safe-area-inset-bottom))]
            max-[700px]:pt-4
          "
        >
          {advancedPanel === "history" && (
            <div className="grid gap-4">
              <label
                className="
                  grid grid-cols-[auto_minmax(0,1fr)]
                  items-center gap-4
                  rounded-[22px]
                  border border-[var(--tools-control-border)]
                  bg-[var(--tools-surface)]
                  px-4 py-3 shadow-sm
                  max-[430px]:grid-cols-1
                  max-[430px]:gap-1
                "
              >
                <span
                  className="
                    text-[0.68rem] font-extrabold
                    uppercase tracking-[0.1em]
                    text-[var(--tools-coral)]
                  "
                >
                  Current focus
                </span>

                <input
                  type="text"
                  maxLength={80}
                  value={features.currentTask}
                  placeholder="What are you working on?"
                  onChange={(event) =>
                    setFeatures((current) => ({
                      ...current,
                      currentTask: event.target.value.slice(0, 80),
                    }))
                  }
                  className="
                    w-full min-w-0
                    border-0 border-b border-[var(--tools-line)]
                    bg-transparent px-0.5 py-2
                    font-bold text-[var(--tools-text)]
                    outline-none
                    placeholder:text-[var(--tools-muted)]
                    focus:border-[var(--tools-coral)]
                  "
                />
              </label>

              <div
                className="
                  flex items-center justify-between gap-[18px]
                  max-[700px]:items-start
                  max-[700px]:flex-col
                "
              >
                <div>
                  <h3
                    className="
                      text-[1.05rem] font-black
                      tracking-[-0.015em]
                      text-[var(--tools-text)]
                    "
                  >
                    Focus history
                  </h3>

                  <span
                    className="
                      mt-1 block text-[0.7rem]
                      text-[var(--tools-muted)]
                    "
                  >
                    Stored locally on this device.
                  </span>
                </div>

              </div>

              <div
                className="
                  grid grid-cols-3 gap-2
                "
                aria-label="Focus totals"
              >
                <p
                  className="
                    rounded-2xl border border-[var(--tools-line)]
                    bg-[var(--tools-surface)] px-2 py-3 text-center
                    shadow-sm
                  "
                >
                  <strong
                    className="
                      block text-[clamp(0.95rem,3vw,1.2rem)] font-black
                      tracking-[-0.03em]
                      text-[var(--tools-green)]
                      group-data-[theme=dark]/tools:text-[var(--tools-text)]
                      group-data-[theme=amoled]/tools:text-[var(--tools-text)]
                    "
                  >
                    {todayFocusMinutes} min
                  </strong>

                  <span
                    className="
                      mt-1 block text-[0.66rem]
                      font-extrabold uppercase tracking-[0.08em]
                      text-[var(--tools-muted)]
                    "
                  >
                    Today
                  </span>
                </p>

                <p
                  className="
                    rounded-2xl border border-[var(--tools-line)]
                    bg-[var(--tools-surface)] px-2 py-3 text-center
                    shadow-sm
                  "
                >
                  <strong
                    className="
                      block text-[clamp(0.95rem,3vw,1.2rem)] font-black
                      tracking-[-0.03em]
                      text-[var(--tools-green)]
                      group-data-[theme=dark]/tools:text-[var(--tools-text)]
                      group-data-[theme=amoled]/tools:text-[var(--tools-text)]
                    "
                  >
                    {totalFocusHours}h {remainingFocusMinutes}m
                  </strong>

                  <span
                    className="
                      mt-1 block text-[0.66rem]
                      font-extrabold uppercase tracking-[0.08em]
                      text-[var(--tools-muted)]
                    "
                  >
                    Total
                  </span>
                </p>

                <p
                  className="
                    rounded-2xl border border-[var(--tools-line)]
                    bg-[var(--tools-surface)] px-2 py-3 text-center
                    shadow-sm
                  "
                >
                  <strong
                    className="
                      block text-[clamp(0.95rem,3vw,1.2rem)] font-black
                      tracking-[-0.03em]
                      text-[var(--tools-green)]
                      group-data-[theme=dark]/tools:text-[var(--tools-text)]
                      group-data-[theme=amoled]/tools:text-[var(--tools-text)]
                    "
                  >
                    {features.history.length}
                  </strong>

                  <span
                    className="
                      mt-1 block text-[0.66rem]
                      font-extrabold uppercase tracking-[0.08em]
                      text-[var(--tools-muted)]
                    "
                  >
                    Sessions
                  </span>
                </p>
              </div>

              <section
                className="
                  rounded-[24px] border
                  border-[var(--tools-control-border)]
                  bg-[var(--tools-surface)] p-4
                  shadow-sm
                "
                aria-labelledby="weekly-focus-title"
              >
                <div className="flex items-end justify-between gap-4">
                  <div>
                    <p
                      className="
                        text-[0.66rem] font-extrabold
                        uppercase tracking-[0.1em]
                        text-[var(--tools-coral)]
                      "
                    >
                      Last 7 days
                    </p>

                    <h3
                      id="weekly-focus-title"
                      className="mt-1 font-bold text-[var(--tools-text)]"
                    >
                      Focus graph
                    </h3>
                  </div>

                  <strong className="text-sm text-[var(--tools-green)]">
                    {weeklyFocusMinutes} min
                  </strong>
                </div>

                <div
                  className="mt-4 grid h-32 grid-cols-7 gap-2"
                  role="img"
                  aria-label={`Focus during the last seven days: ${weeklyFocusMinutes} minutes`}
                >
                  {weeklyFocusDays.map((day) => (
                    <div
                      key={day.key}
                      className="grid min-w-0 grid-rows-[1fr_auto_auto] gap-1.5"
                      aria-label={`${day.label}: ${day.minutes} minutes`}
                    >
                      <div className="flex min-h-0 items-end justify-center">
                        <div
                          className={`
                            w-full max-w-8 rounded-full
                            transition-all duration-500 ease-out
                            ${
                              day.isToday
                                ? "bg-[var(--tools-coral)]"
                                : "bg-[var(--tools-green)]/75"
                            }
                          `}
                          style={{
                            height: `${Math.max(
                              7,
                              Math.round((day.minutes / weeklyMaxMinutes) * 100)
                            )}%`,
                          }}
                        />
                      </div>

                      <strong
                        className="truncate text-center text-[0.62rem] text-[var(--tools-text)]"
                      >
                        {day.minutes}
                      </strong>

                      <span
                        className={`
                          truncate text-center text-[0.62rem] font-bold
                          ${
                            day.isToday
                              ? "text-[var(--tools-coral)]"
                              : "text-[var(--tools-muted)]"
                          }
                        `}
                      >
                        {day.label}
                      </span>
                    </div>
                  ))}
                </div>
              </section>

              <section
                className="
                  rounded-[24px] border
                  border-[var(--tools-control-border)]
                  bg-[var(--tools-surface)] p-4
                  shadow-sm
                "
                aria-labelledby="focus-calendar-title"
              >
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p
                      className="
                        text-[0.66rem] font-extrabold
                        uppercase tracking-[0.1em]
                        text-[var(--tools-coral)]
                      "
                    >
                      Activity
                    </p>

                    <h3
                      id="focus-calendar-title"
                      className="mt-1 font-bold text-[var(--tools-text)]"
                    >
                      {focusCalendar.monthLabel}
                    </h3>
                  </div>

                  <div
                    className="flex items-center gap-1.5 text-[0.62rem] text-[var(--tools-muted)]"
                    aria-label="Calendar intensity from less focus to more focus"
                  >
                    <span>Less</span>
                    <i
                      aria-hidden="true"
                      className="h-2.5 w-2.5 rounded-[4px] bg-[#ff6b5e]/15"
                    />
                    <i
                      aria-hidden="true"
                      className="h-2.5 w-2.5 rounded-[4px] bg-[#ff6b5e]/45"
                    />
                    <i
                      aria-hidden="true"
                      className="h-2.5 w-2.5 rounded-[4px] bg-[#ff6b5e]"
                    />
                    <span>More</span>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-7 gap-1.5">
                  {CALENDAR_WEEKDAYS.map((weekday, index) => (
                    <span
                      key={`${weekday}-${index}`}
                      className="pb-1 text-center text-[0.6rem] font-extrabold text-[var(--tools-muted)]"
                    >
                      {weekday}
                    </span>
                  ))}

                  {focusCalendar.days.map((day, index) =>
                    day === null ? (
                      <span key={`empty-${index}`} aria-hidden="true" />
                    ) : (
                      <div
                        key={day.key}
                        title={`${day.minutes} focused minutes`}
                        aria-label={`${day.day}: ${day.minutes} focused minutes`}
                        className={`
                          grid aspect-square place-items-center
                          rounded-[9px] border text-[0.68rem] font-bold
                          transition-all duration-200

                          ${
                            day.intensity === 0
                              ? "border-[var(--tools-line)] bg-[var(--tools-surface)] text-[var(--tools-muted)]"
                              : day.intensity === 1
                                ? "border-[#ff6b5e]/15 bg-[#ff6b5e]/15 text-[var(--tools-text)]"
                                : day.intensity === 2
                                  ? "border-[#ff6b5e]/25 bg-[#ff6b5e]/30 text-[var(--tools-text)]"
                                  : day.intensity === 3
                                    ? "border-[#ff6b5e]/35 bg-[#ff6b5e]/55 text-[#173c32]"
                                    : "border-[#ff6b5e] bg-[#ff6b5e] text-white"
                          }

                          ${
                            day.isToday
                              ? "ring-2 ring-[var(--tools-green)] ring-offset-2 ring-offset-transparent"
                              : ""
                          }
                        `}
                      >
                        {day.day}
                      </div>
                    )
                  )}
                </div>
              </section>

              {features.history.length === 0 ? (
                <div
                  className="
                    flex min-h-[160px] flex-col
                    items-center justify-center
                    rounded-[24px] border border-dashed
                    border-[var(--tools-control-border)]
                    bg-[var(--tools-surface)]
                    px-5 py-7 text-center
                  "
                >
                  <span
                    aria-hidden="true"
                    className="
                      mb-3 h-[20px] w-[22px]
                      rounded-[46%_46%_50%_50%]
                      border-2 border-[var(--tools-coral)]
                      opacity-70
                    "
                  />

                  <h3
                    className="
                      text-[1.03rem] font-bold
                      text-[var(--tools-text)]
                    "
                  >
                    No completed sessions yet
                  </h3>

                  <p
                    className="
                      mt-1 text-[0.72rem]
                      text-[var(--tools-muted)]
                    "
                  >
                    Finish one work session and it will appear here.
                  </p>
                </div>
              ) : (
                <div
                  className="
                    overflow-hidden rounded-[24px]
                    border border-[var(--tools-line)]
                    bg-[var(--tools-surface)]
                    shadow-sm
                  "
                >
                  {features.history.slice(0, 150).map((session) => (
                    <article
                      key={session.id}
                      className="
                        grid grid-cols-[minmax(0,1fr)_auto]
                        items-center gap-4
                        border-b border-[var(--tools-line)]
                        px-4 py-3.5 last:border-b-0
                      "
                    >
                      <div>
                        <h3
                          className="
                            text-[1.03rem] font-bold
                            text-[var(--tools-text)]
                          "
                        >
                          {session.task || "Focus session"}
                        </h3>

                        <p
                          className="
                            mt-1 text-[0.72rem]
                            text-[var(--tools-muted)]
                          "
                        >
                          {new Intl.DateTimeFormat(undefined, {
                            dateStyle: "medium",
                            timeStyle: "short",
                          }).format(new Date(session.completedAt))}
                        </p>
                      </div>

                      <strong
                        className="
                          whitespace-nowrap text-[0.78rem]
                          font-extrabold text-[var(--tools-coral)]
                        "
                      >
                        {Math.round(session.durationSeconds / 60)} min
                      </strong>
                    </article>
                  ))}
                </div>
              )}

              {features.history.length > 0 && (
                <div className="flex justify-end pt-1">
                  <button
                    type="button"
                    onClick={clearHistory}
                    className="
                      min-h-11 rounded-full
                      border border-[#e84f40]/25
                      bg-[var(--tools-surface)]
                      px-4 text-[0.75rem] font-extrabold text-[#e84f40]
                      shadow-sm
                      transition-all duration-200
                      hover:bg-[#e84f40]/10
                      active:scale-[0.97]
                      focus-visible:outline-none
                      focus-visible:ring-4
                      focus-visible:ring-[#e84f40]/20
                    "
                  >
                    Delete history
                  </button>
                </div>
              )}
            </div>
          )}

          {advancedPanel === "settings" && (
            <div className="mx-auto grid w-full max-w-[680px] gap-3">
              <article
                className="
                  rounded-[24px] border border-[var(--tools-line)]
                  bg-[var(--tools-surface)] px-4 py-4
                  shadow-sm
                "
              >
                <div className="mb-2">
                  <p
                    className="
                      mb-1 text-[0.68rem] font-extrabold
                      uppercase tracking-[0.13em]
                      text-[var(--tools-coral)]
                    "
                  >
                    Timer
                  </p>

                  <h3
                    className="
                      text-[1.03rem] font-black
                      text-[var(--tools-text)]
                    "
                  >
                    Session flow
                  </h3>
                </div>

                <label
                  className="
                    flex min-h-[62px] items-center
                    justify-between gap-4
                    -mx-2 rounded-2xl border-t border-[var(--tools-line)]
                    px-2 transition-colors hover:bg-[var(--tools-accent-soft)]
                  "
                >
                  <span className="flex flex-col gap-1">
                    <strong>Auto-start breaks</strong>

                    <small
                      className="
                        text-[0.68rem]
                        text-[var(--tools-muted)]
                      "
                    >
                      Start the next break automatically.
                    </small>
                  </span>

                  <input
                    type="checkbox"
                    checked={features.settings.autoStartBreaks}
                    onChange={(event) =>
                      updateFeatureSetting(
                        "autoStartBreaks",
                        event.target.checked
                      )
                    }
                    className="
                      relative h-[26px] w-[46px] shrink-0
                      cursor-pointer appearance-none
                      rounded-full
                      bg-[var(--tools-toggle-off)]
                      shadow-inner transition-all duration-200

                      after:absolute after:left-[3px] after:top-[3px]
                      after:h-5 after:w-5
                      after:rounded-full after:bg-white
                      after:shadow-sm after:transition-transform
                      after:content-['']

                      checked:bg-[var(--tools-green)]
                      checked:after:translate-x-5

                      focus-visible:outline-none
                      focus-visible:ring-4
                      focus-visible:ring-[#ff6b5e]/25
                    "
                  />
                </label>

                <label
                  className="
                    flex min-h-[62px] items-center
                    justify-between gap-4
                    -mx-2 rounded-2xl border-t border-[var(--tools-line)]
                    px-2 transition-colors hover:bg-[var(--tools-accent-soft)]
                  "
                >
                  <span className="flex flex-col gap-1">
                    <strong>Auto-start focus</strong>

                    <small
                      className="
                        text-[0.68rem]
                        text-[var(--tools-muted)]
                      "
                    >
                      Start work after a completed break.
                    </small>
                  </span>

                  <input
                    type="checkbox"
                    checked={features.settings.autoStartWork}
                    onChange={(event) =>
                      updateFeatureSetting(
                        "autoStartWork",
                        event.target.checked
                      )
                    }
                    className="
                      relative h-[26px] w-[46px] shrink-0
                      cursor-pointer appearance-none
                      rounded-full
                      bg-[var(--tools-toggle-off)]
                      shadow-inner transition-all duration-200

                      after:absolute after:left-[3px] after:top-[3px]
                      after:h-5 after:w-5
                      after:rounded-full after:bg-white
                      after:shadow-sm after:transition-transform
                      after:content-['']

                      checked:bg-[var(--tools-green)]
                      checked:after:translate-x-5

                      focus-visible:outline-none
                      focus-visible:ring-4
                      focus-visible:ring-[#ff6b5e]/25
                    "
                  />
                </label>
              </article>

              <article
                className="
                  rounded-[24px] border border-[var(--tools-line)]
                  bg-[var(--tools-surface)] px-4 py-4
                  shadow-sm
                "
              >
                <div className="mb-2">
                  <p
                    className="
                      mb-1 text-[0.68rem] font-extrabold
                      uppercase tracking-[0.13em]
                      text-[var(--tools-coral)]
                    "
                  >
                    Feedback
                  </p>

                  <h3
                    className="
                      text-[1.03rem] font-black
                      text-[var(--tools-text)]
                    "
                  >
                    Sound &amp; haptics
                  </h3>
                </div>

                <label
                  className="
                    flex min-h-[62px] items-center
                    justify-between gap-4
                    -mx-2 rounded-2xl border-t border-[var(--tools-line)]
                    px-2 transition-colors hover:bg-[var(--tools-accent-soft)]
                  "
                >
                  <span className="flex flex-col gap-1">
                    <strong>Interface sounds</strong>

                    <small
                      className="
                        text-[0.68rem]
                        text-[var(--tools-muted)]
                      "
                    >
                      Button and browser completion sounds.
                    </small>
                  </span>

                  <input
                    type="checkbox"
                    checked={features.settings.soundEnabled}
                    onChange={(event) =>
                      updateFeatureSetting(
                        "soundEnabled",
                        event.target.checked
                      )
                    }
                    className="
                      relative h-[26px] w-[46px] shrink-0
                      cursor-pointer appearance-none
                      rounded-full
                      bg-[var(--tools-toggle-off)]
                      shadow-inner transition-all duration-200

                      after:absolute after:left-[3px] after:top-[3px]
                      after:h-5 after:w-5
                      after:rounded-full after:bg-white
                      after:shadow-sm after:transition-transform
                      after:content-['']

                      checked:bg-[var(--tools-green)]
                      checked:after:translate-x-5

                      focus-visible:outline-none
                      focus-visible:ring-4
                      focus-visible:ring-[#ff6b5e]/25
                    "
                  />
                </label>

                <label
                  className="
                    flex min-h-[62px] items-center
                    justify-between gap-4
                    -mx-2 rounded-2xl border-t border-[var(--tools-line)]
                    px-2 transition-colors hover:bg-[var(--tools-accent-soft)]
                  "
                >
                  <span className="flex flex-col gap-1">
                    <strong>Haptics</strong>

                    <small
                      className="
                        text-[0.68rem]
                        text-[var(--tools-muted)]
                      "
                    >
                      Vibration on supported devices.
                    </small>
                  </span>

                  <input
                    type="checkbox"
                    checked={features.settings.hapticsEnabled}
                    onChange={(event) =>
                      updateFeatureSetting(
                        "hapticsEnabled",
                        event.target.checked
                      )
                    }
                    className="
                      relative h-[26px] w-[46px] shrink-0
                      cursor-pointer appearance-none
                      rounded-full
                      bg-[var(--tools-toggle-off)]
                      shadow-inner transition-all duration-200

                      after:absolute after:left-[3px] after:top-[3px]
                      after:h-5 after:w-5
                      after:rounded-full after:bg-white
                      after:shadow-sm after:transition-transform
                      after:content-['']

                      checked:bg-[var(--tools-green)]
                      checked:after:translate-x-5

                      focus-visible:outline-none
                      focus-visible:ring-4
                      focus-visible:ring-[#ff6b5e]/25
                    "
                  />
                </label>

                <label
                  className="
                    flex min-h-[62px] flex-col
                    items-start justify-center gap-2
                    -mx-2 rounded-2xl border-t border-[var(--tools-line)]
                    px-2 py-3 transition-colors hover:bg-[var(--tools-accent-soft)]
                  "
                >
                  <span>Web volume</span>

                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={features.settings.webVolume}
                    onChange={(event) =>
                      updateFeatureSetting(
                        "webVolume",
                        Number(event.target.value)
                      )
                    }
                    className="
                      w-full accent-[var(--tools-coral)]
                      focus-visible:outline-none
                      focus-visible:ring-4
                      focus-visible:ring-[#ff6b5e]/25
                    "
                  />
                </label>

                {isNativeAndroidPomodoro() && (
                  <button
                    type="button"
                    onClick={openNativeSoundSettings}
                    className="
                      mt-3 min-h-11 w-full rounded-full
                      border border-[var(--tools-control-border)]
                      bg-[var(--tools-surface)]
                      px-3.5 font-extrabold
                      text-[var(--tools-coral)]
                      shadow-sm
                      transition-all duration-200
                      hover:bg-[var(--tools-accent-soft)]
                      active:scale-[0.98]
                      focus-visible:outline-none
                      focus-visible:ring-4
                      focus-visible:ring-[#ff6b5e]/25
                    "
                  >
                    Android notifications &amp; sound
                  </button>
                )}
              </article>

              <article
                className="
                  rounded-[24px] border border-[var(--tools-line)]
                  bg-[var(--tools-surface)] px-4 py-4
                  shadow-sm
                "
              >
                <div className="mb-2">
                  <p
                    className="
                      mb-1 text-[0.68rem] font-extrabold
                      uppercase tracking-[0.13em]
                      text-[var(--tools-coral)]
                    "
                  >
                    Appearance
                  </p>

                  <h3
                    className="
                      text-[1.03rem] font-black
                      text-[var(--tools-text)]
                    "
                  >
                    Color theme
                  </h3>

                </div>

                  <label
                    className="
                      flex min-h-[72px] items-center
                      justify-between gap-4
                      -mx-2 rounded-2xl border-t border-[var(--tools-line)]
                      px-2 transition-colors hover:bg-[var(--tools-accent-soft)]
                    "
                  >
                    <span className="font-bold text-[var(--tools-text)]">
                      Theme
                    </span>

                    <ThemeSelector
                      value={features.settings.theme}
                      onChange={(theme) =>
                        updateFeatureSetting("theme", theme)
                      }
                    />
                </label>
              </article>

              <footer
                className="
                  flex items-center justify-between gap-[18px]
                  px-1 pb-1 pt-2
                  max-[700px]:items-start
                  max-[700px]:flex-col
                "
              >
                <div>
                  <strong className="text-[0.78rem]">Pomodoro v1.1.0</strong>

                  <p
                    className="
                      mt-0.5 text-[0.68rem]
                      text-[var(--tools-muted)]
                    "
                  >
                    Made by Jojo Moustak.
                  </p>
                </div>

                <a
                  href={getPublicAssetUrl("privacy.html")}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="
                    text-[0.78rem] font-extrabold
                    text-[var(--tools-coral)]
                  "
                >
                  Privacy
                </a>
              </footer>
            </div>
          )}
        </div>
      </section>
    </div>
  )}

  {toast && (
    <div
      className="
        fixed bottom-[calc(18px+env(safe-area-inset-bottom))]
        right-[18px] z-[1200]
        max-w-[min(360px,calc(100%-36px))]
        rounded-full bg-[#327d59]
        px-[18px] py-3
        text-[0.8rem] font-extrabold text-white
        shadow-[0_12px_30px_rgba(23,60,50,0.22)]
      "
      role="status"
    >
      {toast}
    </div>
  )}
</>
    </main>

  );

}
