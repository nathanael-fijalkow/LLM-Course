"""Draw src/figs/relu_example.svg: 2 inputs, 3 ReLU neurons, active ones green, inactive ones red."""
import numpy as np
import matplotlib
import style  # Agg backend, LaTeX-style math, SVG text as outlines
import matplotlib.pyplot as plt
from matplotlib.patches import Circle

fg, accent, node, green, red = "#eee8d5", "#268bd2", "#073642", "#859900", "#dc322f"

x = np.array([1.0, 2.0])
W = np.array([[1.0, 0.5], [-1.0, -0.5], [0.5, 1.0]])
b = np.array([0.0, 1.0, -1.0])
z = W @ x + b
a = np.maximum(z, 0)

def num(v):
    return f"{v:g}".replace("-", "−")

fig, ax = plt.subplots(figsize=(11, 3.6), facecolor="none")
ax.set_facecolor("none"); ax.set_aspect("equal"); ax.axis("off")
r = 0.38
xin, xh = 0.6, 3.6
yin = [0.7, -0.7]
yh = [1.3, 0.0, -1.3]
for y0 in yin:
    for y1 in yh:
        ax.plot([xin + r, xh - r], [y0, y1], color=fg, alpha=0.3, lw=1.2, zorder=1)
for i, y in enumerate(yin):
    ax.add_patch(Circle((xin, y), r, fc=node, ec=accent, lw=2, zorder=2))
    ax.text(xin, y, num(x[i]), ha="center", va="center", fontsize=17, color=fg, zorder=3)
    ax.text(xin - 0.55, y, f"$x_{i + 1}$", ha="right", va="center", fontsize=18, color=accent)
for j, y in enumerate(yh):
    col = green if a[j] > 0 else red
    ax.add_patch(Circle((xh, y), r, fc=col, ec=col, lw=2, zorder=2))
    ax.text(xh, y, num(a[j]), ha="center", va="center", fontsize=14, color="#002b36", weight="bold", zorder=3)
    terms = f"{W[j, 0]:g} \\cdot {x[0]:g} + {W[j, 1]:g} \\cdot {x[1]:g} + {b[j]:g}".replace("+ -", "- ")
    ax.text(xh + 0.6, y, f"$z = {terms} = {z[j]:g} \\;\\rightarrow\\; {a[j]:g}$",
            ha="left", va="center", fontsize=20, color=col)
ax.text(xin, -2.25, "input", ha="center", va="center", fontsize=16, color=fg)
ax.text(3.2, -2.25, "● active (output > 0)", ha="left", va="center", fontsize=16, color=green)
ax.text(8.0, -2.25, "● inactive (output = 0)", ha="left", va="center", fontsize=16, color=red)
ax.set_xlim(-0.6, 12.9); ax.set_ylim(-2.6, 1.8)
print("z =", z, "a =", a)
style.save(fig, "relu_example")
