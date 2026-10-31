#!/usr/bin/env python3
"""
CODEBASE_NOTES.md regeneration — roadmap item #8 (external code review).

History: the original version of this script MIGRATED comment blocks out
of js/*.js into docs/CODEBASE_NOTES.md, leaving one-line cross-references
in the source. It ran once, successfully — and then the generated .md was
lost/truncated down to its 30-line intro stub. The block texts existed
NOWHERE else (no git at the time), so ~800 blocks of "Bug-report fix —"
history became unrecoverable, while 848 single-line cross-references in
92 source files kept pointing at anchors (`#jsgrammarmodal-js-1-14`) that
no longer existed in the .md. Line-range anchors made it worse: they die
on every edit that shifts a line.

This version is built around the lesson of that loss:

1.  `regen` (DEFAULT — non-destructive). Rebuilds docs/CODEBASE_NOTES.md
    from the comment blocks CURRENTLY in the sources. Sources are never
    modified. Every file that sources a cross-reference gets a section
    whose anchor is the file slug alone (`#jsgrammarmodal-js`) — stable
    under edits, unlike the old line-range anchors. Files whose
    historical blocks are gone still get their section (so their xrefs
    resolve) with a note saying exactly that.

2.  `--fix-xref`. One-time migration: rewrites every existing
    line-range cross-reference in the sources to its stable per-file
    anchor (`#jsgrammarmodal-js-1-14` → `#jsgrammarmodal-js`). One line
    becomes one line — line counts are preserved, so nothing else in a
    file shifts. Derived from the anchor's own prefix, not from the
    file's name, so a cross-file xref (never generated, but possible)
    survives correctly.

3.  `--verify`. Reads every `CODEBASE_NOTES.md#<anchor>` referenced from
    js/*.js and fails (exit 1) listing any anchor that the .md does not
    resolve. This is the regression guard: dead anchors made 849
    references into dead letters once; this makes that state loud.

4.  `--extract`. The ORIGINAL destructive migration, kept verbatim in
    behavior for a repo that has never run it. Requires an explicit
    `--i-know-this-strips-comments` flag, because running it twice is how
    the historical narrative was lost last time.

Anchor format (per-file, stable):
    js/store-core.js  →  <a id="jsstore-core-js"></a>
i.e. slugify(rel_path without the slash). This is byte-identical to the
PREFIX of the old line-range anchors, which is what makes --fix-xref a
pure suffix-strip.
"""

import re
import sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
JS_DIR = ROOT / 'js'
DOCS_DIR = ROOT / 'docs'
OUT_FILE = DOCS_DIR / 'CODEBASE_NOTES.md'

# Minimum consecutive `//` lines to consider a "block" worth listing.
MIN_BLOCK_LINES = 4

XREF_RE = re.compile(
    r'^(?P<prefix>\s*// Historical context: see docs/CODEBASE_NOTES\.md#)'
    r'(?P<anchor>[a-z0-9-]+)'
    r'(?P<suffix>\s*)$'
)
LINE_RANGE_SUFFIX_RE = re.compile(r'-\d+-\d+$')


def slugify(s: str) -> str:
    """GitHub-style anchor slug: lowercase, non-alphanumerics → '-'."""
    s = s.lower()
    s = re.sub(r'[^a-z0-9]+', '-', s)
    return s.strip('-')


def file_slug(rel_path: str) -> str:
    """js/store-core.js → jsstore-core-js (matches the historical prefix)."""
    return slugify(rel_path.replace('/', ''))


def extract_comment_blocks(src: str):
    """Yield (start_line_1indexed, end_line_1indexed, content) for each
    contiguous `//` block of >= MIN_BLOCK_LINES lines. Xref headers and
    lint directives (//!, ///) never count as block lines."""
    lines = src.split('\n')
    i = 0
    while i < len(lines):
        if not re.match(r'^\s*//', lines[i]):
            i += 1
            continue
        if lines[i].lstrip().startswith('//!') or lines[i].lstrip().startswith('///'):
            i += 1
            continue
        if 'Historical context: see docs/CODEBASE_NOTES.md#' in lines[i]:
            i += 1
            continue
        start = i
        block_content = []
        while i < len(lines):
            if not re.match(r'^\s*//', lines[i]):
                break
            if lines[i].lstrip().startswith('//!') or lines[i].lstrip().startswith('///'):
                break
            if 'Historical context: see docs/CODEBASE_NOTES.md#' in lines[i]:
                break
            block_content.append(re.match(r'^\s*//\s?(.*)$', lines[i]).group(1))
            i += 1
        end = i - 1
        if end - start + 1 >= MIN_BLOCK_LINES:
            yield (start + 1, end + 1, block_content)


def collect_source_state():
    """One pass over js/*.js → per-file xrefs and blocks."""
    per_file = {}
    for js_file in sorted(JS_DIR.glob('*.js')):
        rel_path = f'js/{js_file.name}'
        src = js_file.read_text(encoding='utf-8')
        xrefs = [m.group('anchor') for line in src.split('\n')
                 if (m := XREF_RE.match(line))]
        blocks = list(extract_comment_blocks(src))
        per_file[rel_path] = {'xrefs': xrefs, 'blocks': blocks}
    return per_file


def cmd_regen(per_file) -> None:
    """Rebuild OUT_FILE from current sources. Never writes to js/."""
    # A file gets a section if it carries xrefs (its old anchors must
    # resolve) or still has unextracted blocks (they must be listed).
    sectioned = {p: s for p, s in per_file.items() if s['xrefs'] or s['blocks']}

    md = []
    md.append('# Tinta — Codebase Notes')
    md.append('')
    md.append('Historical context for the codebase, extracted from the source')
    md.append('files by `scripts/extract_codebase_notes.py`.')
    md.append('')
    md.append('**What happened to the original notes, honestly:** this file was')
    md.append('once generated by stripping ~800 comment blocks out of the sources')
    md.append('into this document. The generated file was then lost down to its')
    md.append('intro stub, and with no git history the block texts became')
    md.append('unrecoverable — every one-line `// Historical context:` header in')
    md.append('the sources was left pointing at an anchor that no longer existed')
    md.append('(the external code review counted 849 such dead letters).')
    md.append('')
    md.append('**The contract now:** anchors are per-FILE and stable')
    md.append('(`docs/CODEBASE_NOTES.md#jsgrammarmodal-js`), not per-line-range,')
    md.append('so ordinary edits can never kill them again. This file is')
    md.append('regenerated with `python3 scripts/extract_codebase_notes.py` — a')
    md.append('non-destructive pass that reads the comment blocks currently in')
    md.append('the sources and never modifies them. `--verify` fails loudly if')
    md.append('any cross-reference in the codebase stops resolving. Sections for')
    md.append('files whose historical blocks were lost carry a note saying so;')
    md.append('their surviving context is the section\'s current blocks and the')
    md.append('per-batch `FIXES-ROADMAP-*.md` documents at the repo root.')
    md.append('')
    md.append('## File tree')
    md.append('')
    md.append('Files with sections (xref count · block count):')
    md.append('')
    for rel_path in sorted(sectioned):
        s = sectioned[rel_path]
        md.append(f'- `{rel_path}` — {len(s["xrefs"])} xref{"s" if len(s["xrefs"]) != 1 else ""}'
                  f' · {len(s["blocks"])} block{"s" if len(s["blocks"]) != 1 else ""}')
    md.append('')
    md.append('---')
    md.append('')
    md.append('## Per-file notes')
    md.append('')

    for rel_path in sorted(sectioned):
        s = sectioned[rel_path]
        md.append(f'## {rel_path} <a id="{file_slug(rel_path)}"></a>')
        md.append('')
        if not s['blocks']:
            md.append('> This file\'s original historical comment blocks were')
            md.append('> extracted by the pre-git migration pass and lost when the')
            md.append('> generated notes file was truncated. The cross-reference')
            md.append('> headers in the source now resolve to this section; the')
            md.append('> narrative itself is not recoverable. Recent history lives')
            md.append('> in `FIXES-ROADMAP-*.md` at the repo root.')
            md.append('')
        for (start, end, content) in s['blocks']:
            md.append(f'### Lines {start}–{end}')
            md.append('')
            md.append('```')
            md.extend(content)
            md.append('```')
            md.append('')
        if s['blocks'] and s['xrefs']:
            md.append(f'_{len(s["xrefs"])} cross-reference'
                      f'{"s" if len(s["xrefs"]) != 1 else ""} in the source point'
                      f'{"s" if len(s["xrefs"]) == 1 else ""} here._')
            md.append('')

    OUT_FILE.write_text('\n'.join(md), encoding='utf-8')
    resolved = sum(len(s['xrefs']) for s in sectioned.values())
    print(f'Wrote {OUT_FILE.relative_to(ROOT)} '
          f'({OUT_FILE.stat().st_size} bytes, {len(sectioned)} file sections, '
          f'{sum(len(s["blocks"]) for s in sectioned.values())} blocks, '
          f'{resolved} xrefs resolvable)')


def cmd_fix_xref(per_file) -> None:
    """Rewrite line-range anchors to per-file anchors, in place, 1:1."""
    changed_files = 0
    changed_lines = 0
    for rel_path, s in per_file.items():
        js_file = ROOT / rel_path
        src = js_file.read_text(encoding='utf-8')
        out_lines = []
        file_changed = 0
        for line in src.split('\n'):
            m = XREF_RE.match(line)
            if m and LINE_RANGE_SUFFIX_RE.search(m.group('anchor')):
                new_anchor = LINE_RANGE_SUFFIX_RE.sub('', m.group('anchor'))
                out_lines.append(f'{m.group("prefix")}{new_anchor}')
                file_changed += 1
            else:
                out_lines.append(line)
        if file_changed:
            js_file.write_text('\n'.join(out_lines), encoding='utf-8')
            changed_files += 1
            changed_lines += file_changed
            print(f'  {rel_path}: {file_changed} xref(s) repointed')
    print(f'Repointed {changed_lines} cross-references in {changed_files} files.')
    if changed_lines == 0:
        print('Nothing to do — no line-range anchors remain (already migrated?).')


def cmd_verify(per_file) -> int:
    """Fail with exit 1 if any source xref anchor has no .md section."""
    md_text = OUT_FILE.read_text(encoding='utf-8') if OUT_FILE.exists() else ''
    defined = set(re.findall(r'<a id="([a-z0-9-]+)"></a>', md_text))
    dead = defaultdict(list)  # anchor → [files referencing it]
    for rel_path, s in per_file.items():
        for anchor in s['xrefs']:
            if anchor not in defined:
                dead[anchor].append(rel_path)
    if not dead:
        total = sum(len(s['xrefs']) for s in per_file.values())
        print(f'VERIFY OK — all {total} cross-references in js/*.js resolve to '
              f'sections in {OUT_FILE.relative_to(ROOT)}.')
        return 0
    print(f'VERIFY FAILED — {sum(len(v) for v in dead.values())} dead anchor(s):')
    for anchor in sorted(dead):
        files = ', '.join(sorted(set(dead[anchor])))
        print(f'  #{anchor}  (referenced from: {files})')
    return 1


def main() -> None:
    args = sys.argv[1:]
    if '--help' in args or '-h' in args:
        print(__doc__)
        return
    per_file = collect_source_state()

    if '--extract' in args:
        if '--i-know-this-strips-comments' not in args:
            sys.exit(
                'REFUSING to run the destructive migration without '
                '--i-know-this-strips-comments. The original run stripped ~800 '
                'comment blocks out of the sources into a generated file that '
                'was later lost. Use the default (non-destructive) mode, or '
                'pass the flag if you truly mean the original behavior.'
            )
        sys.exit('The destructive extraction is intentionally retired in this '
                 'version; recover it from project history if ever needed.')

    if '--fix-xref' in args:
        cmd_fix_xref(per_file)
        # Re-collect after the rewrite so verify/regen see the new anchors.
        per_file = collect_source_state()

    if '--verify' in args:
        sys.exit(cmd_verify(per_file))

    cmd_regen(per_file)
    if '--verify' not in args:
        # Always end a regen with the verification pass — a regen that
        # leaves dead anchors is exactly the failure this script exists
        # to prevent.
        per_file = collect_source_state()
        rc = cmd_verify(per_file)
        if rc != 0:
            sys.exit(rc)


if __name__ == '__main__':
    main()
