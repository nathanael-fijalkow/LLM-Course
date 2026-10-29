"""Draw src/figs/residual_stream_blocks.svg: blocks reading from and writing to the residual stream."""
import matplotlib
import style  # Agg backend, LaTeX-style math, SVG text as outlines
import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch, Rectangle, Circle

fg, accent, hot, node, muted, green, read = "#eee8d5", "#268bd2", "#cb4b16", "#073642", "#93a1a1", "#859900", "#2aa198"

fig, ax = plt.subplots(figsize=(12, 3.8), facecolor="none")
ax.set_facecolor("none"); ax.set_aspect("equal"); ax.axis("off")
x0, x1, bh = 1.6, 15.2, 0.32
ax.add_patch(Rectangle((x0, -bh), x1 - x0, 2 * bh, fc=accent, ec="none", alpha=0.35, zorder=0))
ax.annotate("", xy=(x1 + 0.6, 0), xytext=(x1 - 0.1, 0), arrowprops=dict(arrowstyle="-|>", color=accent, lw=10, alpha=0.6,
                                                                       mutation_scale=30))
ax.text(10.9, -0.62, "residual stream", ha="center", va="top", fontsize=13, color=accent)
ax.text(x0 - 0.15, 0, "token\nembeddings", ha="right", va="center", fontsize=13, color=fg)
ax.text(x1 + 0.85, 0, "logits", ha="left", va="center", fontsize=13, color=fg)

def sub(xc, label, ec, first):
    w, h, y = 1.55, 0.62, 1.55
    ax.add_patch(FancyBboxPatch((xc - w / 2, y - h / 2), w, h, boxstyle="round,pad=0.05", fc=node, ec=ec, lw=2, zorder=2))
    ax.text(xc, y, label, ha="center", va="center", fontsize=12.5, color=fg, zorder=3)
    ax.annotate("", xy=(xc - 0.3, y - h / 2 - 0.06), xytext=(xc - 0.3, bh + 0.02),
                arrowprops=dict(arrowstyle="-|>", color=read, lw=2), zorder=1)
    ax.annotate("", xy=(xc + 0.3, bh + 0.02), xytext=(xc + 0.3, y - h / 2 - 0.06),
                arrowprops=dict(arrowstyle="-|>", color=hot, lw=2), zorder=1)
    ax.add_patch(Circle((xc + 0.3, 0), 0.17, fc=node, ec=hot, lw=1.5, zorder=3))
    ax.text(xc + 0.3, -0.01, "+", ha="center", va="center", fontsize=12, color=fg, zorder=4)
    if first:
        ax.text(xc - 0.45, 0.85, "read", ha="right", va="center", fontsize=12, color=read)
        ax.text(xc + 0.45, 0.85, "write", ha="left", va="center", fontsize=12, color=hot)

blocks = [(4.0, "block 1"), (8.5, "block 2"), (13.3, "block $N$")]
for k, (xc, name) in enumerate(blocks):
    ax.add_patch(FancyBboxPatch((xc - 1.95, 0.55), 3.9, 1.65, boxstyle="round,pad=0.08", fc="none", ec=fg, lw=1,
                                ls="--", alpha=0.45))
    sub(xc - 0.95, "attention", hot, k == 0)
    sub(xc + 0.95, "MLP", green, False)
    ax.text(xc, -0.62, name, ha="center", va="top", fontsize=13, color=fg)
ax.text(10.9, 1.4, "…", ha="center", va="center", fontsize=26, color=fg)
ax.set_xlim(-0.2, 17.2); ax.set_ylim(-1.15, 2.5)
style.save(fig, "residual_stream_blocks")
