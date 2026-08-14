import { createRequire } from "node:module";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const require = createRequire(import.meta.url);
const webpack = require("next/dist/compiled/webpack/webpack").webpack;
const postcss = require("postcss");
const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, "..");
const temporaryRoot = path.join(projectRoot, ".android-standalone");
const outputRoot = path.join(projectRoot, "out");

const transpile = async (sourcePath, destinationPath) => {
  const source = await fs.readFile(sourcePath, "utf8");
  const result = ts.transpileModule(source, {
    fileName: sourcePath,
    reportDiagnostics: true,
    compilerOptions: {
      target: ts.ScriptTarget.ES2020,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
      isolatedModules: true,
      removeComments: true,
      sourceMap: false,
    },
  });

  const errors = (result.diagnostics ?? []).filter(
    (diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error
  );
  if (errors.length > 0) {
    throw new Error(
      ts.formatDiagnosticsWithColorAndContext(errors, {
        getCanonicalFileName: (fileName) => fileName,
        getCurrentDirectory: () => projectRoot,
        getNewLine: () => "\n",
      })
    );
  }

  await fs.mkdir(path.dirname(destinationPath), { recursive: true });
  await fs.writeFile(destinationPath, result.outputText, "utf8");
};

const runWebpack = () =>
  new Promise((resolve, reject) => {
    webpack(
      {
        mode: "production",
        target: ["web", "es2020"],
        entry: path.join(temporaryRoot, "entry.js"),
        output: {
          path: outputRoot,
          filename: "bundle.js",
          publicPath: "./",
          clean: false,
        },
        resolve: {
          extensions: [".js"],
          modules: [path.join(projectRoot, "node_modules"), "node_modules"],
        },
        optimization: {
          minimize: false,
          runtimeChunk: false,
          splitChunks: false,
        },
        performance: { hints: false },
        plugins: [
          new webpack.DefinePlugin({
            "process.env.NODE_ENV": JSON.stringify("production"),
            "process.env.NEXT_PUBLIC_ANDROID_OFFLINE_BUILD":
              JSON.stringify("true"),
          }),
        ],
      },
      (error, stats) => {
        if (error) {
          reject(error);
          return;
        }

        if (stats?.hasErrors()) {
          reject(
            new Error(
              stats.toString({ colors: true, all: false, errors: true })
            )
          );
          return;
        }

        resolve(stats);
      }
    );
  });

const compileCss = async () => {
  const cssPath = path.join(projectRoot, "app", "globals.css");
  const source = await fs.readFile(cssPath, "utf8");
  try {
    const tailwindPostcss = require("@tailwindcss/postcss");
    const result = await postcss([tailwindPostcss()]).process(source, {
      from: cssPath,
      to: path.join(outputRoot, "inline.css"),
    });
    return result.css.replaceAll("</style", "<\\/style");
  } catch (error) {
    const missingPlatformCompiler =
      error instanceof Error &&
      error.message.includes("lightningcss") &&
      error.message.includes("Cannot find module");
    if (!missingPlatformCompiler) throw error;

    const optionalToolsMarker =
      "/* Optional tools are fully isolated so the supplied timer UI is unchanged. */";
    const optionalToolsIndex = source.indexOf(optionalToolsMarker);
    const baseCss = await fs.readFile(
      path.join(projectRoot, "scripts", "android-base.css"),
      "utf8"
    );

    if (optionalToolsIndex < 0) throw error;

    console.warn(
      "Tailwind native compiler unavailable; using the verified supplied UI CSS."
    );
    return `${baseCss}\n${source.slice(optionalToolsIndex)}`.replaceAll(
      "</style",
      "<\\/style"
    );
  }
};

const copyIfPresent = async (sourcePath, destinationPath) => {
  try {
    await fs.copyFile(sourcePath, destinationPath);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
};

const main = async () => {
  await fs.rm(temporaryRoot, { recursive: true, force: true });
  await fs.rm(outputRoot, { recursive: true, force: true });
  await fs.mkdir(path.join(temporaryRoot, "lib"), { recursive: true });
  await fs.mkdir(outputRoot, { recursive: true });

  await Promise.all([
    transpile(
      path.join(projectRoot, "app", "page.tsx"),
      path.join(temporaryRoot, "page.js")
    ),
    transpile(
      path.join(projectRoot, "app", "lib", "pomodoro-features.ts"),
      path.join(temporaryRoot, "lib", "pomodoro-features.js")
    ),
  ]);

  await fs.writeFile(
    path.join(temporaryRoot, "entry.js"),
    [
      'import React from "react";',
      'import { createRoot } from "react-dom/client";',
      'import Home from "./page.js";',
      'createRoot(document.getElementById("root")).render(React.createElement(Home));',
      "",
    ].join("\n"),
    "utf8"
  );

  const [, css] = await Promise.all([runWebpack(), compileCss()]);
  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
  <meta name="theme-color" content="#f46f64">
  <title>Pomodoro</title>
  <style>${css}</style>
</head>
<body>
  <div id="root"></div>
  <noscript>Pomodoro requires JavaScript to run.</noscript>
  <script defer src="./bundle.js"></script>
</body>
</html>`;

  await fs.writeFile(path.join(outputRoot, "index.html"), html, "utf8");

  await Promise.all([
    copyIfPresent(
      path.join(projectRoot, "public", "bell.mp3"),
      path.join(outputRoot, "bell.mp3")
    ),
    copyIfPresent(
      path.join(projectRoot, "public", "button-click.mp3"),
      path.join(outputRoot, "button-click.mp3")
    ),
    copyIfPresent(
      path.join(projectRoot, "app", "favicon.ico"),
      path.join(outputRoot, "favicon.ico")
    ),
    copyIfPresent(
      path.join(projectRoot, "public", "privacy.html"),
      path.join(outputRoot, "privacy.html")
    ),
    copyIfPresent(
      path.join(projectRoot, "public", "sw.js"),
      path.join(outputRoot, "sw.js")
    ),
  ]);

  await fs.rm(temporaryRoot, { recursive: true, force: true });
  const bundleStats = await fs.stat(path.join(outputRoot, "bundle.js"));
  console.log(
    `Android offline build created in out/ (${Math.round(
      bundleStats.size / 1024
    )} KiB JavaScript, Tailwind CSS inlined).`
  );
};

main().catch((error) => {
  console.error("Could not create the Android offline build:", error);
  process.exitCode = 1;
});
