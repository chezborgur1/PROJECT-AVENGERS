// Builds the hosted app for Vercel (npm run build:vercel; Vercel runs it
// itself, from vercel.json). The output follows Vercel's Build Output API:
// one Node function holding the whole engine as a single bundle, plus the
// files it reads at run time (templates, reference data, the sample, the
// page), and routes that send every path of the site to that function.
//
// The engine finds its files from import.meta.dirname, which in one bundle
// would be the bundle's own folder for every module. So each source file's
// import.meta.dirname is rewritten to its original folder inside the
// function, and the files are copied to the same places.

import fs from "node:fs";
import path from "node:path";
import { build, type Plugin } from "esbuild";

const ROOT = path.resolve(import.meta.dirname, "..");
// BUILD_OUTPUT_DIR moves the output (the build test); Vercel reads .vercel/output.
const OUT = process.env.BUILD_OUTPUT_DIR ? path.resolve(process.env.BUILD_OUTPUT_DIR) : path.join(ROOT, ".vercel", "output");
const FUNC = path.join(OUT, "functions", "app.func");
const SRC = path.join(ROOT, "src") + path.sep;

const dirnames: Plugin = {
  name: "import-meta-dirname",
  setup(b) {
    b.onLoad({ filter: /\.ts$/ }, async (args) => {
      if (!args.path.startsWith(SRC)) return undefined;
      const text = await fs.promises.readFile(args.path, "utf8");
      const rel = path.relative(ROOT, path.dirname(args.path)).split(path.sep).join("/");
      return { contents: text.replaceAll("import.meta.dirname", `__ambDir(${JSON.stringify(rel)})`), loader: "ts" };
    });
  },
};

fs.rmSync(OUT, { recursive: true, force: true });
await build({
  entryPoints: [path.join(ROOT, "src", "hosted", "vercel.ts")],
  outfile: path.join(FUNC, "index.mjs"),
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  // Sunbiz's SSH library is never loaded on the hosted app; pg-native and PGlite are optional extras.
  external: ["ssh2-sftp-client", "pg-native", "@electric-sql/pglite"],
  plugins: [dirnames],
  banner: {
    js: [
      'import { createRequire as __ambRequire } from "node:module";',
      'import { fileURLToPath as __ambUrlPath } from "node:url";',
      'import __ambPath from "node:path";',
      "const require = __ambRequire(import.meta.url);",
      "const __filename = __ambUrlPath(import.meta.url);",
      "const __dirname = __ambPath.dirname(__filename);",
      "const __ambDir = (rel) => __ambPath.join(__dirname, rel);",
    ].join("\n"),
  },
  legalComments: "none",
  logLevel: "warning",
});

// The files the engine reads at run time, at the same places relative to the bundle as to the package.
for (const item of ["templates", "reference", "samples", "config/engine.config.example.json", "src/app/ui.html"]) {
  fs.cpSync(path.join(ROOT, item), path.join(FUNC, item), { recursive: true });
}

const write = (file: string, value: unknown) => fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
write(path.join(FUNC, ".vc-config.json"), {
  runtime: "nodejs22.x",
  handler: "index.mjs",
  launcherType: "Nodejs",
  shouldAddHelpers: false,
  // Vercel's limit on every plan; each step stops early to stay inside it (src/app/api.ts, ACTIONS).
  maxDuration: 300,
});
write(path.join(OUT, "config.json"), {
  version: 3,
  // Every path goes to the one function, which reads the original path from __pathname.
  routes: [{ src: "^/(.*)$", dest: "/app?__pathname=/$1" }],
  // Weekday replies check at 8:45 Eastern (12:45 UTC in summer): runs only once CRON_SECRET is set.
  crons: [{ path: "/api/cron/replies", schedule: "45 12 * * 1-5" }],
});

const size = fs.statSync(path.join(FUNC, "index.mjs")).size;
console.log(`Built .vercel/output: one function (${(size / 1e6).toFixed(1)} MB bundle) and the routes.`);
