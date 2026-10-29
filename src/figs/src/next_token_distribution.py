"""Draw src/figs/next_token_distribution.svg: GPT-2's next-token distribution after "The capital of France is",
with four sampled continuations. Needs the GPT-2 weights (downloaded once by transformers)."""
import torch
import style  # Agg backend, LaTeX-style math, SVG text as outlines
import matplotlib.pyplot as plt
from transformers import GPT2LMHeadModel, GPT2TokenizerFast
from transformers.utils import logging as hf_logging

hf_logging.set_verbosity_error()
hf_logging.disable_progress_bar()

tok = GPT2TokenizerFast.from_pretrained("gpt2")
lm = GPT2LMHeadModel.from_pretrained("gpt2").eval()
prompt = "The capital of France is"  # no trailing space: with one, the top token is a non-breaking space
ids = tok(prompt, return_tensors="pt").input_ids
with torch.no_grad():
    probs = torch.softmax(lm(ids).logits[0, -1], dim=-1)    # distribution over 50,257 tokens
top_p, top_i = probs.topk(10)
words = [tok.decode([i]).strip() for i in top_i]
torch.manual_seed(0)
runs = lm.generate(ids, do_sample=True, top_k=0, max_new_tokens=5, num_return_sequences=4,
                   pad_token_id=tok.eos_token_id)
samples = [tok.decode(r[ids.shape[1]:]).strip() for r in runs]

fg, accent, hot, box = "#eee8d5", "#268bd2", "#cb4b16", "#073642"
fig = plt.figure(figsize=(11, 3.4), facecolor="none")
# keep the left margin: the tight crop ignores the box drawn around the prompt
fig.add_artist(plt.Rectangle((0, 0.5), 0.001, 0.001, transform=fig.transFigure, fc="none", ec="none"))
fig.text(0.03, 0.86, prompt + " ...", ha="left", va="center", fontsize=16, color=fg,
         bbox=dict(boxstyle="round,pad=0.6", fc=box, ec=accent, lw=2))
fig.text(0.36, 0.86, "→", ha="left", va="center", fontsize=30, color=accent)
fig.text(0.03, 0.62, "Four runs of the model:", fontsize=13, color=accent)
for k, run in enumerate(samples):
    fig.text(0.03, 0.50 - 0.12 * k, "... is " + run + " ...", fontsize=13, color=fg, style="italic")
ax = fig.add_axes([0.55, 0.2, 0.38, 0.75], facecolor="none")
ys = list(range(10))[::-1]
ax.barh(ys, top_p.numpy() * 100, color=[hot if w == "Paris" else accent for w in words], height=0.7)
ax.set_yticks(ys, words, fontsize=13, color=fg)
for y, q in zip(ys, top_p.tolist()):
    ax.text(q * 100 + 0.15, y, f"{q * 100:.1f}%", va="center", fontsize=12, color=fg)
ax.set_xticks([])
for side in ["top", "right", "bottom", "left"]:
    ax.spines[side].set_visible(False)
ax.tick_params(left=False)
fig.text(0.55, 0.07, f"Top 10 next tokens. The other {len(probs) - 10:,}\ntokens share the remaining "
         f"{100 * (1 - top_p.sum()):.0f}%.", fontsize=12, color=fg)
print("top 10:", [f"{w} {100 * q:.1f}%" for w, q in zip(words, top_p.tolist())])
style.save(fig, "next_token_distribution")
