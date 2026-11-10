"""Draw src/figs/sft_vs_rl_entropy.svg: the distribution over 10 answers after SFT and after RL (illustrative numbers)."""
import numpy as np
import style  # Agg backend, LaTeX-style math, SVG text as outlines
import matplotlib.pyplot as plt

fg, blue, orange, muted = "#eee8d5", "#268bd2", "#cb4b16", "#93a1a1"

x = np.arange(10)
sft = np.array([0.15, 0.12, 0.11, 0.10, 0.10, 0.09, 0.09, 0.08, 0.08, 0.08])
rl = np.array([0.45, 0.25, 0.10, 0.05, 0.04, 0.03, 0.03, 0.02, 0.02, 0.01])


def entropy(p):
    return -(p * np.log(p)).sum()


fig, axes = plt.subplots(1, 2, figsize=(11, 3.4), facecolor="none", sharey=True)
for ax, p, colour, name in [(axes[0], sft, blue, "after SFT"), (axes[1], rl, orange, "after RL")]:
    ax.set_facecolor("none")
    ax.bar(x, p, color=colour, width=0.75)
    ax.set_ylim(0, 0.5)
    ax.set_xticks(x, [f"$y_{{{i + 1}}}$" for i in x], fontsize=14, color=fg)
    ax.tick_params(axis="y", colors=muted, labelsize=12)
    for side in ["top", "right"]:
        ax.spines[side].set_visible(False)
    for side in ["left", "bottom"]:
        ax.spines[side].set_color(muted)
    style.tex(ax, 9.4, 0.46, f"{name}: $H = {entropy(p):.2f}$ nats", ha="right", va="top", fontsize=17, color=fg)
axes[0].set_ylabel(r"$\pi(y \mid x)$", fontsize=17, color=fg)
fig.tight_layout(w_pad=3)
style.save(fig, "sft_vs_rl_entropy")
