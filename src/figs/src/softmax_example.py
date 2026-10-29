"""Draw src/figs/softmax_example.svg: a logit vector and its softmax, as two heatmap rows."""
import numpy as np
import matplotlib
import style  # Agg backend, LaTeX-style math, SVG text as outlines
import matplotlib.pyplot as plt
from matplotlib.patches import Rectangle
from matplotlib import colormaps

fg, accent = "#eee8d5", "#268bd2"

tokens = ["Paris", "the", "a", "London", "banana"]
logits = np.array([3.0, 2.0, 1.5, 0.5, -2.0])
probs = np.exp(logits) / np.exp(logits).sum()
cmap = colormaps["Blues"]

def num(v, fmt):
    return format(v, fmt).replace("-", "−")

fig, ax = plt.subplots(figsize=(11, 3.4), facecolor="none")
ax.set_facecolor("none"); ax.set_aspect("equal"); ax.axis("off")
w, h, x0 = 1.6, 0.8, 2.6
rows = [(1.6, "logits $\\alpha$", (logits - logits.min()) / (logits.max() - logits.min()), [num(v, "g") for v in logits]),
        (0.0, "$\\mathrm{softmax}(\\alpha)$", probs / probs.max(), [num(v, ".3f") for v in probs])]
for k, t in enumerate(tokens):
    ax.text(x0 + (k + 0.5) * w, 2.75, t, ha="center", va="center", fontsize=16, color=fg)
for y, label, shade, texts in rows:
    ax.text(x0 - 0.25, y + h / 2, label, ha="right", va="center", fontsize=19 if label.startswith("$") else 16, color=accent)
    for k, (s, t) in enumerate(zip(shade, texts)):
        c = cmap(0.15 + 0.8 * s)
        ax.add_patch(Rectangle((x0 + k * w, y), w - 0.08, h, fc=c, ec="none"))
        ax.text(x0 + k * w + (w - 0.08) / 2, y + h / 2, t, ha="center", va="center", fontsize=16,
                color="#002b36" if s < 0.6 else "white", weight="bold")
for k in range(len(tokens)):
    xc = x0 + k * w + (w - 0.08) / 2
    ax.annotate("", xy=(xc, 0.88), xytext=(xc, 1.52), arrowprops=dict(arrowstyle="->", color=fg, lw=1.2, alpha=0.6))
ax.text(x0 + 5 * w + 0.3, 1.2, "exponentiate,\nthen divide\nby the sum", ha="left", va="center", fontsize=13, color=fg, alpha=0.85)
ax.text(x0 + 5 * w + 0.3, 0.4, "sum = 1", ha="left", va="center", fontsize=15, color=accent)
ax.set_xlim(-0.5, 13.2); ax.set_ylim(-0.3, 3.1)
print(probs.round(3), probs.sum())
style.save(fig, "softmax_example")
