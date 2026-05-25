# Informio Release Guide

## Current Strategy

Informio ships desktop builds for three operating systems:

- macOS: unsigned `.dmg` and `.zip`
- Windows: `.exe` installer via NSIS
- Linux: `.AppImage`

Distribution is split into two paths:

- Local packaging: quick validation on the current machine
- GitHub Actions: the canonical way to build all three platforms in their native environments

This keeps local iteration fast and avoids fragile cross-platform packaging from a single host OS.

## Local Build Commands

Run from your normal terminal:

```bash
corepack pnpm release:mac:unsigned
corepack pnpm release:win
corepack pnpm release:linux
```

If you only need to rebuild installers from an existing `out/` build:

```bash
corepack pnpm dist:mac:unsigned
corepack pnpm dist:win
corepack pnpm dist:linux
```

`corepack pnpm dist:desktop` exists for convenience, but the recommended production workflow is the GitHub Actions matrix build because each platform packages itself on its native runner.

## GitHub Actions Build

Workflow file:

```text
.github/workflows/build-desktop.yml
```

Triggers:

- `workflow_dispatch`: manual build from the Actions tab
- `push` tag matching `v*`: versioned release build

The workflow runs on:

- `macos-latest`
- `windows-latest`
- `ubuntu-latest`

Each runner:

1. installs dependencies
2. runs typecheck
3. builds the Electron app
4. packages its own platform
5. uploads artifacts to the workflow run

## Local Environment Notes

The local packaging scripts automatically:

- invoke `electron-builder` through a repo-local launcher
- provide a local `pnpm` shim for `electron-builder` child processes
- store `ELECTRON_BUILDER_CACHE` under `.cache/electron-builder`

This avoids depending on a globally installed `pnpm` and keeps build cache inside the project directory.

## Output Files

After a successful build, `release/` will contain files such as:

- `Informio-0.1.2-mac-arm64.dmg`
- `Informio-0.1.2-mac-arm64.zip`
- `Informio-0.1.2-win-x64.exe`
- `Informio-0.1.2-linux-arm64.AppImage`

Exact filenames depend on version, OS, and architecture.

## Recommended Release Flow

1. Update the version in `package.json`.
2. Run a local validation build for the platform you are currently using.
3. Create and push a Git tag such as `v0.1.2`.
4. Let GitHub Actions build macOS, Windows, and Linux artifacts.
5. Download the generated artifacts from the workflow run or attach them to a GitHub Release.

## User-Facing Notes

### macOS

The current macOS build is unsigned and not notarized.

Users may need to:

- right-click the app and choose `Open`
- allow the app in Privacy & Security settings

### Windows

If the app is not code signed yet, SmartScreen may warn before launch. Users can still continue manually.

### Linux

AppImage works as a portable download and is the current canonical Linux release format.

## Troubleshooting

### `lightningcss` fails to load during build

If a native module fails under an embedded tool runtime, rerun the release command from your normal terminal with your system Node.js environment and `corepack pnpm`.

### `pnpm: command not found`

Use `corepack pnpm ...` instead of relying on a globally installed `pnpm`.

### One machine does not reliably build every platform

This is expected. Use the GitHub Actions matrix workflow for the canonical three-platform build.
