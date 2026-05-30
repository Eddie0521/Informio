<p align="right">
  <a href="./README.md">English</a> | 简体中文
</p>

<p align="center">
  <img src="./src/renderer/public/icon-512.png" width="120" alt="Informio 图标" />
</p>

<h1 align="center">Informio</h1>

<p align="center">
  <a href="https://github.com/Eddie0521/Informio/releases/latest"><img src="https://img.shields.io/github/v/release/Eddie0521/Informio?style=flat-square&label=release" alt="Release" /></a>
  <img src="https://img.shields.io/badge/macOS-supported-111827?style=flat-square&logo=apple" alt="支持 macOS" />
  <img src="https://img.shields.io/badge/Windows-supported-2563eb?style=flat-square&logo=windows" alt="支持 Windows" />
  <img src="https://img.shields.io/badge/Linux-supported-f59e0b?style=flat-square&logo=linux" alt="支持 Linux" />
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-10b981?style=flat-square" alt="MIT License" /></a>
</p>

<p align="center">
  <em>“我写作，完全是为了弄清自己在想什么。” - Joan Didion</em>
</p>

<p align="center">
  <img src="./docs/assets/image_informio.png" alt="Informio 界面预览" />
</p>

## Quick Start

1. 从 [GitHub Releases](https://github.com/Eddie0521/Informio/releases/latest) 下载最新版本。
2. 打开 Informio，添加你正在使用的项目文件夹。Markdown 文件会留在原来的位置，不需要搬进固定目录。
3. 直接在中间编辑区开始写作。只有需要文件、媒体或 Agent 上下文时，再展开两侧面板。
4. 如果要使用 Agent，请先确认本地已经安装并登录对应的 Agent CLI，然后在 Informio 设置里选择它。
5. 有任何需求，都可以让 Agent 基于当前工作区上下文处理。

## Features

- **项目制**：不需要把所有资料都整理到同一个文件夹。用到哪个项目、哪个目录，直接添加进来就能开始。
- **专注**：Markdown、PDF、图片、视频、音频都可以在一个工作区里审阅。标记重点、记录想法、安排 Agent 执行任务，不用在一堆工具之间来回切换。
- **安全**：Local-first，无数据收集。通过口令锁定敏感笔记，让 Agent 能使用工作所需上下文，同时避免浏览你的私人内容。
- **简单**：无数据库，无复杂引导。打开 Informio，导入项目，直接开始工作。Informio 完全依赖本地安装的 Agent，最大程度复用用户原本的设置。
- **适合研究整理**：PDF 预览高亮、Markdown 编辑记录、Agent 直接看到完整上下文，让阅读、记录和后续执行连在一起。

## Installation

前往 [GitHub Releases](https://github.com/Eddie0521/Informio/releases/latest) 下载最新桌面版本。Informio 支持 macOS、Windows 和 Linux。

### macOS

因为还没有申请到开发者账号，所以 macOS 会提示应用已损坏，需要先在终端里输入：

```bash
xattr -dr com.apple.quarantine /Applications/Informio.app
```

### Windows 和 Linux

当前仅在 macOS 仔细测试过，Windows 和 Linux 有任何问题，请提 issue 和 PR。

## 须知

这是为了满足平时的记录需求，Vibe Coding 出来的。如果有任何问题，欢迎提 issue 和 PR。

## License

MIT License - Feel free to use and contribute.
