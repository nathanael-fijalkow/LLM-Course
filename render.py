#!/usr/bin/env python3
"""Render the lectures of src/ to slides/, notes/ and notebooks/.

Each lecture is one Quarto file, src/<deck>.qmd, which builds up to three outputs:
the slides (slides/<deck>.html), the lecture notes (notes/<deck>.html) and the
notebook (notebooks/<deck>.ipynb). Quarto writes them next to the source and
src/_post_render.py moves them to their folders.

    python3 render.py                    every lecture, every output
    python3 render.py 01 06              lectures 01 and 06 (a number or a name)
    python3 render.py 01 --slides        only the slides: seconds, since only the cells
                                         marked `#| eval: true` run
    python3 render.py --notes --notebook the notes and the notebooks (one cached execution)
    python3 render.py --stale            the lectures with an output older than the source
    python3 render.py --list             the lectures, their outputs and whether they are up to date
    python3 render.py --dry-run ...      print the commands without running them

The notes and the notebook share one cached execution of the lab (src/.jupyter_cache):
it runs again only when a code cell changes, and can then take several minutes.
Renders take a lock (/tmp/llm_mva_quarto.lock), so that parallel sessions do not
share the GPU and the cache at the same time.
"""

import argparse
import fcntl
import os
import re
import shutil
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SRC = ROOT / "src"
LOCK = Path("/tmp/llm_mva_quarto.lock")

# Quarto format -> (option, output folder, output suffix)
FORMATS = {
    "revealjs": ("slides", ROOT / "slides", ".html"),
    "html": ("notes", ROOT / "notes", ".html"),
    "ipynb": ("notebook", ROOT / "notebooks", ".ipynb"),
}


def decks():
    return sorted(SRC.glob("[0-9][0-9]_*.qmd"))


def formats_of(qmd):
    """The formats listed under `format:` in the front matter, in their order."""
    front = qmd.read_text().split("\n---", 1)[0]
    block = re.search(r"^format:\n((?:[ \t]+.*\n?)*)", front, re.M)
    return re.findall(r"^  (\w+):", block.group(1), re.M) if block else []


def output(qmd, fmt):
    _, folder, suffix = FORMATS[fmt]
    return folder / (qmd.stem + suffix)


def stale(qmd, fmts):
    return [f for f in fmts if not output(qmd, f).exists()
            or output(qmd, f).stat().st_mtime < qmd.stat().st_mtime]


def select(names):
    """Lectures from numbers ("1", "01") or names ("01_transformers_101", "transformers")."""
    if not names:
        return decks()
    chosen = []
    for name in names:
        stem = Path(name).stem
        hits = [d for d in decks() if d.stem == stem
                or (stem.isdigit() and d.stem.startswith(f"{int(stem):02d}_"))
                or (not stem.isdigit() and stem in d.stem)]
        if len(hits) != 1:
            sys.exit(f"'{name}' matches {len(hits)} lectures: use a number, e.g. 01 (see --list)")
        chosen += [d for d in hits if d not in chosen]
    return chosen


def list_decks():
    for qmd in decks():
        fmts = formats_of(qmd)
        old = stale(qmd, fmts)
        cells = ", ".join(FORMATS[f][0] + (" (stale)" if f in old else "") for f in fmts)
        print(f"{qmd.stem:32} {cells}")


def main():
    p = argparse.ArgumentParser(description=__doc__.split("\n\n")[0],
                                formatter_class=argparse.RawDescriptionHelpFormatter,
                                epilog="\n\n".join(__doc__.split("\n\n")[1:]))
    p.add_argument("decks", nargs="*", help="lecture numbers or names (default: all)")
    for fmt, (opt, _, _) in FORMATS.items():
        p.add_argument(f"--{opt}", dest="to", action="append_const", const=fmt,
                       help=f"render the {opt} (default: every output the lecture lists)")
    p.add_argument("--stale", action="store_true", help="only lectures with an output older than the source")
    p.add_argument("--list", action="store_true", help="list the lectures and their outputs")
    p.add_argument("--dry-run", action="store_true", help="print the commands without running them")
    args = p.parse_args()

    if args.list:
        return list_decks()
    quarto = shutil.which("quarto") or sys.exit("quarto not found: see https://quarto.org/docs/get-started/")
    python = ROOT / ".venv" / "bin" / "python"
    env = dict(os.environ, QUARTO_PYTHON=str(python)) if python.exists() else dict(os.environ)

    jobs = []
    for qmd in select(args.decks):
        fmts = formats_of(qmd)
        wanted = [f for f in fmts if f in (args.to or fmts)]
        if args.stale:
            wanted = [f for f in wanted if f in stale(qmd, fmts)]
        if wanted:
            jobs.append((qmd, wanted, wanted == fmts))
    if not jobs:
        return print("Nothing to render.")

    failed = []
    for qmd, wanted, everything in jobs:
        cmd = [quarto, "render", str(qmd.relative_to(ROOT))]
        if not everything:
            # One `--to` per format; the slides last, as in the front matter of the lectures
            cmd = [cmd + ["--to", f] for f in sorted(wanted, key=lambda f: f == "revealjs")]
        else:
            cmd = [cmd]
        for c in cmd:
            print("$", " ".join(Path(x).name if x == quarto else x for x in c), flush=True)
            if args.dry_run:
                continue
            start = time.time()
            with open(LOCK, "w") as lock:
                fcntl.flock(lock, fcntl.LOCK_EX)
                code = subprocess.run(c, cwd=ROOT, env=env).returncode
            print(f"  {'ok' if code == 0 else f'FAILED (exit {code})'} in {time.time() - start:.0f} s", flush=True)
            if code:
                failed.append(qmd.stem)
                break
    if failed:
        sys.exit(f"Failed: {', '.join(failed)}")


if __name__ == "__main__":
    main()
