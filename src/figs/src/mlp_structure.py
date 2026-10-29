"""Draw src/figs/mlp_structure.svg: a small MLP, all connections, one neuron explained."""
import matplotlib
import style  # Agg backend, LaTeX-style math, SVG text as outlines
import matplotlib.pyplot as plt
from matplotlib.patches import Circle, FancyBboxPatch

fg, accent, hot, node = "#eee8d5", "#268bd2", "#cb4b16", "#073642"

layers = [3, 4, 4, 3]
xs = [0.8, 3.6, 6.4, 9.2]
names = ["input", "hidden\nlayer 1", "hidden\nlayer 2", "output"]
r = 0.28
def ys(n):
    gap = 0.85
    return [(i - (n - 1) / 2) * gap for i in range(n)]

fig, ax = plt.subplots(figsize=(11, 4.6), facecolor="none")
ax.set_facecolor("none")
ax.set_aspect("equal")
ax.axis("off")
focus = (1, 3)   # top neuron of hidden layer 1 (0-based)

for l in range(len(layers) - 1):
    for i, y0 in enumerate(ys(layers[l])):
        for j, y1 in enumerate(ys(layers[l + 1])):
            on = (l + 1, j) == focus
            ax.plot([xs[l] + r, xs[l + 1] - r], [y0, y1], color=accent if on else fg,
                    alpha=1.0 if on else 0.22, lw=2.4 if on else 1.0, zorder=1)
for l, n in enumerate(layers):
    for i, y in enumerate(ys(n)):
        on = (l, i) == focus
        ax.add_patch(Circle((xs[l], y), r, fc=accent if on else node, ec=accent, lw=2, zorder=2))
    ax.text(xs[l], -2.15, names[l], ha="center", va="center", fontsize=14, color=fg)

fy = ys(layers[1])[3]
ax.add_patch(FancyBboxPatch((3.95, 1.95), 6.2, 1.45, boxstyle="round,pad=0.12", fc=node, ec=accent, lw=2, zorder=3))
ax.text(7.05, 3.0, r"weighted sum:  $z = \sum_i w_i\, x_i + b$", ha="center", va="center", fontsize=15, color=fg, zorder=4)
ax.text(7.05, 2.3, r"activation:  $a = \mathrm{ReLU}(z)$", ha="center", va="center", fontsize=15, color=fg, zorder=4)
ax.annotate("", xy=(9.9, -2.85), xytext=(0.1, -2.85),
            arrowprops=dict(arrowstyle="->", color=accent, lw=1.5))
ax.text(5.0, -3.15, "information flows forward, layer after layer", ha="center", va="center", fontsize=12, color=accent)
ax.set_xlim(-0.2, 10.3)
ax.set_ylim(-3.4, 3.55)
style.save(fig, "mlp_structure")
