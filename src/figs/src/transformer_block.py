"""Draw src/figs/transformer_block.svg: a pre-norm Transformer block, bottom to top."""
import matplotlib
import style  # Agg backend, LaTeX-style math, SVG text as outlines
import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch, Circle

fg, accent, hot, node, muted, green = "#eee8d5", "#268bd2", "#cb4b16", "#073642", "#93a1a1", "#859900"

fig, ax = plt.subplots(figsize=(6.0, 7.0), facecolor="none")
ax.set_facecolor("none"); ax.set_aspect("equal"); ax.axis("off")
rx = 0.8                                      # x of the residual path
bx, bw, bh = 1.9, 3.9, 0.75                   # branch boxes

def box(y, text, ec, fc=node):
    ax.add_patch(FancyBboxPatch((bx, y - bh / 2), bw, bh, boxstyle="round,pad=0.06", fc=fc, ec=ec, lw=2, zorder=2))
    ax.text(bx + bw / 2, y, text, ha="center", va="center", fontsize=14, color=fg, zorder=3)

def line(xs, ys, **kw):
    ax.plot(xs, ys, color=kw.get("color", fg), lw=kw.get("lw", 1.6), alpha=kw.get("alpha", 0.85), zorder=1)

def arrow(x0, y0, x1, y1, color=fg, lw=1.6):
    ax.annotate("", xy=(x1, y1), xytext=(x0, y0), arrowprops=dict(arrowstyle="-|>", color=color, lw=lw), zorder=1)

def plus(y):
    ax.add_patch(Circle((rx, y), 0.24, fc=node, ec=fg, lw=1.6, zorder=2))
    ax.text(rx, y - 0.02, "+", ha="center", va="center", fontsize=17, color=fg, zorder=3)

y_in, ln1, att, add1, ln2, mlp, add2, y_out = 0.0, 1.3, 2.6, 3.6, 4.9, 6.2, 7.2, 8.4
# residual path
arrow(rx, y_in, rx, add1 - 0.26, color=accent, lw=2.6)
arrow(rx, add1 + 0.24, rx, add2 - 0.26, color=accent, lw=2.6)
arrow(rx, add2 + 0.24, rx, y_out, color=accent, lw=2.6)
plus(add1); plus(add2)
# branch 1: LN -> attention -> add
line([rx, bx + bw / 2], [0.55, 0.55]); arrow(bx + bw / 2, 0.55, bx + bw / 2, ln1 - bh / 2 - 0.06)
box(ln1, "LayerNorm", muted)
arrow(bx + bw / 2, ln1 + bh / 2 + 0.06, bx + bw / 2, att - bh / 2 - 0.06)
box(att, "Multi-head attention", hot)
line([bx + bw / 2, bx + bw / 2], [att + bh / 2 + 0.06, add1]); arrow(bx + bw / 2, add1, rx + 0.26, add1)
# branch 2: LN -> MLP -> add
line([rx, bx + bw / 2], [add1 + 0.75, add1 + 0.75]); arrow(bx + bw / 2, add1 + 0.75, bx + bw / 2, ln2 - bh / 2 - 0.06)
box(ln2, "LayerNorm", muted)
arrow(bx + bw / 2, ln2 + bh / 2 + 0.06, bx + bw / 2, mlp - bh / 2 - 0.06)
box(mlp, "MLP", green)
line([bx + bw / 2, bx + bw / 2], [mlp + bh / 2 + 0.06, add2]); arrow(bx + bw / 2, add2, rx + 0.26, add2)
# labels
ax.text(rx, y_in - 0.35, "$x$ (one vector per token)", ha="left", va="top", fontsize=13, color=fg)
ax.text(rx, y_out + 0.15, "to the next block", ha="left", va="bottom", fontsize=13, color=fg)
ax.text(bx + bw + 0.65, att, "communication\n(between tokens)", ha="left", va="center", fontsize=12, color=hot)
ax.text(bx + bw + 0.65, mlp, "computation\n(each token)", ha="left", va="center", fontsize=12, color=green)
ax.text(rx - 0.35, (y_in + y_out) / 2, "residual stream", ha="right", va="center", fontsize=12, color=accent, rotation=90)
ax.add_patch(FancyBboxPatch((0.05, 0.3), bx + bw + 0.25, add2 + 0.3, boxstyle="round,pad=0.1", fc="none",
                            ec=fg, lw=1.2, ls="--", alpha=0.5))
ax.text(bx + bw + 0.65, 0.45, "$\\times N$", ha="left", va="center", fontsize=16, color=fg)
ax.set_xlim(-0.6, 9.0); ax.set_ylim(-0.8, 9.0)
style.save(fig, "transformer_block")
