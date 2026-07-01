# Shortcuts Reference

All 17 keyboard shortcuts registered in `shortcutRegistry`. Bindings are customizable in **Settings → Shortcuts** (`settings.bindings`).

- **Scope `global`** — works even when Informio is not focused.
- **Scope `window`** — works only when an Informio window is active.
- Accelerator tokens follow Electron conventions: `CommandOrControl` resolves to `Cmd` on macOS and `Ctrl` on Windows/Linux.

---

## Window & File

| ID | Command | Label | Default Shortcut | Scope | Description |
|---|---|---|---|---|---|
| `app.quickCapture` | `app:quick-capture` | Quick Capture | `Control+Space` | global | Open a blank quick-note window with both sidebars collapsed. |
| `file.new` | `file:new` | New Document | `CommandOrControl+N` | window | Create a new Markdown document immediately. |
| `window.new` | `window:new` | New Window | `Shift+CommandOrControl+N` | window | Open a new Informio application window. |
| `commandPalette.open` | `command:open-palette` | Command Palette | `CommandOrControl+P` | window | Search system commands and documents. |
| `file.open` | `file:open` | Quick Open | `CommandOrControl+O` | window | Open the file picker. |
| `workspace.open` | `workspace:open` | Open Project | `Shift+CommandOrControl+O` | window | Switch to or load a new project directory. |
| `file.closeTab` | `file:close-tab` | Close Tab | `CommandOrControl+W` | window | Close the current document tab. |
| `window.close` | `window:close` | Close Window | `Shift+CommandOrControl+W` | window | Close the current window. |
| `file.save` | `file:save` | Save | `CommandOrControl+S` | window | Save the current document. |
| `file.saveAs` | `file:save-as` | Save As | `Shift+CommandOrControl+S` | window | Save the current document to a new location. |
| `settings.open` | `settings:open` | Open Settings | `CommandOrControl+,` | window | Open the Settings window. |

## Find & Edit

| ID | Command | Label | Default Shortcut | Scope | Description |
|---|---|---|---|---|---|
| `edit.find` | `edit:find` | Find & Replace | `CommandOrControl+F` | window | Open the find-and-replace floating panel for the current document. |
| `edit.findNext` | `edit:find-next` | Find Next | `CommandOrControl+G` | window | Jump to the next match of the current search query. |

## Text Formatting

| ID | Command | Label | Default Shortcut | Scope | Description |
|---|---|---|---|---|---|
| `format.bold` | `format:bold` | Bold | `CommandOrControl+B` | window | Toggle bold on the current selection. |
| `format.italic` | `format:italic` | Italic | `CommandOrControl+I` | window | Toggle italic on the current selection. |
| `format.underline` | `format:underline` | Underline | `CommandOrControl+U` | window | Toggle underline on the current selection. |
| `format.strike` | `format:strike` | Strikethrough | `Shift+CommandOrControl+X` | window | Toggle strikethrough on the current selection. |
| `format.highlight` | `format:highlight` | Highlight | `Shift+CommandOrControl+M` | window | Highlight the current selection. |

---

## Customization notes

- All entries except `app.quickCapture` are configurable (`configurable !== false`).
- Duplicate accelerators are rejected at normalization time — assigning a shortcut that is already in use will show a conflict error in Settings.
- Legacy fields `quickSave` and `quickCapture` are automatically migrated to `file.save` and `app.quickCapture` respectively.
