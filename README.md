<p align="right">
  English | <a href="./README_CN.md">简体中文</a>
</p>

<p align="center">
  <img src="./src/renderer/public/icon-512.png" width="120" alt="Informio icon" />
</p>

<h1 align="center">Informio</h1>

<p align="center">
  <a href="https://github.com/Eddie0521/Informio/releases/latest"><img src="https://img.shields.io/github/v/release/Eddie0521/Informio?style=flat-square&label=release" alt="Release" /></a>
  <img src="https://img.shields.io/badge/macOS-supported-111827?style=flat-square&logo=apple" alt="macOS supported" />
  <img src="https://img.shields.io/badge/Windows-supported-2563eb?style=flat-square&logo=windows" alt="Windows supported" />
  <img src="https://img.shields.io/badge/Linux-supported-f59e0b?style=flat-square&logo=linux" alt="Linux supported" />
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-AGPL--3.0--only-10b981?style=flat-square" alt="AGPL-3.0-only License" /></a>
</p>

<p align="center">
  <em>"I write entirely to find out what I'm thinking." - Joan Didion</em>
</p>

<p align="center">
  <img src="./docs/assets/image_informio.png" alt="Informio interface preview" />
</p>

## Quick Start

1. Download the latest build from [GitHub Releases](https://github.com/Eddie0521/Informio/releases/latest).
2. Open Informio and add the folder you are working in. Your Markdown files stay where they already are.
3. Start writing in the center editor. Use the side panels only when you need files, media, or Agent context.
4. To use Agent assistance, make sure your preferred local Agent CLI is already installed and signed in, then choose it from Informio settings.
5. When you need anything, ask the Agent to work from the current workspace context.

## Features

- **Project-based**: No need to move every file into one fixed directory. Add the folders you actually use, whenever you need them.
- **Focused**: Review Markdown, PDF, image, video, and audio in one workspace; mark key points, write notes, and assign tasks to Agents without switching context.
- **Safe**: Local-first, no data collection. Lock sensitive notes with a passphrase, so Agents can use the context they need while private content stays out of view.
- **Simple**: No database, no complex guidance. Open Informio, import your project, start your work. Informio relies on locally installed Agents and reuses the setup you already have.
- **Research-friendly**: Preview and highlight PDFs, keep Markdown records, and let Agents see the full working context directly.

## Installation

Download the latest desktop build from [GitHub Releases](https://github.com/Eddie0521/Informio/releases/latest). Informio supports macOS, Windows, and Linux.

### macOS

Because the developer account has not been approved yet, macOS may report that the app is damaged. Run this command in Terminal before opening the app:

```bash
xattr -dr com.apple.quarantine /Applications/Informio.app
```

### Windows and Linux

Informio has only been carefully tested on macOS for now. If you find any problem on Windows or Linux, please open an issue or PR.

## Notes

Informio is vibe-coded to satisfy everyday recording and note-taking needs. If you run into any issue, issues and PRs are welcome.

## License

Informio is licensed under the GNU Affero General Public License v3.0 only (`AGPL-3.0-only`). You may use, study, modify, and redistribute it under the terms of the license. Modified versions that are distributed or made available over a network must provide the corresponding source code under the same license.
