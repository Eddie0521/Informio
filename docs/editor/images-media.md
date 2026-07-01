# Images & Media

Informio can embed images, video, and audio directly in your document.

## Images

### Inserting an Image

- Use the Insert toolbar (image icon) to open the image dialog.
- Enter a URL or local file path.
- Paste an image from the clipboard — it is saved as an attachment automatically.

### Resizing on Canvas

Click an image to select it. Drag the bottom-right handle to resize. The aspect ratio is always preserved. Minimum width is 120px.

Resized width is saved as a `width` attribute in Markdown. The Markdown reference itself stays standard:

```markdown
![alt text](path/to/image.png)
```

### Double-click to Edit

Double-click an image to re-open the image dialog and change its URL, alt text, or title.

## Video & Audio

Use the Insert toolbar to insert video (film icon) or audio (music icon). Media is rendered with native browser controls.

The saved Markdown uses HTML tags:

```html
<video controls src="video.mp4" title="My Video"></video>
<audio controls src="audio.mp3" title="My Audio"></audio>
```

## PDF

PDF files can be embedded from the Insert toolbar. They render inline using pdf.js with native highlight mode available from the PDF toolbar.

## Asset Import Modes

In Settings, choose how imported files are handled:

- **Copy to attachment**: copies the file into the app's attachment folder. The document references the copy.
- **Link original file**: keeps a reference to the original file path.

## Local Asset Resolution

Images and media can reference local files by relative path. The editor resolves them against the document's file location or the configured quick folder.

## See also

- [Markdown Basics](markdown-basics.md) — image markdown syntax
- [Clipboard Paste](clipboard-paste.md) — how pasted images are handled
- [Code Blocks](code-blocks.md) — unrelated to media, but nearby in the Insert toolbar
