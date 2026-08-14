# Pomodoro v1.1.0

Next.js Pomodoro timer with the original large-tomato interface, offline web
support and an Android standalone build.

## Optional features

The default timer screen is unchanged. Open the pencil editor and select
**Tools** to access:

- a current-focus label, completed-session history and total focus time;
- built-in quick presets inside the timer editor plus fully custom durations;
- optional automatic session flow;
- interface sound, haptics and web volume settings;
- JSON backup/import and CSV export;
- optional Dark and AMOLED themes.

History and Settings use a cute, restrained interface with a warm cream,
coral and sage palette. There is no dashboard or gamification. All task,
preset, history and preference data is stored locally. The project contains
no advertising or analytics code.

## Development

```bash
pnpm install
pnpm dev
```

Create the normal production web build:

```bash
pnpm build
```

Create the self-contained Android WebView bundle with compiled Tailwind CSS
embedded directly inside `index.html`:

```bash
pnpm run build:android-offline
```

The Android bundle is written to `out/`. Copy its contents to
`app/src/main/assets/web/` in the Android project before producing a release.
