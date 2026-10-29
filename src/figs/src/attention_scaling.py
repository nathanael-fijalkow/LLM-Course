"""Draw src/figs/attention_scaling.svg: q.k for random vectors, raw and divided by sqrt(d)."""
import numpy as np
import matplotlib
import style  # Agg backend, LaTeX-style math, SVG text as outlines
import matplotlib.pyplot as plt

fg, grid = "#eee8d5", "#586e75"
colors = {16: "#268bd2", 64: "#859900", 256: "#cb4b16"}
plt.rcParams.update({"font.size": 13,
                     "text.color": fg, "axes.labelcolor": fg, "xtick.color": fg, "ytick.color": fg,
                     "axes.edgecolor": grid})
rng = np.random.default_rng(0)
n = 20000

fig, axes = plt.subplots(1, 2, figsize=(11, 3.4), facecolor="none", sharey=False)
stats = {}
for d, c in colors.items():
    q, k = rng.normal(size=(n, d)), rng.normal(size=(n, d))
    s = (q * k).sum(axis=1)
    stats[d] = (s.mean(), s.std(), (s / np.sqrt(d)).std())
    axes[0].hist(s, bins=120, range=(-60, 60), histtype="step", lw=2, color=c, density=True, label=f"$d = {d}$")
    axes[1].hist(s / np.sqrt(d), bins=120, range=(-5, 5), histtype="step", lw=2, color=c, density=True)
axes[0].set_title(r"raw scores $q \cdot k$: spread $\approx \sqrt{d}$", color=fg, fontsize=14)
axes[1].set_title(r"scaled scores $q \cdot k / \sqrt{d}$: spread $\approx 1$", color=fg, fontsize=14)
for ax in axes:
    ax.set_facecolor("none"); ax.set_yticks([])
    for side in ["top", "right", "left"]:
        ax.spines[side].set_visible(False)
axes[0].legend(frameon=False, fontsize=13, labelcolor=fg)
fig.tight_layout()
for d, (m, sd, ssd) in stats.items():
    print(f"d={d}: mean {m:.2f}, std {sd:.2f} (sqrt d = {np.sqrt(d):.1f}), scaled std {ssd:.2f}")
# softmax saturation on 5 scores
for d in (16, 256):
    s = rng.normal(size=5) * np.sqrt(d)
    for name, v in (("raw", s), ("scaled", s / np.sqrt(d))):
        p = np.exp(v - v.max()); p /= p.sum()
        print(d, name, p.round(3))
style.save(fig, "attention_scaling")
