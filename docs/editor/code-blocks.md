# Code Blocks

Informio provides syntax-highlighted code blocks powered by Lowlight.

## Creating a Code Block

- Type `` ``` `` (or `` ```language ``) on a plain paragraph and press Enter, or
- Use the Insert toolbar (code block icon).

## Language Selection

A language selector appears in the code block toolbar. Choose from many supported languages. The default is `plaintext`.

You can also specify the language when creating the block:

````markdown
```python
def hello():
    print("Hello, world!")
```
````

## Syntax Highlighting

Code is highlighted using Lowlight, which supports a wide range of languages including JavaScript, TypeScript, Python, Rust, Go, HTML, CSS, SQL, JSON, YAML, and many more.

## Tab Behavior

Tab key inserts spaces (configurable in Settings under `markdown.tabSize`). The default is 2 spaces.

## Editing

Click inside a code block to edit. The block behaves like a text editor with proper indentation support. Standard copy/paste and undo/redo work as expected.

## Markdown Output

Code blocks save as standard fenced code blocks in Markdown:

````markdown
```typescript
const greeting = "Hello";
```
````

## See also

- [Math & Diagrams](math-diagrams.md) — Mermaid diagrams use fenced code blocks
- [Markdown Basics](markdown-basics.md) — Typora-style code fence creation
- [Tables](tables.md) — another structured block type
