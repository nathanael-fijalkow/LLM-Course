"""Draw src/figs/attention_sum.svg: z_j as a weighted sum of all x_i (weights alpha_{i,j})."""
import numpy as np
import matplotlib
import style  # Agg backend, LaTeX-style math, SVG text as outlines
import matplotlib.pyplot as plt
from matplotlib.patches import Rectangle
from matplotlib import colormaps


def draw():
    fg, accent, hot, node = "#eee8d5", "#268bd2", "#cb4b16", "#073642"
    rng = np.random.default_rng(1)
    cmap = colormaps["RdBu_r"]

    n, j = 5, 2                                   # highlight z_3 (0-based index 2)
    alpha = np.array([0.05, 0.40, 0.30, 0.20, 0.05])
    xs = [1.0 + 1.9 * i for i in range(n)]
    y_top, y_bot = 2.6, 0.0
    d, cw = 4, 0.3                                # vector length, cell size

    fig, ax = plt.subplots(figsize=(11, 3.8), facecolor="none")
    ax.set_facecolor("none"); ax.set_aspect("equal"); ax.axis("off")

    def vector(xc, yc, values, edge):
        x0 = xc - cw / 2
        for k, v in enumerate(values):
            ax.add_patch(Rectangle((x0, yc + (d / 2 - 1 - k) * cw), cw, cw, fc=cmap(0.5 + 0.45 * v), ec=edge, lw=1.2))

    X = np.tanh(rng.normal(size=(n, d)))

    for i in range(n):
        ax.plot([xs[i], xs[j]], [y_top - d * cw / 2 - 0.08, y_bot + d * cw / 2 + 0.08], color=hot,
                lw=0.8 + 9 * alpha[i], alpha=0.85, zorder=1, solid_capstyle="round")
        # just below x_i, on the outer side of its line, where no other line passes
        side = 0.48 if i >= j else -0.48
        style.tex(ax, xs[i] + side, y_top - d * cw / 2 - 0.3, f"$\\alpha_{{{j + 1},{i + 1}}}$",
                  ha="center", va="center", fontsize=18, color=hot, zorder=3)
    for i in range(n):
        vector(xs[i], y_top, X[i], accent)
        style.tex(ax, xs[i], y_top + d * cw / 2 + 0.32, f"$x_{i + 1}$", ha="center", va="center", fontsize=21, color=fg)
        zv = np.tanh(alpha @ X * 2) if i == j else np.tanh(rng.normal(size=d))
        vector(xs[i], y_bot, zv, hot if i == j else accent)
        style.tex(ax, xs[i], y_bot - d * cw / 2 - 0.32, f"$z_{i + 1}$", ha="center", va="center", fontsize=21,
                  color=hot if i == j else fg)
    lines = [(f"$\\displaystyle z_{j + 1} = \\sum_j \\alpha_{{{j + 1},j}}\\, x_j$", 24, hot, 1.0),  # display style: full-size sums
             (f"$\\displaystyle \\sum_j \\alpha_{{{j + 1},j}} = 1$", 19, fg, 0.85)]
    for (text, size, col, al), dy in zip(lines, (0.75, -0.75)):
        style.tex(ax, xs[-1] + 1.1, (y_top + y_bot) / 2 + dy, text, ha="left", va="center", fontsize=size, color=col, alpha=al)
    ax.set_xlim(0.3, xs[-1] + 5.4); ax.set_ylim(-1.3, 3.9)
    return fig


style.save(draw(), "attention_sum")
