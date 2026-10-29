"""Draw src/figs/embedding_lookup.svg: a token id selects one row of GPT-2's embedding matrix.
Needs the GPT-2 weights (downloaded once by transformers)."""
import numpy as np
import style  # Agg backend, LaTeX-style math, SVG text as outlines
import matplotlib.pyplot as plt
from matplotlib.patches import Rectangle
from transformers import GPT2Model, GPT2TokenizerFast
from transformers.utils import logging as hf_logging

hf_logging.set_verbosity_error()
hf_logging.disable_progress_bar()

tok = GPT2TokenizerFast.from_pretrained("gpt2")  # the same token ids as tiktoken's "gpt2" encoding in the slides
E = GPT2Model.from_pretrained("gpt2").wte.weight.detach().numpy()   # (50257, 768): one row per token

shown = [" the", " man", " car", " woman", " king", " milk", " cheese", " queen"]
ids = sorted(tok.encode(w)[0] for w in shown)    # rows in matrix order
labels = [tok.decode([i]).strip() for i in ids]
n_cols = 12
block = E[ids, :n_cols]
target = labels.index("king")

fg, accent, hot, box = "#eee8d5", "#268bd2", "#cb4b16", "#073642"
fig = plt.figure(figsize=(11, 3.6), facecolor="none")
# keep the left margin: the tight crop ignores the boxes drawn around the texts
fig.add_artist(Rectangle((0, 0.5), 0.001, 0.001, transform=fig.transFigure, fc="none", ec="none"))
fig.text(0.10, 0.82, '"king"', ha="center", va="center", fontsize=16, color=fg,
         bbox=dict(boxstyle="round,pad=0.5", fc=box, ec=accent, lw=2))
fig.text(0.10, 0.66, "↓", ha="center", va="center", fontsize=22, color=accent)
fig.text(0.10, 0.50, f"token id {ids[target]:,}", ha="center", va="center", fontsize=16, color=fg,
         bbox=dict(boxstyle="round,pad=0.5", fc=box, ec=accent, lw=2))

ax = fig.add_axes([0.33, 0.16, 0.44, 0.76])
lim = np.abs(block).max()
ax.imshow(block, cmap="RdBu_r", vmin=-lim, vmax=lim, aspect="auto")
ax.set_yticks(range(len(ids)), [f"{i:>6,}  {w}" for i, w in zip(ids, labels)],
              fontsize=12, color=fg, family="monospace")
ax.set_xticks(range(n_cols), [str(j) for j in range(n_cols)], fontsize=9, color=fg)
ax.tick_params(length=0)
for side in ax.spines.values():
    side.set_visible(False)
ax.add_patch(Rectangle((-0.5, target - 0.5), n_cols, 1, fill=False, ec=hot, lw=3))
ax.text(n_cols - 0.2, target, "← vector of \"king\"", va="center", fontsize=13, color=hot)
fig.text(0.33, 0.03, f"E has {E.shape[0]:,} rows (one per token) and {E.shape[1]} columns: "
         f"{len(ids)} rows and {n_cols} columns shown.", fontsize=12, color=fg)
style.save(fig, "embedding_lookup")
