"""Draw src/figs/multihead.svg: how multi-head attention splits the dimensions (d_model=8, h=4, so 2 dimensions per head)."""
import matplotlib
import style  # Agg backend, LaTeX-style math, SVG text as outlines
import matplotlib.pyplot as plt
from matplotlib.patches import Rectangle, FancyBboxPatch

fg, node, muted = "#eee8d5", "#073642", "#93a1a1"
heads = ["#268bd2", "#859900", "#cb4b16", "#d33682"]
d, h = 8, 4
dk = d // h
c = 0.36                                   # cell size

fig, ax = plt.subplots(figsize=(12, 4.8), facecolor="none")
ax.set_facecolor("none"); ax.set_aspect("equal"); ax.axis("off")

def column(x, y_top, colors, label=None, edge=fg):
    for i, col in enumerate(colors):
        ax.add_patch(Rectangle((x, y_top - (i + 1) * c), c, c, fc=col, ec=edge, lw=0.8, alpha=0.95))
    if label:
        ax.text(x + c / 2, y_top + 0.25, label, ha="center", va="bottom", fontsize=15, color=fg)

def arrow(x0, y0, x1, y1, color=fg, text=None, dy=0.25):
    ax.annotate("", xy=(x1, y1), xytext=(x0, y0), arrowprops=dict(arrowstyle="->", color=color, lw=1.4, alpha=0.8))
    if text:
        ax.text((x0 + x1) / 2, (y0 + y1) / 2 + dy, text, ha="center", va="bottom", fontsize=13, color=fg)

top = d * c / 2 + 0.2
grey = [node] * d
by_head = [heads[i // dk] for i in range(d)]
mid = top - d * c / 2

column(0.0, top, grey, "$x$")
arrow(0.5, mid, 1.9, mid, text="$W_Q, W_K, W_V$")
for k, name in enumerate(["$q$", "$k$", "$v$"]):
    column(2.0 + 0.55 * k, top, by_head, name)
# heads
hx, hw, hh = 5.4, 2.6, 0.62
hys = [top - (j + 0.5) * dk * c for j in range(h)]
for j, y in enumerate(hys):
    arrow(3.55, y, hx - 0.05, y, color=heads[j])
    ax.add_patch(FancyBboxPatch((hx, y - hh / 2), hw, hh, boxstyle="round,pad=0.04", fc=node, ec=heads[j], lw=2))
    ax.text(hx + hw / 2, y, f"head {j + 1}: attention", ha="center", va="center", fontsize=13, color=fg)
    arrow(hx + hw + 0.05, y, 8.6, y, color=heads[j])
column(8.65, top, by_head, "concat")
arrow(9.15, mid, 10.5, mid, text="$W_O$")
column(10.6, top, grey, "output")
# dimension annotations
ax.text(0.18, top - d * c - 0.35, rf"$d_{{\mathrm{{model}}}} = {d}$", ha="center", va="top", fontsize=13, color=muted)
ax.text(2.73, top - d * c - 0.35, f"{h} groups of {dk}", ha="center", va="top", fontsize=13, color=muted)
ax.text(hx + hw / 2, top - d * c - 0.35, "each head sees\nonly its 2 dimensions", ha="center", va="top", fontsize=13, color=muted)
ax.text(8.83, top - d * c - 0.35, f"back to {d}", ha="center", va="top", fontsize=13, color=muted)
ax.set_xlim(-0.4, 11.4); ax.set_ylim(top - d * c - 1.0, top + 0.9)
style.save(fig, "multihead")
