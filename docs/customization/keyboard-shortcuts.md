# Keyboard Shortcuts

Informio registers 17 keyboard shortcuts organized into three categories. All configurable shortcuts can be rebound from **Settings → Shortcuts**.

## Shortcut categories

### Window & File

| Action | Default binding | Scope |
|--------|----------------|-------|
| Quick capture | Ctrl+Space | Global |
| New document | Cmd+N | Window |
| New window | Shift+Cmd+N | Window |
| Command palette | Cmd+P | Window |
| Open file | Cmd+O | Window |
| Open project | Shift+Cmd+O | Window |
| Close tab | Cmd+W | Window |
| Close window | Shift+Cmd+W | Window |
| Save | Cmd+S | Window |
| Save as | Shift+Cmd+S | Window |
| Settings | Cmd+, | Window |

### Find & Edit

| Action | Default binding | Scope |
|--------|----------------|-------|
| Find / Replace | Cmd+F | Window |
| Find next | Cmd+G | Window |

### Text Formatting

| Action | Default binding | Scope |
|--------|----------------|-------|
| Bold | Cmd+B | Window |
| Italic | Cmd+I | Window |
| Underline | Cmd+U | Window |
| Strikethrough | Shift+Cmd+X | Window |
| Highlight | Shift+Cmd+M | Window |

On Windows and Linux, **Cmd** in the table above means **Ctrl**. The display adapts automatically to your platform — `CommandOrControl` renders as `Cmd` on macOS and `Ctrl` elsewhere.

## Scope

Each shortcut has one of two scopes:

- **Window** — active only when an Informio window is focused.
- **Global** — works even when Informio is not the frontmost app. Currently only **Quick capture** uses global scope, so you can open a scratch window from anywhere.

## Rebinding a shortcut

1. Open **Settings → Shortcuts**.
2. Click the current binding for the shortcut you want to change.
3. Press the new key combination. The control shows "Press new key…" while recording.
4. If the combination conflicts with another shortcut, an error message names both actions. Choose a different combination.
5. Click **Default** to restore the original binding, or **Clear** to remove it entirely.

## Conflict detection

When you assign a key combination that is already in use by another shortcut, Informio blocks the change and displays an error identifying both the existing and new actions. Each physical key combination can only be bound to one action.

## How bindings are stored

Custom bindings are saved in `settings.shortcuts.bindings` as a map of shortcut ID to accelerator string (e.g. `"file.save": "CommandOrControl+S"`). Unset shortcuts fall back to their default binding. If a binding is cleared, the shortcut has no effect until re-assigned.

Accelerator strings use a normalized format: modifiers in order (`CommandOrControl`, `Command`, `Control`, `Alt`, `Shift`) followed by `+` and the key (e.g. `Shift+CommandOrControl+X`).

## See also

- [Editor Settings](./editor-settings.md) — editor behavior and auto-save
- [Appearance](./appearance.md) — panel layout, status bar, language
- [Themes](./themes.md) — color themes
