#!/usr/bin/env python3
"""
Removes every top-level CSS rule (and rules nested inside @media blocks)
whose selector list references .casino-grid or .casino-card (as a class
token, e.g. .casino-card, .casino-card__logo, .casino-grid-wrapper,
.casino-grid > .casino-card, etc.) — including their pseudo-classes,
descendant/child selectors, :where() blocks, and any comment immediately
preceding the rule.

It does NOT touch rules that merely mention .casino-card / .casino-grid
as part of a comma-separated list alongside unrelated selectors like
.news-card, .feature-card — those selectors are split, the casino-* part
is dropped, and the rest of the selector list is kept (so unrelated
components such as .news-card keep their styling).

Leaves an empty @media block behind removed, and cleans up resulting
double-blank-lines.

Usage: python3 strip_casino_css.py <file.css> [--apply]
Without --apply it only prints what WOULD be removed (dry run).
"""
import sys, re

CASINO_TOKEN = re.compile(r'\.casino-(grid|card)(?=[^a-zA-Z0-9]|$)')

def split_top_level(text):
    """Split CSS text into a list of (kind, content) chunks: comments,
    at-rule blocks, normal rule blocks, and stray whitespace, tracking
    brace depth so nested @media rules are captured whole."""
    chunks = []
    i, n = 0, len(text)
    buf_start = 0
    depth = 0
    while i < n:
        if text[i:i+2] == '/*':
            end = text.find('*/', i+2)
            end = n if end == -1 else end+2
            if depth == 0:
                chunks.append(('comment', text[buf_start:end]))
                buf_start = end
            i = end
            continue
        if text[i] == '{':
            depth += 1
            i += 1
            continue
        if text[i] == '}':
            depth -= 1
            i += 1
            if depth == 0:
                chunks.append(('rule', text[buf_start:i]))
                buf_start = i
            continue
        if depth == 0 and text[i] == ';':
            # stray semicolon at top level (rare) - ignore
            i += 1
            continue
        i += 1
    if buf_start < n:
        tail = text[buf_start:]
        if tail.strip():
            chunks.append(('trailing', tail))
        else:
            chunks.append(('ws', tail))
    return chunks

def is_at_media(rule_text):
    header = rule_text.split('{', 1)[0].strip()
    return header.startswith('@media') or header.startswith('@supports')

def process_rule(rule_text):
    """Given a full 'selector { ... }' or '@media (...) { inner }' chunk,
    return (kept_text_or_None, removed_bool, note)."""
    brace = rule_text.find('{')
    header = rule_text[:brace]
    body = rule_text[brace+1:rule_text.rfind('}')]

    if is_at_media(rule_text):
        inner_chunks = split_top_level(body)
        new_inner = []
        removed_any = False
        for kind, chunk in inner_chunks:
            if kind == 'rule' and not is_at_media(chunk):
                kept, removed, _ = process_rule(chunk)
                if removed:
                    removed_any = True
                if kept is not None:
                    new_inner.append(kept)
            elif kind == 'rule':  # nested @media (rare) - recurse
                kept, removed, _ = process_rule(chunk)
                if removed:
                    removed_any = True
                if kept is not None:
                    new_inner.append(kept)
            else:
                new_inner.append(chunk)
        new_body = ''.join(new_inner)
        # if nothing but whitespace/comments left, drop whole @media
        if not re.search(r'[a-zA-Z0-9.#\[:*&]\s*\{', new_body):
            return None, True, 'dropped empty @media'
        if removed_any:
            return header + '{' + new_body + '}', True, 'trimmed @media'
        return rule_text, False, ''

    # Normal rule: split selector list on top-level commas
    selectors = [s.strip() for s in header.split(',')]
    kept_selectors = [s for s in selectors if not CASINO_TOKEN.search(s)]
    if len(kept_selectors) == len(selectors):
        return rule_text, False, ''  # nothing casino-related here
    if not kept_selectors:
        return None, True, 'removed rule: ' + header.strip().replace('\n', ' ')[:80]
    new_header = ',\n'.join(kept_selectors)
    return new_header + ' {' + body + '}', True, 'trimmed selector list: ' + header.strip().replace('\n',' ')[:80]

def main():
    if len(sys.argv) < 2:
        print(__doc__); sys.exit(1)
    path = sys.argv[1]
    apply = '--apply' in sys.argv[2:]
    with open(path, encoding='utf-8') as f:
        text = f.read()

    chunks = split_top_level(text)
    out = []
    log = []
    pending_comment = None
    for kind, chunk in chunks:
        if kind == 'comment':
            pending_comment = chunk
            continue
        if kind == 'rule':
            kept, removed, note = process_rule(chunk)
            if removed and note.startswith('removed rule') and pending_comment and CASINO_TOKEN.search(pending_comment) is None and re.search(r'CASINO|CARD', pending_comment, re.I):
                # drop a section-header comment that only existed to label
                # the block we just removed entirely
                pending_comment = None
            if pending_comment is not None:
                out.append(pending_comment)
                pending_comment = None
            if kept is not None:
                out.append(kept)
            if removed:
                log.append(note)
            continue
        # trailing / ws
        if pending_comment is not None:
            out.append(pending_comment)
            pending_comment = None
        out.append(chunk)
    if pending_comment is not None:
        out.append(pending_comment)

    new_text = ''.join(out)
    new_text = re.sub(r'\n{4,}', '\n\n\n', new_text)

    print(f"=== {path}: {len(log)} casino-grid/casino-card rule(s) affected ===")
    for l in log:
        print(' -', l)
    print()

    if apply:
        with open(path, 'w', encoding='utf-8') as f:
            f.write(new_text)
        print(f"Applied. New size: {len(new_text)} bytes (was {len(text)} bytes).")
    else:
        out_path = path + '.stripped-preview'
        with open(out_path, 'w', encoding='utf-8') as f:
            f.write(new_text)
        print(f"Dry run only. Preview written to {out_path}. Re-run with --apply to overwrite {path}.")

if __name__ == '__main__':
    main()
