#!/usr/bin/env python3
"""
Comment archaeology migration — extracts long comment blocks from js/*.js
into a single docs/CODEBASE_NOTES.md file, leaving a cross-reference
header at the top of each source file pointing to its section in the .md.

The goal: the codebase has ~30% comments — many of them "Bug-report
fix — ..." history blocks that explain why code is the way it is. That
context is valuable but it's now bigger than the code itself in places.
This script:

1. Walks js/*.js, finding contiguous comment blocks (4+ consecutive
   `// ...` lines).
2. For each block, records:
   - The source file (relative path)
   - The line range it came from (1-indexed, [start, end])
   - The block's content (stripped of the leading `//`)
3. Writes a docs/CODEBASE_NOTES.md file with:
   - A file-tree overview section (so a reader can scan which files
     have notes)
   - Per-file sections with each extracted block
4. Replaces each extracted comment block in the source file with a
   single-line cross-reference:
   // Historical context: see docs/CODEBASE_NOTES.md#jsnotesviewjs-99-105

What this does NOT do:
- Doesn't touch short inline comments (`const x = 1; // short inline`)
- Doesn't touch JSDoc /** ... */ blocks (those are part of the public
  API contract for export functions and stay with the code)
- Doesn't reorder code or restructure files
- Doesn't touch CSS or HTML files (the user's spec was "codebase",
  which in this project means the JS modules)

Idempotent: re-running on an already-migrated file is a no-op (it
extracts the cross-reference headers but finds no new blocks).
"""

import os
import re
import sys
from pathlib import Path
from collections import defaultdict


ROOT = Path(__file__).resolve().parent.parent
JS_DIR = ROOT / 'js'
DOCS_DIR = ROOT / 'docs'
OUT_FILE = DOCS_DIR / 'CODEBASE_NOTES.md'

# Minimum consecutive `//` lines to consider a "block" worth extracting.
# A single `// foo` or two-line `// foo\n// bar` is just inline commentary
# — keep it. Anything 4+ lines is "archaeology" worth moving out.
MIN_BLOCK_LINES = 4


def extract_comment_blocks(src: str):
    """Yield (start_line_1indexed, end_line_1indexed, content) tuples
    for each contiguous comment block of >= MIN_BLOCK_LINES lines.

    Idempotent: skips blocks that are already cross-reference headers
    (lines matching `// Historical context: see docs/CODEBASE_NOTES.md#...`).
    This makes re-running the script on an already-migrated codebase a
    true no-op — previously it would re-extract the xref header lines
    themselves as new "blocks" and duplicate them."""
    lines = src.split('\n')
    i = 0
    while i < len(lines):
        # Match a `// ...` line (with optional leading whitespace).
        # Skip `//!` and `///` (lint directives).
        m = re.match(r'^(\s*)//\s?(.*)$', lines[i])
        if not m or lines[i].lstrip().startswith('//!') or lines[i].lstrip().startswith('///'):
            i += 1
            continue
        # Skip xref headers — these are single-line replacements from a
        # prior run; they're not real comment blocks to extract.
        if 'Historical context: see docs/CODEBASE_NOTES.md#' in lines[i]:
            i += 1
            continue
        # We're at the start of a comment block — find the end
        start = i
        block_content = []
        while i < len(lines):
            mm = re.match(r'^\s*//\s?(.*)$', lines[i])
            if not mm:
                break
            # Skip lint directives
            if lines[i].lstrip().startswith('//!') or lines[i].lstrip().startswith('///'):
                break
            # Stop if we hit an xref header — it's a replacement line,
            # not part of this block.
            if 'Historical context: see docs/CODEBASE_NOTES.md#' in lines[i]:
                break
            block_content.append(mm.group(1))
            i += 1
        end = i - 1
        if end - start + 1 >= MIN_BLOCK_LINES:
            yield (start + 1, end + 1, block_content)


def slugify(s: str) -> str:
    """GitHub-style anchor slug: lowercase, replace non-alphanumeric
    with -, strip leading/trailing dashes."""
    s = s.lower()
    s = re.sub(r'[^a-z0-9]+', '-', s)
    s = s.strip('-')
    return s


def build_file_tree(per_file_blocks: dict) -> str:
    """A markdown file tree showing which files have notes."""
    lines = ['## File tree', '']
    lines.append('Files with extracted comment blocks (count of blocks):')
    lines.append('')
    for rel_path in sorted(per_file_blocks.keys()):
        blocks = per_file_blocks[rel_path]
        lines.append(f'- `{rel_path}` — {len(blocks)} block{"s" if len(blocks) != 1 else ""}')
    lines.append('')
    return '\n'.join(lines)


def build_per_file_section(rel_path: str, blocks: list) -> str:
    """Build the per-file markdown section with each extracted block."""
    file_slug = slugify(rel_path.replace('/', ''))
    lines = [f'## {rel_path}', '']
    for (start, end, content) in blocks:
        block_slug = f'{file_slug}-{start}-{end}'
        lines.append(f'### Lines {start}\u2013{end} <a id="{block_slug}"></a>')
        lines.append('')
        lines.append('```')
        lines.extend(content)
        lines.append('```')
        lines.append('')
    return '\n'.join(lines)


def replace_blocks_with_xref(src: str, blocks: list, rel_path: str) -> str:
    """Replace each extracted comment block in src with a single-line
    cross-reference header. Blocks are sorted by start line descending
    so we can splice from the end backward without shifting the indices
    of earlier blocks."""
    lines = src.split('\n')
    file_slug = slugify(rel_path.replace('/', ''))
    for (start, end, _content) in sorted(blocks, key=lambda b: -b[0]):
        start0 = start - 1
        end0 = end - 1
        anchor = f'{file_slug}-{start}-{end}'
        xref = f'// Historical context: see docs/CODEBASE_NOTES.md#{anchor}'
        lines[start0:end0 + 1] = [xref]
    return '\n'.join(lines)


def main():
    if not JS_DIR.is_dir():
        print(f'ERROR: {JS_DIR} does not exist', file=sys.stderr)
        sys.exit(1)
    DOCS_DIR.mkdir(parents=True, exist_ok=True)

    per_file_blocks = defaultdict(list)
    file_contents = {}

    for js_file in sorted(JS_DIR.glob('*.js')):
        rel_path = f'js/{js_file.name}'
        src = js_file.read_text(encoding='utf-8')
        file_contents[rel_path] = src
        for (start, end, content) in extract_comment_blocks(src):
            per_file_blocks[rel_path].append((start, end, content))

    total_blocks = sum(len(v) for v in per_file_blocks.values())
    print(f'Extracted {total_blocks} comment blocks from {len(per_file_blocks)} files')

    md_parts = [
        '# Tinta \u2014 Codebase Notes',
        '',
        'Historical context for the codebase, extracted from the source',
        'files by `scripts/extract_codebase_notes.py`. Each block was',
        'originally an inline comment in the source file at the line range',
        'shown; it has been replaced in the source with a single-line',
        'cross-reference pointing back to its section here.',
        '',
        'Why this exists: the codebase had ~30% comments, with many being',
        '"Bug-report fix \u2014 ..." history blocks explaining why code is the',
        'way it is. That context is valuable (especially for future contributors)',
        'but it had grown bigger than the code itself in places. Moving the',
        'historical narrative into one .md file keeps the code readable while',
        'preserving the "why" trail in a single, scannable document.',
        '',
        'How to use:',
        '- **Reading code?** The `// Historical context: see docs/CODEBASE_NOTES.md#...`',
        '  line at the top of a block points you to its full original comment here.',
        '- **Editing code?** Add new inline comments as needed; re-run',
        '  `scripts/extract_codebase_notes.py` to refresh this file.',
        '- The .md is checked into git alongside the source files.',
        '',
    ]
    md_parts.append(build_file_tree(per_file_blocks))
    md_parts.append('---')
    md_parts.append('')
    md_parts.append('## Per-file notes')
    md_parts.append('')

    for rel_path in sorted(per_file_blocks.keys()):
        blocks = per_file_blocks[rel_path]
        if not blocks:
            continue
        md_parts.append(build_per_file_section(rel_path, blocks))

    OUT_FILE.write_text('\n'.join(md_parts), encoding='utf-8')
    print(f'Wrote {OUT_FILE.relative_to(ROOT)} ({OUT_FILE.stat().st_size} bytes)')

    for rel_path, src in file_contents.items():
        blocks = per_file_blocks[rel_path]
        if not blocks:
            continue
        new_src = replace_blocks_with_xref(src, blocks, rel_path)
        js_file = ROOT / rel_path
        js_file.write_text(new_src, encoding='utf-8')
        print(f'  {rel_path}: replaced {len(blocks)} block(s) with xref headers')


if __name__ == '__main__':
    main()
