# File Operations

Informio provides a full set of file and folder operations through the right-click context menu, inline editing, and drag-and-drop.

## Context menu actions

Right-click a file in the library panel to open the context menu. Available actions:

| Action | Effect |
|---|---|
| **Rename** | Enter inline rename mode on the file |
| **Duplicate** | Create a copy of the file in the same folder |
| **Move to Trash** | Delete the file (moved to system trash, not permanently deleted) |
| **Open in Finder / Explorer** | Reveal the file in your system file manager |

Right-click a folder for these additional actions:

| Action | Effect |
|---|---|
| **New file** | Create a new document inside the folder |
| **New folder** | Create a subfolder |

Right-click an empty area of the library panel to create a new file or folder at the project root.

## Inline rename

Click a file or folder name to enter inline rename mode. The current name becomes an editable text field:

- For files, the base name is pre-selected (excluding the extension) so you can type a new name without accidentally changing the file type.
- Press **Enter** to confirm, **Escape** to cancel.
- Clicking away from the input also commits the rename.

Renaming a file triggers a filesystem rename through the `FileSystemOperationInput` with `action: "rename"`.

## Drag and drop

### Moving files within a project

Drag a file or folder and drop it onto another folder in the tree. Informio moves the item to the destination folder. Dropping a folder onto one of its own descendants is prevented.

### Importing external files

Drag files from your system file manager (Finder, Explorer) into the library panel. Informio imports them into the target folder using the `ImportExternalFilesInput` interface:

```typescript
{
  sourcePaths: string[];          // absolute paths of dragged files
  destinationFolderPath: string;  // target folder in the project
}
```

### Drop feedback

When hovering over a folder during a drag, the folder highlights with a green accent to indicate a valid drop target.

## Folder operations

Folders support the same rename workflow as files — click the folder name to edit inline. Creating a subfolder expands the parent folder automatically so you can see and rename the new item immediately.

## File type detection

Informio detects file types by extension and assigns the appropriate viewer:

| Extensions | Kind |
|---|---|
| `.md`, `.markdown` | Markdown |
| `.txt` | Text |
| `.png`, `.jpg`, `.jpeg`, `.gif`, `.webp`, `.svg` | Image |
| `.mp4`, `.mov`, `.webm` | Video |
| `.mp3`, `.wav`, `.m4a`, `.ogg` | Audio |
| `.pdf` | PDF |
| `.xlsx`, `.xls`, `.csv` | Spreadsheet |

## See also

- [Projects & Folders](projects-folders.md) — adding and organizing projects
- [Split View](split-view.md) — opening files in side-by-side panes
- [Quick Capture](quick-capture.md) — creating notes without navigating the file tree
