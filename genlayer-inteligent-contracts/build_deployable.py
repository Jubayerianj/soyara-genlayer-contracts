#!/usr/bin/env python3
"""
Produce a compact, deployable build of AgentValidator.py.

WHY THIS EXISTS
---------------
An Intelligent Contract is deployed as SOURCE: the whole file becomes
transaction calldata. GenLayer Chain is a ZK Stack chain with a per-block
pubdata limit, and the annotated contract is ~99 KB, which the network refuses
with `BlockPubdataLimitReached` before it ever reaches consensus.

The comments in AgentValidator.py are not decoration - they record why the
settlement binding is shaped the way it is, which parameters were previously
unbound, and which GenLayer APIs are deliberately avoided. Deleting them to fit
would lose the reasoning permanently. So the annotated file stays the source of
truth in the repository, and this script mechanically produces the artifact that
goes on chain.

WHAT IT REMOVES
---------------
Comments and docstrings, and nothing else. Tokenising rather than regexing means
a `#` inside a string literal is left alone, and docstrings are located by AST
position so only genuine ones are dropped - a bare string used as a value is
untouched.

The `# { "Depends": ... }` runner pin on line 1 is load-bearing and is always
preserved.

USAGE
-----
    python3 build_deployable.py            # writes build/AgentValidator.min.py
    python3 build_deployable.py --check    # verify the build parses and matches
"""

import ast
import io
import os
import sys
import tokenize

HERE = os.path.dirname(os.path.abspath(__file__))
SOURCE = os.path.join(HERE, "AgentValidator.py")
OUT_DIR = os.path.join(HERE, "build")
OUT = os.path.join(OUT_DIR, "AgentValidator.min.py")


def docstring_line_ranges(tree):
    """1-indexed (start, end) line spans of every docstring in the module."""
    spans = []
    for node in ast.walk(tree):
        if not isinstance(node, (ast.Module, ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
            continue
        body = getattr(node, "body", None)
        if not body:
            continue
        first = body[0]
        if (
            isinstance(first, ast.Expr)
            and isinstance(first.value, ast.Constant)
            and isinstance(first.value.value, str)
        ):
            # Never strip a lone docstring that IS the whole body - removing it
            # would leave an empty block and a SyntaxError.
            if len(body) == 1:
                continue
            spans.append((first.lineno, first.end_lineno))
    return spans


def strip(source: str) -> str:
    tree = ast.parse(source)
    doc_lines = set()
    for start, end in docstring_line_ranges(tree):
        doc_lines.update(range(start, end + 1))

    # Drop comment tokens, keeping the Depends pin on line 1.
    kept = []
    readline = io.StringIO(source).readline
    for tok in tokenize.generate_tokens(readline):
        if tok.type == tokenize.COMMENT and tok.start[0] != 1:
            continue
        kept.append(tok)
    decommented = tokenize.untokenize(kept)

    out = []
    for index, line in enumerate(decommented.splitlines(), start=1):
        if index in doc_lines:
            continue
        if not line.strip():
            continue
        out.append(line.rstrip())

    return "\n".join(out) + "\n"


def main() -> int:
    source = open(SOURCE).read()
    built = strip(source)

    # The build must be a valid module, and must expose the same public surface.
    try:
        built_tree = ast.parse(built)
    except SyntaxError as e:
        print(f"FAILED: stripped build does not parse: line {e.lineno}: {e.msg}")
        return 1

    def public_surface(tree):
        names = set()
        for node in ast.walk(tree):
            if isinstance(node, (ast.FunctionDef, ast.ClassDef)):
                names.add(node.name)
        return names

    missing = public_surface(ast.parse(source)) - public_surface(built_tree)
    if missing:
        print(f"FAILED: build lost definitions: {sorted(missing)}")
        return 1

    if not built.startswith('# { "Depends"'):
        print("FAILED: the Depends runner pin was not preserved on line 1")
        return 1

    if "--check" in sys.argv:
        print(f"OK  build parses, {len(public_surface(built_tree))} definitions preserved")
        print(f"    {len(source):,} bytes -> {len(built):,} bytes "
              f"({100 * len(built) / len(source):.0f}%)")
        return 0

    os.makedirs(OUT_DIR, exist_ok=True)
    open(OUT, "w").write(built)
    print(f"wrote {OUT}")
    print(f"  {len(source):,} bytes -> {len(built):,} bytes "
          f"({100 * len(built) / len(source):.0f}%)")
    print(f"  {len(public_surface(built_tree))} definitions preserved")
    return 0


if __name__ == "__main__":
    sys.exit(main())
