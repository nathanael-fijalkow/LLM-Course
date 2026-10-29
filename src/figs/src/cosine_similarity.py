"""Draw src/figs/cosine_similarity.svg: two vectors x and y, the angle theta between them, sim(x, y) = cos theta."""
import numpy as np
import matplotlib
import style  # Agg backend, LaTeX-style math, SVG text as outlines
import matplotlib.pyplot as plt
from matplotlib.patches import Arc

fg, accent, hot, muted = "#eee8d5", "#268bd2", "#cb4b16", "#93a1a1"

fig, ax = plt.subplots(figsize=(7, 2.9), facecolor="none")
ax.set_facecolor("none"); ax.set_aspect("equal"); ax.axis("off")

ax_x, ax_y = np.deg2rad(12), np.deg2rad(58)          # directions of x and y
x = 3.2 * np.array([np.cos(ax_x), np.sin(ax_x)])     # different lengths: only the angle matters
y = 2.3 * np.array([np.cos(ax_y), np.sin(ax_y)])
for v, name, colour, label_at in [(x, "x", accent, x * 1.08), (y, "y", hot, y + np.array([0.38, -0.05]))]:
    ax.annotate("", xy=v, xytext=(0, 0), arrowprops=dict(arrowstyle="-|>", color=colour, lw=3, mutation_scale=22))
    ax.text(*label_at, f"${name}$", fontsize=22, color=colour, ha="center", va="center")   # y: beside its arrow head
ax.plot(0, 0, "o", color=fg, ms=5)
ax.add_patch(Arc((0, 0), 1.6, 1.6, theta1=np.rad2deg(ax_x), theta2=np.rad2deg(ax_y), color=fg, lw=2))
mid = (ax_x + ax_y) / 2
ax.text(1.05 * np.cos(mid), 1.05 * np.sin(mid), r"$\theta$", fontsize=20, color=fg, ha="center", va="center")

ax.text(4.3, 1.35, r"$\mathrm{sim}(x, y) = \cos\theta$", fontsize=22, color=fg, ha="left", va="center")
ax.text(4.3, 0.55, r"$1$: same direction", fontsize=15, color=muted, ha="left", va="center")
ax.text(4.3, 0.05, r"$0$: orthogonal", fontsize=15, color=muted, ha="left", va="center")
ax.text(4.3, -0.45, r"$-1$: opposite directions", fontsize=15, color=muted, ha="left", va="center")
ax.set_xlim(-0.3, 9.6); ax.set_ylim(-0.7, 2.4)
style.save(fig, "cosine_similarity")
