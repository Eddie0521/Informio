# Split View

The workspace supports recursive horizontal and vertical splits, letting you view multiple documents, PDFs, spreadsheets, or browser panes side by side.

## How splits work

`WorkspaceSplitView` is a recursive component. Each node in the layout tree is either:

- A **leaf** — a single pane holding content (editor, PDF viewer, spreadsheet, browser, or agent panel)
- A **split** — two child nodes arranged horizontally or vertically, separated by a draggable divider

You can nest splits arbitrarily: a horizontal split can contain vertical splits on either side, and so on.

## Pane content types

Each pane can display any of the following:

- Markdown editor
- PDF viewer
- Spreadsheet grid
- Browser panel
- Agent panel

## Activating panes

Click anywhere inside a pane to give it focus. The active pane shows a subtle green ring border when multiple panes are open. Only one pane is active at a time.

## Maximizing a pane

To temporarily fill the window with a single pane:

- Hover over the pane to reveal the controls in the top-right corner
- Click the **Maximize** button (expand icon)

Click it again or create new splits to return to the multi-pane layout.

## Closing a pane

Hover over the pane and click the **X** button in the top-right corner. A pane can be closed unless it is the last remaining document pane in the window.

Keyboard shortcut: **Cmd+W** (macOS) or **Ctrl+W** (Windows) closes the active pane.

## Resizing panes

Drag the divider between two panes to adjust their relative sizes. The divider changes color on hover to indicate it is interactive. While dragging, browser panes temporarily hide to keep the resize smooth.

## Creating new panes by dropping

Drag a file from the library panel and drop it onto a pane. A drop zone overlay appears showing where the file will open:

- Drop on the **center** of the pane to replace the current content
- Drop on an **edge** (top, bottom, left, right) to create a new split alongside the existing pane

You can also drag browser or agent tabs into the workspace to open them in a new pane.

## See also

- [Projects & Folders](projects-folders.md) — managing files in the library panel
- [Command Palette](command-palette.md) — opening files without leaving the keyboard
- [File Operations](file-operations.md) — moving and organizing files
