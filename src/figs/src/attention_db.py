"""Draw the attention-as-database figures.

python attention_db.py generic out.svg   -> query q_i against a key/value table
python attention_db.py example out.svg   -> q_it against (k_cat, v_cat), (k_mat, v_mat)
python attention_db.py match out.svg     -> same, with a strong link to k_cat and a weak one to k_mat

Query and keys share a colour and a shape (they are compared with each other);
values have another colour and shape (they live in another space and are what is returned).
"""
import matplotlib
import style  # Agg backend, LaTeX-style math, SVG text as outlines
import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch


def draw(mode):
    fg, node, muted = "#eee8d5", "#073642", "#93a1a1"
    qk, val = "#cb4b16", "#859900"           # query/key colour, value colour

    if mode == "generic":
        query, qnote = "$q_i$", "what am I\nlooking for?"
        rows = [(f"$k_{j}$", f"$v_{j}$") for j in range(1, 5)]
        knotes = vnotes = None
        strength = [1, 1, 1, 1]
    else:
        query, qnote = r"$q_{\mathrm{it}}$", "which noun does\n\"it\" refer to?"
        rows = [(r"$k_{\mathrm{cat}}$", r"$v_{\mathrm{cat}}$"), (r"$k_{\mathrm{mat}}$", r"$v_{\mathrm{mat}}$")]
        knotes = ["noun: an animal", "noun: an object"]
        vnotes = ["content of \"cat\"", "content of \"mat\""]
        strength = [1, 1] if mode == "example" else [3, 0.25]

    fig, ax = plt.subplots(figsize=(11, 3.8 if len(rows) == 4 else 3.4), facecolor="none")
    ax.set_facecolor("none"); ax.set_aspect("equal"); ax.axis("off")
    h, gap = 0.62, (0.22 if mode == "generic" else 0.8)
    n = len(rows)
    ys = [((n - 1) / 2 - r) * (h + gap) for r in range(n)]
    kx, vx, w = 6.0, 9.3, 2.4

    def key_box(x, y, text, lw=1.8, alpha=1.0):        # square-ish box, same style as the query
        ax.add_patch(FancyBboxPatch((x, y - h / 2), w, h, boxstyle="round,pad=0.04,rounding_size=0.08",
                                    fc=node, ec=qk, lw=lw, alpha=alpha, zorder=2))
        ax.text(x + w / 2, y, text, ha="center", va="center", fontsize=17, color=fg, zorder=3)

    def value_box(x, y, text, lw=1.8, alpha=1.0):      # pill shape, another colour
        ax.add_patch(FancyBboxPatch((x, y - h / 2), w, h, boxstyle="round,pad=0.04,rounding_size=0.31",
                                    fc=val, ec="none", alpha=0.28 * alpha, zorder=2))
        ax.add_patch(FancyBboxPatch((x, y - h / 2), w, h, boxstyle="round,pad=0.04,rounding_size=0.31",
                                    fc="none", ec=val, lw=lw, alpha=alpha, zorder=2))
        ax.text(x + w / 2, y, text, ha="center", va="center", fontsize=17, color=fg, zorder=3)

    # query, in the key style
    ax.add_patch(FancyBboxPatch((0.4, -h / 2), 1.6, h, boxstyle="round,pad=0.04,rounding_size=0.08", fc=node, ec=qk,
                                lw=2.6, zorder=2))
    ax.text(1.2, 0.0, query, ha="center", va="center", fontsize=19, color=fg, zorder=3)
    ax.text(1.2, -0.75, qnote, ha="center", va="top", fontsize=12.5, color=muted, style="italic")
    ax.text(kx + w / 2, ys[0] + h / 2 + 0.35, "keys\n(matched with $q$)", ha="center", va="bottom", fontsize=13, color=qk)
    ax.text(vx + w / 2, ys[0] + h / 2 + 0.35, "values\n(what is returned)", ha="center", va="bottom", fontsize=13, color=val)
    for r, ((k, v), y) in enumerate(zip(rows, ys)):
        strong = mode == "match" and r == 0
        weak = mode == "match" and r > 0
        key_box(kx, y, k, lw=3 if strong else 1.8, alpha=0.5 if weak else 1.0)
        value_box(vx, y, v, lw=3 if strong else 1.8, alpha=0.5 if weak else 1.0)
        ax.annotate("", xy=(vx - 0.1, y), xytext=(kx + w + 0.1, y),
                    arrowprops=dict(arrowstyle="->", color=fg, lw=1, alpha=0.5), zorder=1)
        if knotes:
            ax.text(kx + w / 2, y - h / 2 - 0.08, knotes[r], ha="center", va="top", fontsize=11.5, color=muted, style="italic")
            ax.text(vx + w / 2, y - h / 2 - 0.08, vnotes[r], ha="center", va="top", fontsize=11.5, color=muted, style="italic")
        lw = 1.2 + 2.6 * strength[r]
        ax.annotate("", xy=(kx - 0.08, y), xytext=(2.1, 0.0),
                    arrowprops=dict(arrowstyle="-|>", color=qk if not weak else fg, lw=lw,
                                    alpha=0.95 if not weak else 0.3, mutation_scale=14 + 4 * strength[r]), zorder=1)
    if mode == "generic":
        ax.text(4.0, ys[0] + 0.55, "compare with\nevery key", ha="center", va="bottom", fontsize=12.5, color=fg, alpha=0.85)
        ax.text(vx + w + 0.3, 0.0, "return a mix\nof the values,\nweighted by\nthe match", ha="left", va="center",
                fontsize=12.5, color=val)
    elif mode == "example":
        ax.text(4.0, ys[0] + 0.45, "compare", ha="center", va="bottom", fontsize=12.5, color=fg, alpha=0.85)
    else:
        ax.text(4.1, ys[0] + 0.42, r"large $q \cdot k$", ha="center", va="bottom", fontsize=13, color=qk)
        ax.text(4.1, ys[1] - 0.55, r"small $q \cdot k$", ha="center", va="top", fontsize=13, color=fg, alpha=0.6)
        ax.annotate("", xy=(vx + w + 0.9, ys[0]), xytext=(vx + w + 0.12, ys[0]),
                    arrowprops=dict(arrowstyle="-|>", color=val, lw=3, mutation_scale=20))
        ax.text(vx + w + 1.05, ys[0], r"mostly $v_{\mathrm{cat}}$", ha="left", va="center", fontsize=15, color=val)
    right = vx + w + 3.2
    ax.plot([0.25, right], [min(ys) - 1.1, ys[0] + 1.5], alpha=0)   # same canvas for every mode
    ax.set_xlim(0.2, right); ax.set_ylim(min(ys) - 1.2, ys[0] + 1.6)
    return fig


for mode, name in {'generic': 'attention_db', 'example': 'attention_db_example', 'match': 'attention_db_match'}.items():
    style.save(draw(mode), name)
