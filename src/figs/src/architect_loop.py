"""Draw src/figs/architect_loop.svg: the loop of the architect, with the model in only one of its four steps."""
import style  # Agg backend, LaTeX-style math, SVG text as outlines
import matplotlib.pyplot as plt
from matplotlib.patches import FancyArrowPatch, FancyBboxPatch

fg, you, model, box, muted = "#eee8d5", "#cb4b16", "#268bd2", "#073642", "#93a1a1"

steps = [
    ("Formulate", "state the problem\nprecisely", you),
    ("Delegate", "the model writes code,\nproofs, drafts", model),
    ("Verify", "tests, baselines,\nsanity checks", you),
    ("Understand", "keep what you\ncan explain", you),
]
w, h, gap = 3.2, 1.0, 0.9
xs = [i * (w + gap) for i in range(len(steps))]

fig, ax = plt.subplots(figsize=(12, 3.6), facecolor="none")
ax.set_facecolor("none"); ax.axis("off"); ax.set_aspect("equal")

for x, (title, sub, col) in zip(xs, steps):
    ax.add_patch(FancyBboxPatch((x, 0), w, h, boxstyle="round,pad=0.02,rounding_size=0.15", fc=box, ec=col, lw=2.5))
    ax.text(x + w / 2, h / 2, title, ha="center", va="center", fontsize=18, color=fg, weight="bold")
    ax.text(x + w / 2, -0.35, sub, ha="center", va="top", fontsize=13, color=muted, linespacing=1.3)

for x0, x1 in zip(xs[:-1], xs[1:]):
    ax.add_patch(FancyArrowPatch((x0 + w + 0.05, h / 2), (x1 - 0.05, h / 2), arrowstyle="-|>", mutation_scale=22, color=fg, lw=2))

# the return: what we understood changes the next question
back = FancyArrowPatch((xs[-1] + w / 2, h + 0.08), (xs[0] + w / 2, h + 0.08), connectionstyle="arc3,rad=0.22",
                       arrowstyle="-|>", mutation_scale=22, color=muted, lw=2, linestyle=(0, (5, 4)))
ax.add_patch(back)
ax.text((xs[0] + xs[-1] + w) / 2, h + 1.0, "a better question", ha="center", va="center", fontsize=14, color=muted)

# legend
ly = -2.2
ax.text(xs[0], ly, "orange: you", ha="left", va="center", fontsize=14, color=you)
ax.text(xs[0] + 3.6, ly, "blue: the model", ha="left", va="center", fontsize=14, color=model)

ax.set_xlim(-0.2, xs[-1] + w + 0.2); ax.set_ylim(-2.5, h + 1.9)

style.save(fig, "architect_loop")
