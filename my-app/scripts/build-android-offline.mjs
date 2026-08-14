import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectDirectory = path.resolve(scriptDirectory, "..");
const nextCli = path.join(
  projectDirectory,
  "node_modules",
  "next",
  "dist",
  "bin",
  "next"
);

const result = spawnSync(process.execPath, [nextCli, "build"], {
  cwd: projectDirectory,
  stdio: "inherit",
  env: {
    ...process.env,
    ANDROID_OFFLINE_BUILD: "true",
    NEXT_PUBLIC_ANDROID_OFFLINE_BUILD: "true",
  },
});

if (result.error) {
  console.error("Could not start the Android offline build:", result.error);
  process.exit(1);
}

process.exit(result.status ?? 1);
