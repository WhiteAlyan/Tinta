# Tinta — Codebase Notes

Historical context for the codebase, extracted from the source
files by `scripts/extract_codebase_notes.py`. Each block was
originally an inline comment in the source file at the line range
shown; it has been replaced in the source with a single-line
cross-reference pointing back to its section here.

Why this exists: the codebase had ~30% comments, with many being
"Bug-report fix — ..." history blocks explaining why code is the
way it is. That context is valuable (especially for future contributors)
but it had grown bigger than the code itself in places. Moving the
historical narrative into one .md file keeps the code readable while
preserving the "why" trail in a single, scannable document.

How to use:
- **Reading code?** The `// Historical context: see docs/CODEBASE_NOTES.md#...`
  line at the top of a block points you to its full original comment here.
- **Editing code?** Add new inline comments as needed; re-run
  `scripts/extract_codebase_notes.py` to refresh this file.
- The .md is checked into git alongside the source files.

## File tree

Files with extracted comment blocks (count of blocks):


---

## Per-file notes
