"""Draw src/figs/perplexity_example.svg: GPT-2's loss on each token of "The capital of France is Paris.",
its average and the perplexity. Needs the GPT-2 weights (downloaded once by transformers)."""
import math

import torch
import style  # Agg backend, LaTeX-style math, SVG text as outlines
import matplotlib.pyplot as plt
from transformers import GPT2LMHeadModel, GPT2TokenizerFast
from transformers.utils import logging as hf_logging

hf_logging.set_verbosity_error()
hf_logging.disable_progress_bar()

tok = GPT2TokenizerFast.from_pretrained("gpt2")
lm = GPT2LMHeadModel.from_pretrained("gpt2").eval()
text = "The capital of France is Paris."
ids = tok(text).input_ids  # no start token: "Paris" then gets the 3% of the previous slide; "The" is only context
with torch.no_grad():
    logp = torch.log_softmax(lm(torch.tensor([ids])).logits[0, :-1], dim=-1)
targets = torch.tensor(ids[1:])
nll = -logp[torch.arange(len(targets)), targets]  # -log P(x_t | x_<t), in nats
words = [tok.decode([i]).strip() for i in targets]
first = tok.decode([ids[0]]).strip()
mean = nll.mean().item()
ppl = math.exp(mean)

fg, accent, hot, muted = "#eee8d5", "#268bd2", "#cb4b16", "#93a1a1"
fig, ax = plt.subplots(figsize=(6, 6), facecolor="none")  # tall: the figure sits in a column, next to the formula
ax.set_facecolor("none")
ys = [-(i + 1) for i in range(len(words))]  # one row per token, in reading order
ax.barh(ys, nll.numpy(), color=accent, height=0.65)
px = nll.max().item() + 1.0  # the probabilities, in a column right of the bars
ax.text(px, 0, "$p$", ha="left", va="center", fontsize=28, color=muted)
for y, v in zip(ys, nll.tolist()):
    ax.text(px, y, f"${math.exp(-v):.2g}$", ha="left", va="center", fontsize=27, color=fg)
ax.text(0.15, 0, "given", ha="left", va="center", fontsize=24, color=muted, style="italic")
ax.plot([mean, mean], [-0.5, -len(words) - 0.5], color=hot, lw=2, ls=(0, (5, 4)))
style.tex(ax, mean, -len(words) - 1.1, rf"average $= {mean:.2f}$", ha="center", va="center", fontsize=30, color=hot)
style.tex(ax, mean, -len(words) - 2.2, rf"$\mathrm{{PPL}} = e^{{{mean:.2f}}} \approx {ppl:.0f}$",
          ha="center", va="center", fontsize=30, color=hot)
ax.set_yticks([0] + ys, [first] + words, fontsize=30)
for label in ax.get_yticklabels():
    label.set_color(muted if label.get_text() == first else fg)
ax.set_xlabel(r"$-\log P(x_t \mid x_{<t})$", fontsize=28, color=fg)
ax.set_xticks(range(0, 10, 2))
ax.tick_params(axis="x", colors=muted, labelsize=24)
ax.tick_params(axis="y", length=0)
for side in ["top", "right", "left"]:
    ax.spines[side].set_visible(False)
ax.spines["bottom"].set_color(muted)
ax.set_ylim(-len(words) - 2.9, 0.6)
ax.set_xlim(0, nll.max().item() + 3.0)
print("tokens:", [f"{w} {v:.2f}" for w, v in zip(words, nll.tolist())], f"mean {mean:.3f} ppl {ppl:.2f}")
style.save(fig, "perplexity_example")
