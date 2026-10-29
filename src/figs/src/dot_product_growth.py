"""Draw src/figs/dot_product_growth.svg: why attention scores are divided by sqrt(d_model).

The argument of Vaswani et al. (2017, footnote 4): if the entries of q and k are independent with mean 0 and
variance 1, then q.k = sum_i q_i k_i has mean 0 and variance d_model, so its typical size is sqrt(d_model).
The picture shows the partial sums of q_i k_i for random pairs, as the dimension d_model grows: they spread like +-sqrt(d_model).
"""
import numpy as np
import style  # Agg backend, LaTeX-style math, SVG text as outlines
import matplotlib.pyplot as plt

fg, accent, hot, muted = "#eee8d5", "#268bd2", "#cb4b16", "#93a1a1"
rng = np.random.default_rng(0)
d, pairs = 256, 40
q, k = rng.standard_normal((pairs, d)), rng.standard_normal((pairs, d))
partial = np.cumsum(q * k, axis=1)                     # partial sums of q_i k_i, one row per pair
m = np.arange(1, d + 1)

fig = plt.figure(figsize=(9.6, 3.9), facecolor="none")
ax = fig.add_axes([0.07, 0.16, 0.42, 0.78], facecolor="none")
for row in partial:
    ax.plot(m, row, color=accent, lw=0.9, alpha=0.45)
for sign in (1, -1):
    ax.plot(m, sign * np.sqrt(m), color=hot, lw=2.2, ls="--")
    ax.plot(m, 2 * sign * np.sqrt(m), color=hot, lw=1.2, ls=":", alpha=0.8)
style.tex(ax, d + 4, np.sqrt(d), r"$\sqrt{d_{\text{model}}}$", ha="left", va="center", fontsize=17, color=hot)
style.tex(ax, d + 4, 2 * np.sqrt(d), r"$2\sqrt{d_{\text{model}}}$", ha="left", va="center", fontsize=15, color=hot, alpha=0.85)
ax.axhline(0, color=fg, lw=0.8, alpha=0.4)
ax.set_xlim(0, d); ax.set_ylim(-2.6 * np.sqrt(d), 2.6 * np.sqrt(d))
ax.set_xticks([1, 64, 128, 192, 256]); ax.set_yticks([-32, -16, 0, 16, 32])
ax.tick_params(colors=fg, labelsize=12)
for side in ("top", "right"):
    ax.spines[side].set_visible(False)
for side in ("left", "bottom"):
    ax.spines[side].set_color(muted)
style.tex(ax, d / 2, -2.6 * np.sqrt(d) - 9, r"dimension $d_{\text{model}}$", ha="center", va="top", fontsize=15, color=fg)
style.tex(ax, -26, 0, r"$\displaystyle\sum\nolimits_{i \le d_{\text{model}}} q_i k_i$", ha="right", va="center", fontsize=17, color=fg, rotation=90)

x0 = 0.625
lines = [
    (r"$q_i, k_i$ independent, mean $0$, variance $1$", 16, fg),
    (r"$\mathbb{E}[q \cdot k] = 0$", 18, fg),
    (r"$\mathrm{Var}(q \cdot k) = \displaystyle\sum_{i=1}^{d_{\text{model}}} \mathrm{Var}(q_i k_i) = d_{\text{model}}$", 18, fg),
    (r"typical size of $q \cdot k$: $\sqrt{d_{\text{model}}}$", 18, hot),
    (r"so we use $\dfrac{q \cdot k}{\sqrt{d_{\text{model}}}}$", 18, accent),
]
for (text, size, colour), y in zip(lines, (0.88, 0.72, 0.56, 0.38, 0.17)):
    style.tex(fig, x0, y, text, ha="left", va="center", fontsize=size, color=colour)
print("std of q.k over", pairs, "pairs at d =", d, ":", partial[:, -1].std().round(1), "(sqrt d =", np.sqrt(d), ")")
style.save(fig, "dot_product_growth")
