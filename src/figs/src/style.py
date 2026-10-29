"""Shared settings of the figure scripts.

Every script in this folder draws one or more figures of the slides and writes them to src/figs/<name>.svg:

    .venv/bin/python src/figs/src/<script>.py

Math is typeset in Computer Modern, the LaTeX font, so that it looks like the formulas of the slides.
Set FIG_PREVIEW=<folder> to also write a PNG preview of each figure on the slide background.
"""
import os
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

FIGS = Path(__file__).resolve().parent.parent
BACKGROUND = "#002b36"  # moon theme: the slides' background, for previews only (the SVGs are transparent)

plt.rcParams.update({
    "mathtext.fontset": "cm",  # LaTeX look, never the default sans-serif math
    "svg.fonttype": "path",    # text as outlines: the figure looks the same everywhere
    "text.latex.preamble": r"\usepackage{amsmath,amssymb}",
})


def tex(target, x, y, s, **kw):
    """Draw s, typeset by LaTeX itself (needs a TeX installation): the best rendering for formulas.

    target is an Axes or a Figure; put the math of s between $...$, as in LaTeX.
    """
    return target.text(x, y, s, usetex=True, **kw)


def save(fig, name: str) -> Path:
    """Write src/figs/<name>.svg, transparent and cropped to its content."""
    out = FIGS / f"{name}.svg"
    fig.savefig(out, transparent=True, bbox_inches="tight")
    preview = os.environ.get("FIG_PREVIEW")
    if preview:
        fig.savefig(Path(preview) / f"{name}.png", dpi=80, bbox_inches="tight", facecolor=BACKGROUND)
    plt.close(fig)
    print(f"wrote {out.relative_to(FIGS.parent.parent)}")
    return out
