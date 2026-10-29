"""Draw src/figs/mlp_lm.svg: the MLP language model of the slides, with a window of k = 3 tokens.

One prediction in detail: the last 3 tokens are looked up, their embeddings concatenated, then MLP, logits, next token.
"""
import numpy as np
import matplotlib
import style  # Agg backend, LaTeX-style math, SVG text as outlines
import matplotlib.pyplot as plt
from matplotlib.patches import Rectangle, FancyBboxPatch
from matplotlib import colormaps

fg, accent, hot, node, muted = "#eee8d5", "#268bd2", "#cb4b16", "#073642", "#93a1a1"
rng = np.random.default_rng(3)
cmap = colormaps["RdBu_r"]

tokens = ["A", "beautiful", "sunset", "over", "the"]
k, n_dim, n_voc = 3, 5, 10
xs = [1.5 + 2.15 * i for i in range(len(tokens))]
cw = 0.26                       # cell width of the heatmap strips
window = range(len(tokens) - k, len(tokens))

fig, ax = plt.subplots(figsize=(11, 5.6), facecolor="none")
ax.set_facecolor("none"); ax.set_aspect("equal"); ax.axis("off")

def strip(xc, y, values, alpha=1.0):
    x0 = xc - len(values) * cw / 2
    for i, v in enumerate(values):
        ax.add_patch(Rectangle((x0 + i * cw, y - 0.17), cw - 0.03, 0.34, fc=cmap(0.5 + 0.45 * v), ec="none", alpha=alpha))
    return x0, x0 + len(values) * cw

def arrow(x0, y0, x1, y1, colour=fg, alpha=0.7):
    ax.annotate("", xy=(x1, y1), xytext=(x0, y0), arrowprops=dict(arrowstyle="->", color=colour, lw=1.3, alpha=alpha))

rows = {"tok": 5.0, "emb": 3.95, "cat": 2.85, "mlp": 1.85, "log": 0.85, "pred": -0.1}
centre = sum(xs[i] for i in window) / k

# the tokens, the window and its embeddings
embs = []
for i, (t, xc) in enumerate(zip(tokens, xs)):
    inside = i in window
    ax.text(xc, rows["tok"], t, ha="center", va="center", fontsize=15, color=fg if inside else muted, alpha=1 if inside else 0.6,
            bbox=dict(boxstyle="round,pad=0.3", fc=node, ec=accent if inside else muted, lw=1.5, alpha=1 if inside else 0.6))
    if inside:
        arrow(xc, rows["tok"] - 0.3, xc, rows["emb"] + 0.25)
        e = np.tanh(rng.normal(size=n_dim))
        strip(xc, rows["emb"], e)
        embs.append(e)
left, right = xs[window[0]] - 0.95, xs[window[-1]] + 0.95
ax.add_patch(FancyBboxPatch((left, rows["tok"] - 0.42), right - left, 0.84, boxstyle="round,pad=0.05", fc="none",
                            ec=hot, lw=2, ls=(0, (5, 3))))
ax.text(right + 0.15, rows["tok"] + 0.55, f"window of $k = {k}$ tokens", ha="right", va="bottom", fontsize=13, color=hot)
ax.text((xs[0] + xs[window[0] - 1]) / 2, rows["emb"], "outside the window:\nignored", ha="center", va="center",
        fontsize=12, color=muted, style="italic")

# concatenation, MLP, logits, next token
cat = np.concatenate(embs)
c0, c1 = strip(centre, rows["cat"], cat)
for j, i in enumerate(window):
    target = c0 + (j + 0.5) * n_dim * cw
    arrow(xs[i], rows["emb"] - 0.25, target, rows["cat"] + 0.25)
for j in range(1, k):                                   # separators between the three slots
    xsep = c0 + j * n_dim * cw - 0.015
    ax.plot([xsep, xsep], [rows["cat"] - 0.24, rows["cat"] + 0.24], color=fg, lw=1.2)
arrow(centre, rows["cat"] - 0.25, centre, rows["mlp"] + 0.33)
ax.add_patch(FancyBboxPatch((centre - 0.85, rows["mlp"] - 0.28), 1.7, 0.56, boxstyle="round,pad=0.05", fc=node, ec=accent, lw=1.5))
ax.text(centre, rows["mlp"], "MLP", ha="center", va="center", fontsize=14, color=fg)
arrow(centre, rows["mlp"] - 0.35, centre, rows["log"] + 0.25)
logits = rng.normal(size=n_voc)
logits[rng.integers(n_voc)] += 2.0
strip(centre, rows["log"], np.tanh(logits / 2))
arrow(centre, rows["log"] - 0.25, centre, rows["pred"] + 0.25)
ax.text(centre, rows["pred"], "?", ha="center", va="center", fontsize=17, color=hot, weight="bold", style="italic")

labels = {"tok": "tokens", "emb": "embeddings\n(look-up)", "cat": "concatenation\n($k \\times d_{\\mathrm{model}}$ numbers)",
          "mlp": "MLP", "log": "logits\n(vocabulary)", "pred": "next token"}
for key, y in rows.items():
    ax.text(-0.15, y, labels[key], ha="right", va="center", fontsize=12.5, color=accent)
ax.text(centre, -0.75, "the window then slides by one token to predict the following token",
        ha="center", va="center", fontsize=12.5, color=fg, alpha=0.85)
ax.set_xlim(-2.0, xs[-1] + 1.1); ax.set_ylim(-1.0, 5.85)
style.save(fig, "mlp_lm")
