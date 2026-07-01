# Command Palette

The command palette is a quick-access overlay for running commands, opening files, and navigating Informio without using menus.

## Opening the palette

Press **Cmd+P** (macOS) or **Ctrl+P** (Windows). The palette opens centered on screen with a search input focused and ready for typing.

## Built-in commands

The palette includes these commands by default:

| Command | Description |
|---|---|
| New document | Create a new Markdown file |
| New window | Open a new application window |
| Open file | Open an existing file from disk |
| Open project | Add or switch to a project |
| Close tab | Close the active tab |
| Close window | Close the current window |
| Save | Save the active document |
| Save as | Save the active document to a new location |
| Find | Open the find/search bar |
| Settings | Open the settings panel |

Additional commands may appear depending on your configuration and installed agents.

## Searching

Type in the search input to filter commands. The palette uses fuzzy matching — you don't need to type the exact command name. For example, typing `nw` will match "New window" because the characters appear in order.

The search also matches against command subtitles and keywords, and results are ranked by match quality. Commands with an exact substring match score higher than fuzzy-only matches.

## Document search

The palette also searches your open documents by title. Type a document name to jump directly to it.

## Keyboard navigation

| Key | Action |
|---|---|
| **Arrow Down** | Move selection down |
| **Arrow Up** | Move selection up |
| **Enter** | Run the selected command |
| **Escape** | Close the palette |

You can also hover over any item with the mouse to select it, then click to run.

## Shortcuts

Each command may display a keyboard shortcut next to its name. These shortcuts work globally — you don't need the palette open to use them.

## See also

- [Quick Capture](quick-capture.md) — creating notes instantly with a global hotkey
- [Split View](split-view.md) — navigating between multiple panes
- [Projects & Folders](projects-folders.md) — managing your workspace
