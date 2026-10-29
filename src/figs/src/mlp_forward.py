"""Draw src/figs/mlp_forward.svg: a worked forward pass 2 -> 3 (ReLU) -> 2 (ReLU) -> 3 (softmax)."""
import numpy as np
import matplotlib
import style  # Agg backend, LaTeX-style math, SVG text as outlines
import matplotlib.pyplot as plt
from matplotlib.patches import Circle, Rectangle

fg, accent, node, green, red, pos, neg = "#eee8d5", "#268bd2", "#073642", "#859900", "#dc322f", "#268bd2", "#cb4b16"

x = np.array([1.0, 2.0])
W1 = np.array([[1.0, 0.5], [-1.0, -0.5], [0.5, 1.0]]); b1 = np.array([0.0, 1.0, -1.0])
W2 = np.array([[0.5, 1.0, 1.0], [-1.0, 0.5, 0.5]]);    b2 = np.array([-1.0, 0.5])
W3 = np.array([[1.0, 0.5], [0.5, 1.0], [-1.0, 1.0]]);  b3 = np.array([0.0, 0.5, 1.0])
z1 = W1 @ x + b1;  a1 = np.maximum(z1, 0)
z2 = W2 @ a1 + b2; a2 = np.maximum(z2, 0)
z3 = W3 @ a2 + b3; p = np.exp(z3) / np.exp(z3).sum()

def num(v):
    return f"{v:g}".replace("-", "−")

xs = [0.8, 4.0, 7.2, 10.4]
values = [x, a1, a2, z3]
gap = 1.25
def ys(n):
    return [((n - 1) / 2 - i) * gap for i in range(n)]
r = 0.4

fig, ax = plt.subplots(figsize=(12, 4.8), facecolor="none")
ax.set_facecolor("none"); ax.set_aspect("equal"); ax.axis("off")
for l, W in enumerate([W1, W2, W3]):
    src, dst = ys(W.shape[1]), ys(W.shape[0])
    for j in range(W.shape[0]):
        for i in range(W.shape[1]):
            dead = l > 0 and values[l][i] == 0
            w = W[j, i]
            ax.plot([xs[l] + r, xs[l + 1] - r], [src[i], dst[j]], color=pos if w > 0 else neg,
                    lw=0.8 + 2.2 * abs(w), alpha=0.12 if dead else 0.75, zorder=1)
for l, vals in enumerate(values):
    for i, (v, y) in enumerate(zip(vals, ys(len(vals)))):
        if l in (1, 2):
            col = green if v > 0 else red
            ax.add_patch(Circle((xs[l], y), r, fc=col, ec=col, lw=2, zorder=2))
            ax.text(xs[l], y, num(v), ha="center", va="center", fontsize=15, color="#002b36", weight="bold", zorder=3)
        else:
            ax.add_patch(Circle((xs[l], y), r, fc=node, ec=accent, lw=2, zorder=2))
            ax.text(xs[l], y, num(round(v, 2)), ha="center", va="center", fontsize=15 if l == 0 else 12.5, color=fg, zorder=3)
# softmax bars
for i, (q, y) in enumerate(zip(p, ys(3))):
    ax.annotate("", xy=(xs[3] + 1.1, y), xytext=(xs[3] + r + 0.1, y), arrowprops=dict(arrowstyle="->", color=fg, lw=1.2))
    ax.add_patch(Rectangle((xs[3] + 1.2, y - 0.22), 2.4, 0.44, fc="none", ec=fg, lw=0.8, alpha=0.4))
    ax.add_patch(Rectangle((xs[3] + 1.2, y - 0.22), 2.4 * q, 0.44, fc=accent, ec="none"))
    ax.text(xs[3] + 3.75, y, f"{100 * q:.0f}%", ha="left", va="center", fontsize=15, color=fg)
labels = ["input $x$", "hidden 1\n$\\mathrm{ReLU}(W_1 x + b_1)$", "hidden 2\n$\\mathrm{ReLU}(W_2 a_1 + b_2)$",
          "logits\n$W_3 a_2 + b_3$"]
for l, t in enumerate(labels):
    ax.text(xs[l], -2.55, t, ha="center", va="center", fontsize=13, color=fg)
ax.text(xs[3] + 2.4, -2.55, "softmax\nprobabilities", ha="center", va="center", fontsize=13, color=fg)
ax.text(0.2, 2.35, "edges: blue weight > 0, orange weight < 0, thickness = |weight|; "
        "edges leaving an inactive (red) neuron carry 0", fontsize=11.5, color=fg, alpha=0.8)
ax.set_xlim(-0.2, 15.2); ax.set_ylim(-3.1, 2.6)
print("a1", a1, "a2", a2, "z3", z3, "p", p.round(3))
style.save(fig, "mlp_forward")
