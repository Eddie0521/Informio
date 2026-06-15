<p align="right">
  <a href="./README.md">English</a> | 简体中文
</p>

<p align="center">
  <img src="./src/renderer/public/icon-512.png" width="120" alt="Informio 图标" />
</p>

<h1 align="center">Informio</h1>

<p align="center">
  <a href="https://github.com/Eddie0521/Informio/releases/latest"><img src="https://img.shields.io/github/v/release/Eddie0521/Informio?style=flat-square&label=release&cacheSeconds=300&v=2" alt="Release" /></a>
  <img src="https://img.shields.io/badge/macOS-supported-111827?style=flat-square&logo=apple" alt="支持 macOS" />
  <img src="https://img.shields.io/badge/Windows-supported-2563eb?style=flat-square&logo=windows" alt="支持 Windows" />
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-AGPL--3.0--only-10b981?style=flat-square" alt="AGPL-3.0-only License" /></a>
</p>

<p align="center">
  <em>“我写作，完全是为了弄清自己在想什么。” - Joan Didion</em>
</p>

<p align="center">
  <img src="./docs/assets/image_informio.png" alt="Informio 界面预览" />
</p>

## Features

- **项目制**：不需要把所有资料都整理到同一个文件夹。用到哪个项目、哪个目录，直接添加进来就能开始。
- **专注**：Markdown、PDF、图片、视频、音频都可以在一个工作区里审阅。标记重点、记录想法、安排 Agent 执行任务，不用在一堆工具之间来回切换。
- **安全**：Local-first，无数据收集。通过口令锁定敏感笔记，让 Agent 能使用工作所需上下文，同时避免浏览你的私人内容。
- **简单**：无数据库，无复杂引导。打开 Informio，导入项目，直接开始工作。Informio 完全依赖本地安装的 Agent，最大程度复用用户原本的设置。
- **适合研究整理**：PDF 预览高亮、Markdown 编辑记录、Agent 直接看到完整上下文，让阅读、记录和后续执行连在一起。

## Quick Start

1. 从 [GitHub Releases](https://github.com/Eddie0521/Informio/releases/latest) 下载最新版本，或[从源码自行打包](#从源码自行打包)以跳过 macOS 的 Gatekeeper 提示。
2. 在 macOS 上，由于未签名，系统可能提示应用「已损坏」。打开前先在终端运行：
   ```bash
   xattr -dr com.apple.quarantine /Applications/Informio.app
   ```
3. 打开 Informio，添加你正在使用的项目文件夹。Markdown 文件会留在原来的位置，不需要搬进固定目录。
4. 直接在中间编辑区开始写作。只有需要文件、媒体或 Agent 上下文时，再展开两侧面板。
5. 如果要使用 Agent，请先确认本地已经安装并登录对应的 Agent CLI，然后在 Informio 设置里选择它。
6. 有任何需求，都可以让 Agent 基于当前工作区上下文处理。

## 从源码自行打包

想自己打包？克隆仓库并在本地构建，可以避开未签名 Release 在 macOS 上的 Gatekeeper 提示——在本机打包出来的应用，打开时不会报警。

```bash
git clone https://github.com/Eddie0521/Informio.git
cd Informio
corepack pnpm install

# macOS（未签名 DMG + ZIP，无需 Apple ID）
corepack pnpm run dist:mac:unsigned

# Windows（NSIS 安装包）
corepack pnpm run dist:win
```

产物会输出到 `release/` 目录。macOS 构建会自动移除隔离属性，因此在本机打包出来的应用可以直接打开，不会出现 Gatekeeper 警告。

## 安装

Informio 当前提供 macOS 和 Windows 构建。前往 [GitHub Releases](https://github.com/Eddie0521/Informio/releases/latest) 下载，或参考上方的[从源码自行打包](#从源码自行打包)。

### Windows

Informio 已加入 Windows 打包修复，但 macOS 仍然是目前测试最充分的平台。Windows 如有任何问题，请提 issue 和 PR。

## 开发

Informio 使用 `package.json` 中声明的 `pnpm` 版本。macOS 和 Windows 都在仓库根目录运行下面的命令：

```bash
corepack pnpm install
corepack pnpm run dev
```

Windows 请使用 PowerShell。

## 技术栈

- **桌面外壳**：Electron、Electron Vite、Vite、TypeScript
- **界面**：React、Tailwind CSS、Radix UI、Lucide React
- **编辑器**：Tiptap、ProseMirror、Tiptap Markdown
- **预览与渲染**：EmbedPDF、Mermaid、KaTeX、Lowlight
- **本地应用层**：Electron Store、Electron Updater、Zod
- **Agent 集成**：Claude Agent SDK、OpenCode SDK、本地 Agent CLI 发现
- **打包**：Electron Builder，用于 macOS 和 Windows 构建

## 须知

这是为了满足平时的记录需求，Vibe Coding 出来的。如果有任何问题，欢迎提 issue 和 PR。

## License

Informio 使用 GNU Affero General Public License v3.0 only（`AGPL-3.0-only`）授权。你可以在该协议条款下使用、学习、修改和再分发本项目；如果分发修改版本，或通过网络向用户提供修改后的版本，需要按同一协议提供对应源代码。
