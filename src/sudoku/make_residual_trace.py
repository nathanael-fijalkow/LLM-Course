"""Cache one forward pass of the Sudoku transformer for the residual-stream animation of deck 09.

The trained model of Kniazev & Fijalkow (2026, arXiv:2605.18847) is run on one grid, and everything
the animation draws is written to `residual_trace.json` next to this script: the residual stream at
the [clues_end] position after each component, what each component writes, the attention patterns,
the MLP neurons, and two readouts of the stream (linear probes and the logit lens).

The deck only reads the JSON, so rendering it needs neither JAX nor the checkpoint. To rebuild the
cache, run this script with the environment of the companion repository, from the root of llm_mva:

    uv run --project ../sudoku-residual python src/sudoku/make_residual_trace.py --sudoku-dir ../sudoku-residual

It needs `results/3M-backtracking-packing/{checkpoint,activations.npz}` from the paper artifacts
(Hugging Face dataset residual-sudoku-dataset/residual-sudoku-dataset). Takes about seven minutes on a laptop
CPU, mostly to fit the probes.
"""

import argparse
import json
import os
import sys

import numpy as np

PUZZLE = ("530070000" "600195000" "098000060"
          "800060003" "400803001" "700020006"
          "060000280" "000419005" "000080079")
END_CLUES = 729
N_PLACEMENTS = 729  # tokens row * 81 + col * 9 + (digit - 1)


# ----------------------------------------------------------------------------------------------
# Sudoku facts
# ----------------------------------------------------------------------------------------------

def cell_name(cell):
    return f"R{cell // 9 + 1}C{cell % 9 + 1}"


def placement_name(token):
    return f"{cell_name(token // 9)}={token % 9 + 1}"


def units(cell):
    r, c = divmod(cell, 9)
    return r, 9 + c, 18 + 3 * (r // 3) + c // 3  # indices among the 27 substructures


def substructure_facts(grid):
    """243 booleans: is digit d present in substructure s? (s = rows 0-8, columns 9-17, boxes 18-26)."""
    present = np.zeros((27, 9), bool)
    for cell, ch in enumerate(grid):
        if ch != "0":
            for s in units(cell):
                present[s, int(ch) - 1] = True
    return present.ravel()


def candidates(grid):
    """(81, 9) booleans: is digit d a candidate of the cell? All False for filled cells."""
    present = substructure_facts(grid).reshape(27, 9)
    out = np.zeros((81, 9), bool)
    for cell, ch in enumerate(grid):
        if ch == "0":
            out[cell] = ~present[list(units(cell))].any(0)
    return out


def clue_tokens(grid, rng):
    """Clues as placement tokens in random order (as in training), then [clues_end]."""
    tokens = [9 * cell + int(ch) - 1 for cell, ch in enumerate(grid) if ch != "0"]
    rng.shuffle(tokens)
    return tokens + [END_CLUES]


# ----------------------------------------------------------------------------------------------
# The model, re-implemented in numpy (float32) to expose every intermediate value
# ----------------------------------------------------------------------------------------------

def layer_norm(x, p, eps=1e-6):
    mean = x.mean(-1, keepdims=True)
    var = ((x - mean) ** 2).mean(-1, keepdims=True)
    return (x - mean) / np.sqrt(var + eps) * p["scale"] + p["bias"]


def gelu(x):  # flax.linen.gelu uses the tanh approximation
    return 0.5 * x * (1 + np.tanh(np.sqrt(2 / np.pi) * (x + 0.044715 * x ** 3)))


class Model:
    def __init__(self, params, config):
        self.p, self.cfg = params, config
        self.n_layers, self.n_heads, self.d = config.n_layers, config.n_heads, config.d_model

    def unembed(self, x):
        return layer_norm(x, self.p["LayerNorm_0"]) @ self.p["lm_head"]["kernel"] + self.p["lm_head"]["bias"]

    def run(self, tokens):
        """Forward pass on a (batch, T) array; returns the per-component values."""
        p, H, D = self.p, self.n_heads, self.d
        B, T = tokens.shape
        hd = D // H
        tok, pos = p["token_emb"]["embedding"][tokens], p["pos_emb"]["embedding"][:T][None]
        x = tok + pos
        out = {"tok": tok, "pos": pos, "states": [x], "writes": [x], "attn": [], "neurons": []}
        causal = np.tril(np.ones((T, T), bool))
        for i in range(self.n_layers):
            b = p[f"block_{i}"]
            att = b["CausalSelfAttention_0"]
            qkv = layer_norm(x, b["LayerNorm_0"]) @ att["qkv"]["kernel"] + att["qkv"]["bias"]
            q, k, v = (m.reshape(B, T, H, hd).transpose(0, 2, 1, 3) for m in np.split(qkv, 3, -1))
            scores = np.where(causal, q @ k.transpose(0, 1, 3, 2) * hd ** -0.5, -1e30)
            a = np.exp(scores - scores.max(-1, keepdims=True))
            a /= a.sum(-1, keepdims=True)
            write = (a @ v).transpose(0, 2, 1, 3).reshape(B, T, D) @ att["proj"]["kernel"] + att["proj"]["bias"]
            x = x + write
            out["states"].append(x); out["writes"].append(write); out["attn"].append(a)
            n = gelu(layer_norm(x, b["LayerNorm_1"]) @ b["Dense_0"]["kernel"] + b["Dense_0"]["bias"])
            write = n @ b["Dense_1"]["kernel"] + b["Dense_1"]["bias"]
            x = x + write
            out["states"].append(x); out["writes"].append(write); out["neurons"].append(n)
        out["logits"] = self.unembed(x)
        return out


def load_model(sudoku_dir):
    sys.path.insert(0, sudoku_dir)
    import jax
    from sudoku.activations import load_checkpoint

    params, flax_model = load_checkpoint(os.path.join(sudoku_dir, "results/3M-backtracking-packing/checkpoint"))
    params = jax.tree_util.tree_map(lambda a: np.asarray(a, np.float32), params)
    return Model(params, flax_model.config), flax_model, params


# ----------------------------------------------------------------------------------------------
# Linear probes on the residual stream at [clues_end], one set per state (embedding, then after
# each attention and each MLP), trained on the 6,400 puzzles of the paper's probe dataset
# ----------------------------------------------------------------------------------------------

def fit_probes(X, Y, mask, steps=600, lr=0.05, l2=1e-3):
    """Independent logistic regressions (one per column of Y), fitted jointly by full-batch Adam."""
    import jax
    import jax.numpy as jnp
    import optax

    mu, sd = X.mean(0), X.std(0) + 1e-6
    Xs, Y, M = jnp.asarray((X - mu) / sd), jnp.asarray(Y, jnp.float32), jnp.asarray(mask, jnp.float32)
    w = {"W": jnp.zeros((X.shape[1], Y.shape[1])), "b": jnp.zeros(Y.shape[1])}
    opt = optax.adam(lr)
    state = opt.init(w)

    def loss(w):
        z = Xs @ w["W"] + w["b"]
        bce = optax.sigmoid_binary_cross_entropy(z, Y) * M
        return bce.sum() / M.sum() + l2 * (w["W"] ** 2).sum() / Y.shape[1]

    @jax.jit
    def step(w, state):
        g = jax.grad(loss)(w)
        updates, state = opt.update(g, state)
        return optax.apply_updates(w, updates), state

    for _ in range(steps):
        w, state = step(w, state)
    W, b = np.asarray(w["W"]), np.asarray(w["b"])
    return Probe(W / sd[:, None], b - (mu / sd) @ W)


class Probe:
    """P(fact | x) = sigmoid(x W + b), one column per fact."""

    def __init__(self, W, b):
        self.W, self.b = W, b

    def __call__(self, Z):
        return 1 / (1 + np.exp(-(Z @ self.W + self.b)))


def probe_dataset(model, sudoku_dir):
    data = np.load(os.path.join(sudoku_dir, "results/3M-backtracking-packing/activations.npz"))
    puzzles = [p.replace(".", "0") for p in data["puzzles"]]
    n_clues = data["n_clues"]
    states = np.zeros((len(puzzles), 2 * model.n_layers + 1, model.d), np.float32)
    for n in np.unique(n_clues):  # batch the puzzles with the same number of clues
        idx = np.flatnonzero(n_clues == n)
        for chunk in np.array_split(idx, max(1, len(idx) // 256)):
            tokens = data["sequences"][chunk, : n + 1].astype(np.int64)
            assert (tokens[:, -1] == END_CLUES).all()
            out = model.run(tokens)
            states[chunk] = np.stack([s[:, -1] for s in out["states"]], 1)
    sub = np.stack([substructure_facts(g) for g in puzzles])
    cand = np.stack([candidates(g).ravel() for g in puzzles])
    empty = np.stack([np.repeat([ch == "0" for ch in g], 9) for g in puzzles])
    return states, sub, cand, empty


def train_probes(model, sudoku_dir, seed=0, cache=None):
    if cache and os.path.exists(cache):
        z = np.load(cache, allow_pickle=True)
        probes = [(Probe(z[f"sW{s}"], z[f"sb{s}"]), Probe(z[f"cW{s}"], z[f"cb{s}"])) for s in range(len(z["report"]))]
        return probes, list(z["report"]), int(z["n_train"])
    states, sub, cand, empty = probe_dataset(model, sudoku_dir)
    n = len(states)
    test = np.zeros(n, bool)
    test[np.random.default_rng(seed).permutation(n)[: n // 8]] = True
    probes, report = [], []
    for s in range(states.shape[1]):
        X = states[:, s]
        p_sub = fit_probes(X[~test], sub[~test], np.ones_like(sub[~test]))
        p_cand = fit_probes(X[~test], cand[~test], empty[~test])
        ps, pc = p_sub(X[test]) > 0.5, p_cand(X[test]) > 0.5
        e = empty[test]
        report.append({
            "sub_elementwise": round(float((ps == sub[test]).mean()), 4),
            "sub_exact": round(float((ps == sub[test]).all(1).mean()), 4),
            "cand_elementwise": round(float(((pc == cand[test]) & e).sum() / e.sum()), 4),
            "cand_exact": round(float(((pc == cand[test]) | ~e).all(1).mean()), 4),
        })
        probes.append((p_sub, p_cand))
        print(f"state {s:2d}: substructure acc {report[-1]['sub_elementwise']:.3f} (all 243: {report[-1]['sub_exact']:.2f})"
              f"  candidates acc {report[-1]['cand_elementwise']:.3f} (all: {report[-1]['cand_exact']:.2f})", flush=True)
    n_train = int((~test).sum())
    if cache:
        arrays = {}
        for s, (ps, pc) in enumerate(probes):
            arrays.update({f"sW{s}": ps.W, f"sb{s}": ps.b, f"cW{s}": pc.W, f"cb{s}": pc.b})
        np.savez(cache, report=np.array(report, dtype=object), n_train=n_train, **arrays)
    return probes, report, n_train


# ----------------------------------------------------------------------------------------------
# What the animation needs
# ----------------------------------------------------------------------------------------------

def quantize(v, scale, top=99):
    return np.clip(np.round(v / scale * top), -top, top).astype(int).tolist()


def head_focus(attn_row, tokens):
    """Where one head looks from [clues_end]: the row, column, box, band or stack it attends to most,
    relative to its share of the clues. Returns (label, kind, index, attention mass) or None."""
    cells = [t // 9 for t in tokens[:-1]]
    groups = []
    for k in range(9):
        groups.append((f"row {k + 1}", "row", k, lambda c, k=k: c // 9 == k))
        groups.append((f"column {k + 1}", "col", k, lambda c, k=k: c % 9 == k))
        groups.append((f"box {k + 1}", "box", k, lambda c, k=k: 3 * (c // 27) + (c % 9) // 3 == k))
    for k in range(3):
        groups.append((f"rows {3 * k + 1}–{3 * k + 3}", "band", k, lambda c, k=k: c // 27 == k))
        groups.append((f"columns {3 * k + 1}–{3 * k + 3}", "stack", k, lambda c, k=k: (c % 9) // 3 == k))
    best, best_lift = None, 1.8  # at least 1.8 times the attention that uniform attention would give
    for label, kind, k, inside in groups:
        mass = sum(a for a, c in zip(attn_row, cells) if inside(c))
        share = sum(inside(c) for c in cells) / len(cells)
        if mass >= 0.45 and share > 0 and mass / share > best_lift:
            best, best_lift = [label, kind, k, round(float(mass), 2)], mass / share
    return best


def neuron_role(model, layer, neuron, act, x_final):
    """What a neuron does to the output, read from its weights: its write act * W_out[neuron], passed through
    the final LayerNorm (linearised at the final stream x_final) and W_U. Returns the cell (or the box) whose
    placements it boosts most, and the boost in logits, or None when its 9 largest boosts are scattered."""
    p = model.p
    w = act * p[f"block_{layer}"]["Dense_1"]["kernel"][neuron]
    sigma = np.sqrt(x_final.var() + 1e-6)
    dla = ((w - w.mean()) * p["LayerNorm_0"]["scale"] / sigma) @ p["lm_head"]["kernel"][:, :N_PLACEMENTS]
    top = np.argsort(dla)[::-1][:9]
    cells = sorted({int(t) // 9 for t in top})
    boost = round(float(dla[top].mean()), 2)
    if len(cells) == 1:
        return {"kind": "cell", "cell": cells[0], "boost": boost}
    boxes = {3 * (c // 27) + (c % 9) // 3 for c in cells}
    if len(cells) == 9 and len(boxes) == 1:
        return {"kind": "box", "box": boxes.pop(), "boost": boost}
    return None


def lens(model, x):
    logits = model.unembed(x)[:N_PLACEMENTS]
    p = np.exp(logits - logits.max())
    p /= p.sum()
    return logits, p


def build(model, probes, report, n_train, seed):
    grid = PUZZLE
    tokens = clue_tokens(grid, np.random.default_rng(seed))
    out = model.run(np.array([tokens]))
    T = len(tokens)
    true_sub, true_cand = substructure_facts(grid), candidates(grid)
    empty = np.array([ch == "0" for ch in grid])
    naked = [c for c in range(81) if empty[c] and true_cand[c].sum() == 1]

    names = ["Embedding"] + [f"L{l + 1} {k}" for l in range(model.n_layers) for k in ("attention", "MLP")]
    stations = []
    for s, name in enumerate(names):
        x, write = out["states"][s][0, -1], out["writes"][s][0, -1]
        scale = 3 * np.sqrt((x ** 2).mean())  # colours saturate at 3 RMS
        logits, prob = lens(model, x)
        p_sub, p_cand = probes[s]
        ps, pc = p_sub(x[None])[0], p_cand(x[None])[0].reshape(81, 9)
        top = np.argsort(prob)[::-1][:4]
        st = {
            "name": name,
            "norm": round(float(np.linalg.norm(x)), 1),
            "write_norm": round(float(np.linalg.norm(write)), 1),
            "x": quantize(x, scale),
            "write": quantize(write, scale),
            "cand": [[int(round(99 * v)) for v in pc[c]] if empty[c] else [] for c in range(81)],
            "cand_ok": int(((pc > 0.5) == true_cand)[empty].sum()),
            "sub_ok": int(((ps > 0.5) == true_sub).sum()),
            "probe_acc": report[s],
            "lens_cells": [round(float(prob[9 * c: 9 * c + 9].sum()), 3) for c in range(81)],
            "lens_top": [[int(t), round(float(prob[t]), 3)] for t in top],
        }
        if s == 0:
            tq = 3 * np.sqrt((out["tok"][0, -1] ** 2).mean())
            st["tok"] = quantize(out["tok"][0, -1], tq)
            st["pos"] = quantize(out["pos"][0, -1], tq)
        elif s % 2 == 1:  # attention: the pattern of each head from [clues_end]
            layer = (s - 1) // 2
            a = out["attn"][layer][0, :, -1]  # (heads, T)
            st["heads"] = [{
                "cells": [[t // 9, round(float(w), 3)] for t, w in zip(tokens[:-1], a[h, :-1])],
                "self": round(float(a[h, -1]), 3),
                "focus": head_focus(a[h], tokens),
            } for h in range(model.n_heads)]
        else:  # MLP: the hidden neurons, and the role of the strongest ones
            layer = (s - 2) // 2
            n = out["neurons"][layer][0, -1]
            st["neurons"] = np.clip(np.round(n * 10), -9, 99).astype(int).tolist()
            st["top_neurons"] = []
            for k in np.argsort(n)[::-1][:6]:
                st["top_neurons"].append({"index": int(k), "act": round(float(n[k]), 2),
                                          "role": neuron_role(model, layer, int(k), float(n[k]), out["states"][-1][0, -1])})
        stations.append(st)

    final = out["logits"][0, -1][:N_PLACEMENTS]
    fp = np.exp(final - final.max())
    fp /= fp.sum()
    return {
        "grid": grid,
        "tokens": tokens,
        "naked_singles": [[c, int(np.flatnonzero(true_cand[c])[0]) + 1] for c in naked],
        "true_cand": [np.flatnonzero(true_cand[c]).tolist() for c in range(81)],
        "n_probe_train": n_train,
        "stations": stations,
        "logits": np.round(final, 1).tolist(),
        "final_top": [[int(t), round(float(fp[t]), 3)] for t in np.argsort(fp)[::-1][:6]],
        "config": {"layers": model.n_layers, "heads": model.n_heads, "d_model": model.d,
                   "d_mlp": int(model.p["block_0"]["Dense_0"]["kernel"].shape[1]), "positions": T},
    }


def check_against_flax(model, flax_model, params, tokens):
    """The numpy forward pass must agree with the Flax model of the paper (run in float32)."""
    import dataclasses
    import jax.numpy as jnp

    ref_model = type(flax_model)(dataclasses.replace(flax_model.config, dtype="float32"))
    ref = np.asarray(ref_model.apply({"params": params}, jnp.array([tokens])))[0]
    gap = np.abs(ref - model.run(np.array([tokens]))["logits"][0]).max()
    print(f"max |logit difference| with the Flax model: {gap:.1e}")
    assert gap < 1e-3


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--sudoku-dir", default="../sudoku-residual")
    ap.add_argument("--out", default=os.path.join(os.path.dirname(os.path.abspath(__file__)), "residual_trace.json"))
    ap.add_argument("--seed", type=int, default=0, help="order of the clue tokens, and probe train/test split")
    ap.add_argument("--probe-cache", help="npz file keeping the fitted probes between runs (optional)")
    args = ap.parse_args()

    sudoku_dir = os.path.abspath(args.sudoku_dir)
    model, flax_model, params = load_model(sudoku_dir)
    check_against_flax(model, flax_model, params, clue_tokens(PUZZLE, np.random.default_rng(args.seed)))
    probes, report, n_train = train_probes(model, sudoku_dir, args.seed, args.probe_cache)
    data = build(model, probes, report, n_train, args.seed)
    with open(args.out, "w") as f:
        json.dump(data, f, separators=(",", ":"))
    print(f"wrote {args.out} ({os.path.getsize(args.out) / 1e3:.0f} kB)")
    print("final top placements:", [(placement_name(t), p) for t, p in data["final_top"]])


if __name__ == "__main__":
    main()
