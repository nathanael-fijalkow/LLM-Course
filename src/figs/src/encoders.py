"""Draw the bi-encoder figure and its late-interaction variant.

python encoders_fig.py bi out.svg     -> q and d encoded independently by the same f, one vector each, dot product
python encoders_fig.py late out.svg   -> same layout, one vector per token, MaxSim
"""
import matplotlib
import style  # Agg backend, LaTeX-style math, SVG text as outlines
import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch, Rectangle, Circle


def draw(mode):
    fg, accent, hot, node, muted, green = "#eee8d5", "#268bd2", "#cb4b16", "#073642", "#93a1a1", "#859900"

    fig, ax = plt.subplots(figsize=(12, 3.9), facecolor="none")
    ax.set_facecolor("none"); ax.set_aspect("equal"); ax.axis("off")

    Y = 1.25
    rows = [  # (y, input text, number of tokens, name of the output, colour)
        (Y, "“How does\nattention work?”", 3, "q", hot),
        (-Y, "“The attention\nmechanism…”", 4, "d", accent),
    ]
    fx, fw, fh = 3.0, 1.4, 0.95      # encoder box
    vx = 5.3                         # start of the output vectors
    cell = 0.36

    def vector(x, y, colour, n=6, vertical=False):
        """A vector drawn as n cells, horizontal or vertical, centred on y."""
        shades = [0.9, 0.35, 0.65, 0.2, 0.8, 0.5, 0.3, 0.7]
        for i in range(n):
            xy = (x, y + (n / 2 - 1 - i) * cell) if vertical else (x + i * cell, y - cell / 2)
            ax.add_patch(Rectangle(xy, cell, cell, fc=colour, ec=fg, lw=0.6, alpha=shades[i % len(shades)], zorder=2))

    ends = []
    for y, text, n, name, colour in rows:
        ax.text(2.2, y, text, ha="right", va="center", fontsize=20, color=fg, style="italic", linespacing=1.2)
        ax.annotate("", xy=(fx - 0.08, y), xytext=(2.3, y), arrowprops=dict(arrowstyle="-|>", color=fg, lw=2), zorder=1)
        ax.add_patch(FancyBboxPatch((fx, y - fh / 2), fw, fh, boxstyle="round,pad=0.05", fc=node, ec=green, lw=2.6, zorder=2))
        ax.text(fx + fw / 2, y, "$f$", ha="center", va="center", fontsize=30, color=fg, zorder=3)
        ax.annotate("", xy=(vx - 0.12, y), xytext=(fx + fw + 0.1, y), arrowprops=dict(arrowstyle="-|>", color=fg, lw=2), zorder=1)
        if mode == "bi":
            vector(vx, y, colour)
            ax.text(vx + 3 * cell, y + (0.32 if y > 0 else -0.32), f"$f({name})$", ha="center",
                    va="bottom" if y > 0 else "top", fontsize=22, color=colour)
            ends.append((vx + 6 * cell, y))
        else:
            gap = 0.72
            for k in range(n):
                x = vx + k * gap
                vector(x, y, colour, n=4, vertical=True)
                sub = str(k + 1) if k < n - 1 else ("m" if name == "q" else "n")   # the deck's q_1..q_m, d_1..d_n
                ax.text(x + cell / 2, y + (2 * cell + 0.12) * (1 if y > 0 else -1), f"${name}_{sub}$", ha="center",
                        va="bottom" if y > 0 else "top", fontsize=20, color=colour)
            ends.append((vx + (n - 1) * gap + cell, y))

    # same encoder, applied twice
    ax.plot([fx + fw / 2] * 2, [-Y + fh / 2 + 0.1, Y - fh / 2 - 0.1], color=green, lw=2, ls=(0, (4, 3)))
    ax.text(fx + fw / 2 + 0.22, 0, "same encoder,\napplied separately", ha="left", va="center", fontsize=19, color=green,
            linespacing=1.2)

    # comparison
    cx = 10.4
    if mode == "bi":
        r = 0.48
        ax.add_patch(Circle((cx, 0), r, fc=node, ec=fg, lw=2, zorder=2))
        ax.add_patch(Circle((cx, 0), 0.085, fc=fg, ec="none", zorder=3))   # the dot product
        left, right = cx - r, cx + r
    else:
        ax.add_patch(FancyBboxPatch((cx - 0.95, -0.38), 1.9, 0.76, boxstyle="round,pad=0.05", fc=node, ec=fg, lw=2, zorder=2))
        ax.text(cx, 0, "MaxSim", ha="center", va="center", fontsize=21, color=fg, zorder=3)
        left, right = cx - 1.0, cx + 1.0
    for (x, y), row in zip(ends, rows):
        ax.annotate("", xy=(left - 0.02, 0.2 if y > 0 else -0.2), xytext=(x + 0.14, y),
                    arrowprops=dict(arrowstyle="-|>", color=row[4], lw=2.2, mutation_scale=18), zorder=1)
    ax.annotate("", xy=(right + 0.8, 0), xytext=(right + 0.06, 0),
                arrowprops=dict(arrowstyle="-|>", color=fg, lw=2.2, mutation_scale=18))
    ax.text(right + 0.9, 0, "score", ha="left", va="center", fontsize=21, color=fg)

    ax.set_xlim(-1.6, 13.4); ax.set_ylim(-2.4, 2.4)
    return fig


for mode, name in {'bi': 'bi_encoder', 'late': 'late_interaction'}.items():
    style.save(draw(mode), name)
