<p align="right">
  English | <a href="./README_CN.md">简体中文</a>
</p>

<p align="center">
  <img src="./src/renderer/public/icon-512.png" width="120" alt="Informio icon" />
</p>

<h1 align="center">Informio</h1>

<p align="center">
  <a href="https://github.com/Eddie0521/Informio/releases/latest"><img src="https://img.shields.io/github/v/release/Eddie0521/Informio?style=flat-square&label=release&cacheSeconds=300&v=2" alt="Release" /></a>
  <img src="https://img.shields.io/badge/macOS-supported-111827?style=flat-square&logo=apple" alt="macOS supported" />
  <img src="https://img.shields.io/badge/Windows-supported-2563eb?style=flat-square&logo=windows" alt="Windows supported" />
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-AGPL--3.0--only-10b981?style=flat-square" alt="AGPL-3.0-only License" /></a>
</p>

<p align="center">
  <em>"I write entirely to find out what I'm thinking." - Joan Didion</em>
</p>

<p align="center">
  <img src="./docs/assets/image_informio.png" alt="Informio interface preview" />
</p>

## Features

- **Project-based**: No need to move every file into one fixed directory. Add the folders you actually use, whenever you need them.
- **Focused**: Review Markdown, PDF, image, video, and audio in one workspace; mark key points, write notes, and assign tasks to Agents without switching context.
- **Safe**: Local-first, no data collection. Lock sensitive notes with a passphrase, so Agents can use the context they need while private content stays out of view.
- **Simple**: No database, no complex guidance. Open Informio, import your project, start your work. Informio relies on locally installed Agents and reuses the setup you already have.
- **Research-friendly**: Preview and highlight PDFs, keep Markdown records, and let Agents see the full working context directly.

## Quick Start

1. Download the latest build from [GitHub Releases](https://github.com/Eddie0521/Informio/releases/latest), or [build from source](#build-from-source) to skip Gatekeeper prompts on macOS.
2. On macOS, because the build is unsigned, the system may say the app is "damaged." Run this in Terminal before opening it:
   ```bash
   xattr -dr com.apple.quarantine /Applications/Informio.app
   ```
3. Open Informio and add the folder you are working in. Your Markdown files stay where they already are.
4. Start writing in the center editor. Use the side panels only when you need files, media, or Agent context.
5. To use Agent assistance, make sure your preferred local Agent CLI is already installed and signed in, then choose it from Informio settings.
6. When you need anything, ask the Agent to work from the current workspace context.

## Build from source

Prefer to build Informio yourself? Cloning and packaging locally avoids macOS Gatekeeper prompts on unsigned release downloads — the machine that builds the app opens it without warnings.

```bash
git clone https://github.com/Eddie0521/Informio.git
cd Informio
corepack pnpm install

# macOS (unsigned DMG + ZIP, no Apple ID needed)
corepack pnpm run dist:mac:unsigned

# Windows (NSIS installer)
corepack pnpm run dist:win
```

Artifacts are written to the `release/` folder. The macOS build automatically removes the quarantine attribute, so the app opens without Gatekeeper warnings on the machine that built it.

## Installation

Informio currently ships macOS and Windows builds. Download from [GitHub Releases](https://github.com/Eddie0521/Informio/releases/latest), or see [Build from source](#build-from-source) above.

### Windows

Informio includes Windows packaging fixes, but macOS remains the most carefully tested platform. If you find any Windows problem, please open an issue or PR.

## Development

Informio uses the `pnpm` version declared in `package.json`. On macOS or Windows, run these commands from the repository root:

```bash
corepack pnpm install
corepack pnpm run dev
```

On Windows, use PowerShell.

## Tech Stack

- **Desktop shell**: Electron, Electron Vite, Vite, TypeScript
- **Interface**: React, Tailwind CSS, Radix UI, Lucide React
- **Editor**: Tiptap, ProseMirror, Tiptap Markdown
- **Preview and rendering**: EmbedPDF, Mermaid, KaTeX, Lowlight
- **Local app layer**: Electron Store, Electron Updater, Zod
- **Agent integrations**: Claude Agent SDK, OpenCode SDK, local Agent CLI discovery
- **Packaging**: Electron Builder for macOS and Windows builds

## Notes

Informio is vibe-coded to satisfy everyday recording and note-taking needs. If you run into any issue, issues and PRs are welcome.

## License

Informio is licensed under the GNU Affero General Public License v3.0 only (`AGPL-3.0-only`). You may use, study, modify, and redistribute it under the terms of the license. Modified versions that are distributed or made available over a network must provide the corresponding source code under the same license.
