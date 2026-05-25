const { spawnSync } = require("node:child_process");
const path = require("node:path");

const isWindows = process.platform === "win32";
const repoRoot = path.resolve(__dirname, "..");
const shimDir = path.join(__dirname, "bin");
const electronBuilderBin = path.join(
  repoRoot,
  "node_modules",
  ".bin",
  isWindows ? "electron-builder.cmd" : "electron-builder"
);

const env = {
  ...process.env,
  ELECTRON_BUILDER_CACHE: process.env.ELECTRON_BUILDER_CACHE || path.join(repoRoot, ".cache", "electron-builder"),
  PATH: [shimDir, process.env.PATH || ""].filter(Boolean).join(path.delimiter)
};

const result = spawnSync(electronBuilderBin, process.argv.slice(2), {
  cwd: repoRoot,
  env,
  stdio: "inherit",
  shell: false
});

if (result.error) {
  throw result.error;
}

process.exit(result.status ?? 1);
