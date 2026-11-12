"""Draw src/figs/kl_examples.svg: a reference next-token distribution P, three models Q, and KL(P || Q) for each."""
import numpy as np
import style  # Agg backend, LaTeX-style math, SVG text as outlines
import matplotlib.pyplot as plt

fg, blue, orange, muted = "#eee8d5", "#268bd2", "#cb4b16", "#93a1a1"

tokens = ["Paris", "Lyon"]
P = np.array([0.5, 0.5])
cases = [np.array([0.6, 0.4]), np.array([0.9, 0.1]), np.array([1.0, 0.0])]


def kl(p, q):
    """KL(p || q) in nats, with 0 log 0 = 0 and +inf when q misses part of the support of p."""
    mask = p > 0
    if np.any(q[mask] == 0):
        return np.inf
    return float((p[mask] * np.log(p[mask] / q[mask])).sum())


def fmt(v):
    return r"+\infty" if np.isinf(v) else f"{v:.2f}"


x = np.arange(len(tokens))
w = 0.36
fig, axes = plt.subplots(1, 3, figsize=(13, 3.9), facecolor="none", sharey=True)
for ax, Q in zip(axes, cases):
    ax.set_facecolor("none")
    ax.bar(x - w / 2, P, width=w, color=blue, label="$P$ (reference)")
    ax.bar(x + w / 2, Q, width=w, color=orange, label="$Q$ (model)")
    for xi, q in zip(x, Q):
        ax.text(xi + w / 2, q + 0.03, f"{q:g}", ha="center", va="bottom", fontsize=14, color=fg)
    for xi, p in zip(x, P):
        ax.text(xi - w / 2, p + 0.03, f"{p:g}", ha="center", va="bottom", fontsize=14, color=fg)
    ax.set_ylim(0, 1.15)
    ax.set_xlim(-0.6, 1.6)
    ax.set_xticks(x, tokens, fontsize=16, color=fg)
    ax.set_yticks([0, 0.5, 1])
    ax.tick_params(axis="y", colors=muted, labelsize=12)
    for side in ["top", "right"]:
        ax.spines[side].set_visible(False)
    for side in ["left", "bottom"]:
        ax.spines[side].set_color(muted)
    style.tex(ax, 0.5, -0.2, rf"$\mathrm{{KL}}(P \,\|\, Q) = {fmt(kl(P, Q))}$", transform=ax.transAxes,
              ha="center", va="top", fontsize=19, color=fg)
fig.tight_layout(w_pad=3)
handles, labels = axes[0].get_legend_handles_labels()
fig.legend(handles, labels, loc="lower center", bbox_to_anchor=(0.5, 0.98), frameon=False, fontsize=18, labelcolor=fg, ncols=2)
style.save(fig, "kl_examples")
