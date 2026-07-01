# Projects & Folders

Informio uses a project-based workspace model. There is no single fixed root directory — you add the folders you actually work with, and they appear as top-level entries in the library panel.

## Project structure

Each project is an `InformioProject` with these properties:

| Field | Description |
|---|---|
| `id` | Unique identifier |
| `path` | Absolute path to the folder on disk |
| `title` | Display name (defaults to the folder name) |
| `addedAt` | When the project was added to Informio |
| `pinned` | Whether the project appears at the top of the list |

## Adding a project

Open the project picker and select any folder on your system. Informio indexes the folder's contents and displays them in the left library panel. You can add as many projects as you need — they do not need to share a parent directory.

Files inside a project stay in their original locations on disk. Informio does not copy or move your files into a central store.

## Pinning projects

Right-click a project in the library and choose **Pin** to keep it at the top of the list. Pinned projects show a small pin icon next to their name. To unpin, right-click and choose **Unpin**.

## Folder tree

The library panel displays a tree view of each project's contents. Folders are collapsible — click a folder to expand or collapse it. The tree is built from the project's `InformioFolder` and `InformioDocument` entries.

Each file shows a type-specific icon based on its extension:

| Kind | Icon |
|---|---|
| Markdown / text | FileText |
| Image | ImageIcon |
| Video | Film |
| Audio | Music |
| Spreadsheet | Table |

Project-level entries use a `Folder` icon; subfolders use a `FolderRoot` icon.

## Project context menu

Right-click a project to access these actions:

- **New file** — create a document inside the project
- **New folder** — create a subfolder
- **Rename** — change the project's display name
- **Pin / Unpin** — toggle quick-access pinning
- **Open in Finder / Explorer** — reveal the folder in your system file manager
- **Remove from list** — remove the project from Informio (does not delete files on disk)

## See also

- [File Operations](file-operations.md) — renaming, duplicating, deleting, and moving files
- [Split View](split-view.md) — opening files side by side
- [Command Palette](command-palette.md) — quick navigation across projects and files
