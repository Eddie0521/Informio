# Installation

## Download a release build

The fastest way to get started. Pre-built binaries are available for macOS and Windows from [GitHub Releases](https://github.com/Eddie0521/Informio/releases/latest).

### macOS

1. Download the `.dmg` file from the latest release.
2. Drag **Informio** into your `/Applications` folder.
3. Because the build is unsigned, macOS may say the app is "damaged." Open Terminal and run:
   ```bash
   xattr -dr com.apple.quarantine /Applications/Informio.app
   ```
4. Open Informio normally from Applications or Spotlight.

> **Tip:** If you prefer to skip the quarantine step entirely, [build from source](#build-from-source) on your Mac. The locally built binary is automatically trusted.

### Windows

1. Download the `.exe` NSIS installer from the latest release.
2. Run the installer and follow the prompts.
3. Launch Informio from the Start menu or desktop shortcut.

> **Note:** Windows packaging is functional but macOS remains the most thoroughly tested platform. If you hit an issue, please [open an issue](https://github.com/Eddie0521/Informio/issues).

## Build from source

Building locally avoids Gatekeeper prompts on macOS and gives you the latest unreleased changes.

### Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| Node.js | 20 LTS or newer | [nodejs.org](https://nodejs.org/) or `brew install node` |
| Corepack | ships with Node.js | `corepack enable` |
| Git | any recent version | [git-scm.com](https://git-scm.com/) |

Verify your setup:

```bash
node -v          # should print v20 or newer
git --version
corepack pnpm -v
```

### Clone and build

```bash
git clone https://github.com/Eddie0521/Informio.git
cd Informio
corepack pnpm install
```

Then package for your platform:

```bash
# macOS (unsigned DMG + ZIP)
corepack pnpm run dist:mac:unsigned

# Windows (NSIS installer)
corepack pnpm run dist:win
```

Build artifacts are written to the `release/` folder. On macOS, the locally built binary is automatically stripped of the quarantine attribute, so it opens without warnings on the machine that built it.

## Development setup

If you want to contribute or run Informio directly from source:

```bash
corepack pnpm install
corepack pnpm run dev
```

This starts the Electron app in development mode with hot-reload for the renderer process. On Windows, use PowerShell.

## See also

- [First Launch](./first-launch.md) — what to expect when you open Informio for the first time
- [Quick Tour](./quick-tour.md) — a hands-on walkthrough of core features
