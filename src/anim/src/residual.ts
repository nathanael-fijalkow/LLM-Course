// The residual stream of the Sudoku transformer (Kniazev & Fijalkow, 2026), followed at the
// [clues_end] position through every component. The forward pass is cached by
// src/sudoku/make_residual_trace.py; this view only draws it.

namespace Anim {
  interface Head {
    cells: [number, number][]; // (cell of the clue token, attention weight from [clues_end])
    self: number; // attention of [clues_end] to itself
    focus: [string, string, number, number] | null; // label, kind, index, attention mass
  }

  type Role = { kind: "cell"; cell: number; boost: number } | { kind: "box"; box: number; boost: number } | null;

  interface Station {
    name: string;
    norm: number;
    write_norm: number;
    x: number[]; // residual stream after the component, in [-99, 99] (99 = 3 RMS)
    write: number[]; // what the component added, same scale
    cand: number[][]; // candidate probes, per empty cell, per digit, in [0, 99]
    cand_ok: number;
    sub_ok: number;
    lens_cells: number[]; // logit lens: probability of playing in each cell
    lens_top: [number, number][]; // (placement token, probability)
    tok?: number[];
    pos?: number[];
    heads?: Head[];
    neurons?: number[]; // GELU outputs, times 10
    top_neurons?: { index: number; act: number; role: Role }[];
  }

  interface ResidualData {
    grid: string;
    tokens: number[];
    naked_singles: [number, number][];
    true_cand: number[][];
    n_probe_train: number;
    stations: Station[];
    logits: number[];
    final_top: [number, number][];
    config: { layers: number; heads: number; d_model: number; d_mlp: number; positions: number };
    steps: Step[]; // 0: the input, then one step per station, then the unembedding
  }

  type RGB = [number, number, number];
  const BASE: RGB = [10, 52, 64];
  const POS: RGB = [255, 183, 77];
  const NEG: RGB = [79, 195, 247];
  const HOT: RGB = [255, 213, 79];

  function mix(target: RGB, t: number): RGB {
    const u = Math.pow(Math.min(1, Math.max(0, t)), 0.7); // keep small values visible
    return [0, 1, 2].map((k) => Math.round(BASE[k] + (target[k] - BASE[k]) * u)) as RGB;
  }

  const diverging = (v: number): RGB => (v >= 0 ? mix(POS, v / 99) : mix(NEG, -v / 99));
  const rgb = (c: RGB): string => `rgb(${c[0]},${c[1]},${c[2]})`;

  // Heatmaps are drawn on a canvas (one pixel block per value) and placed in the SVG as an image
  const images = new Map<string, string>();

  function heatImage(key: string, values: number[], cols: number, colour: (v: number) => RGB, at = (k: number) => k): string {
    const cached = images.get(key);
    if (cached) {
      return cached;
    }
    const rows = Math.ceil(values.length / cols), s = 6;
    const canvas = document.createElement("canvas");
    canvas.width = cols * s;
    canvas.height = rows * s;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = rgb(BASE);
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    values.forEach((v, k) => {
      const p = at(k);
      ctx.fillStyle = rgb(colour(v));
      ctx.fillRect((p % cols) * s, Math.floor(p / cols) * s, s, s);
    });
    const url = canvas.toDataURL();
    images.set(key, url);
    return url;
  }

  // 729 placements as a 27 x 27 picture: one 3 x 3 block per cell, digits 1-9 in reading order
  const placementPixel = (t: number): number => {
    const cell = Math.floor(t / 9), d = t % 9;
    return (3 * Math.floor(cell / 9) + Math.floor(d / 3)) * 27 + 3 * (cell % 9) + (d % 3);
  };

  const cellName = (c: number): string => `R${Math.floor(c / 9) + 1}C${(c % 9) + 1}`;
  const placementName = (t: number): string => `${cellName(Math.floor(t / 9))}=${(t % 9) + 1}`;
  const pct = (p: number): string => `${Math.round(100 * p)}%`;

  function focusShort(f: [string, string, number, number]): string {
    const k = f[2];
    const tag = { row: `R${k + 1}`, col: `C${k + 1}`, box: `B${k + 1}`, band: `R${3 * k + 1}–${3 * k + 3}`, stack: `C${3 * k + 1}–${3 * k + 3}` }[f[1]];
    return `${tag} · ${pct(f[3])}`;
  }

  // Cells of a focus group, as a rectangle in grid coordinates (col, row, width, height)
  function focusRect(f: [string, string, number, number]): [number, number, number, number] {
    const k = f[2];
    switch (f[1]) {
      case "row": return [0, k, 9, 1];
      case "col": return [k, 0, 1, 9];
      case "box": return [3 * (k % 3), 3 * Math.floor(k / 3), 3, 3];
      case "band": return [0, 3 * k, 9, 3];
      default: return [3 * k, 0, 3, 9];
    }
  }

  let instances = 0;

  function mountResidual(host: HTMLElement, raw: unknown): Player {
    const data = raw as ResidualData;
    const uid = `res-${instances++}`;
    const S = data.stations;
    const nStations = S.length; // embedding + 2 per layer
    const last = nStations; // index of the unembedding station
    const svg = el("svg", { viewBox: "0 0 1050 500", role: "img", "aria-label": "Residual stream of the Sudoku transformer" });
    host.appendChild(svg);
    const defs = el("defs", {}, svg);
    const marker = el("marker", { id: `${uid}-arrow`, viewBox: "0 0 10 10", refX: 8, refY: 5, markerWidth: 6, markerHeight: 6, orient: "auto" }, defs);
    el("path", { d: "M 0 0 L 10 5 L 0 10 z", fill: C.node }, marker);
    const root = el("g", {}, svg);
    let player: Player | undefined;

    const text = (parent: Element, x: number, y: number, s: string, attrs: Record<string, string | number> = {}): SVGTextElement =>
      el("text", { x, y, fill: C.text, "font-size": 13, ...attrs }, parent, s);

    const image = (parent: Element, href: string, x: number, y: number, w: number, h: number): void => {
      el("image", { href, x, y, width: w, height: h, preserveAspectRatio: "none", style: "image-rendering: pixelated" }, parent);
      el("rect", { x, y, width: w, height: h, fill: "none", stroke: "#586e75", "stroke-width": 0.8 }, parent);
    };

    const stream = (key: string, values: number[]): string => heatImage(key, values, 24, diverging);

    // ------------------------------------------------------------------ the pipeline (top band)
    const X0 = 40, DX = 55, BW = 46, LINE = 80;
    const stationX = (k: number): number => X0 + k * DX;
    const stationLabel = (k: number): string => (k === 0 ? "Emb" : k === last ? "Unemb" : k % 2 === 1 ? "Attn" : "MLP");

    function drawPipeline(parent: Element, current: number): void {
      el("line", { x1: 12, y1: LINE, x2: 1038, y2: LINE, stroke: C.node, "stroke-width": 2, "marker-end": `url(#${uid}-arrow)` }, parent);
      for (let l = 0; l < data.config.layers; l++) {
        const x = stationX(2 * l + 1) - BW / 2 - 3;
        el("rect", { x, y: 21, width: DX + BW + 6, height: 42, rx: 6, fill: "none", stroke: "#2c5a66", "stroke-width": 1 }, parent);
        text(parent, x + (DX + BW + 6) / 2, 15, `L${l + 1}`, { "text-anchor": "middle", "font-size": 13, fill: "#93a1a1" });
      }
      for (let k = 0; k <= last; k++) {
        const x = stationX(k), done = k < current, active = k === current;
        const g = el("g", { style: "cursor: pointer" }, parent);
        g.addEventListener("click", (event) => {
          event.stopPropagation();
          player?.goto(k + 1);
        });
        el("rect", {
          x: x - BW / 2, y: 29, width: BW, height: 28, rx: 4,
          fill: active ? C.accent : done ? "rgba(79,195,247,0.22)" : "rgba(0,0,0,0)",
          stroke: active || done ? C.accent : "#586e75", "stroke-width": 1.2,
        }, g);
        text(g, x, 47.5, stationLabel(k), { "text-anchor": "middle", "font-size": k === last ? 10.5 : 12, fill: active ? "#002b36" : C.text, "font-weight": active ? "bold" : "normal" });
        if (k > 0 && k < last) { // read (through a LayerNorm) on the left, add on the right
          el("line", { x1: x - 9, y1: LINE, x2: x - 9, y2: 57, stroke: "#586e75", "stroke-width": 1 }, parent);
          el("line", { x1: x + 9, y1: 57, x2: x + 9, y2: LINE - 5, stroke: done || active ? C.accent : "#586e75", "stroke-width": 1.2 }, parent);
          el("circle", { cx: x + 9, cy: LINE, r: 5, fill: "#002b36", stroke: done || active ? C.accent : "#586e75", "stroke-width": 1.2 }, parent);
          text(parent, x + 9, LINE + 3.6, "+", { "text-anchor": "middle", "font-size": 10, fill: done || active ? C.accent : "#93a1a1" });
        } else {
          el("line", { x1: x, y1: 57, x2: x, y2: LINE, stroke: done || active ? C.accent : "#586e75", "stroke-width": 1.2 }, parent);
        }
        // the stream after this component
        const tx = x - 21, ty = 91;
        if (k <= current) {
          const href = k === last ? heatImage("logits", data.logits, 27, logitColour, placementPixel) : stream(`x${k}`, S[k].x);
          image(g, href, tx, ty, 42, 42);
        } else {
          el("rect", { x: tx, y: ty, width: 42, height: 42, fill: "none", stroke: "#2c5a66", "stroke-dasharray": "3 3" }, g);
        }
        if (active) {
          el("rect", { x: tx - 3, y: ty - 3, width: 48, height: 48, fill: "none", stroke: C.accent, "stroke-width": 2 }, parent);
        }
      }
    }

    const maxLogit = Math.max(...data.logits);
    const sorted = [...data.logits].sort((a, b) => a - b);
    const medLogit = sorted[Math.floor(sorted.length / 2)];
    function logitColour(v: number): RGB {
      return mix(HOT, (v - medLogit) / (maxLogit - medLogit));
    }

    // ------------------------------------------------------------------ panel A: inside the component
    const AX = 18;

    function drawGrid(parent: Element, x: number, y: number, cell: number): void {
      for (let k = 0; k <= 9; k++) {
        const w = k % 3 === 0 ? 1.6 : 0.5, colour = k % 3 === 0 ? "#93a1a1" : "#41656e";
        el("line", { x1: x, y1: y + k * cell, x2: x + 9 * cell, y2: y + k * cell, stroke: colour, "stroke-width": w }, parent);
        el("line", { x1: x + k * cell, y1: y, x2: x + k * cell, y2: y + 9 * cell, stroke: colour, "stroke-width": w }, parent);
      }
    }

    function drawClues(parent: Element, x: number, y: number, cell: number, size: number, colour = "#93a1a1"): void {
      [...data.grid].forEach((ch, c) => {
        if (ch !== "0") {
          text(parent, x + (c % 9 + 0.5) * cell, y + (Math.floor(c / 9) + 0.5) * cell + size * 0.36, ch,
            { "text-anchor": "middle", "font-size": size, fill: colour, "font-weight": "bold" });
        }
      });
    }

    function panelTitle(parent: Element, x: number, title: string, sub: string): void {
      text(parent, x, 156, title, { "font-size": 16, fill: C.accent, "font-weight": "bold" });
      text(parent, x, 174, sub, { "font-size": 11.5, fill: "#93a1a1" });
    }

    function drawInput(parent: Element): void {
      panelTitle(parent, AX, "Input: the clues", `${data.tokens.length - 1} placement tokens, shuffled, then [clues_end]`);
      const cell = 28, gx = AX + 22, gy = 190;
      drawGrid(parent, gx, gy, cell);
      drawClues(parent, gx, gy, cell, 17, C.text);
      data.tokens.slice(0, -1).forEach((t, i) => { // position of each clue token in the sequence
        const c = Math.floor(t / 9);
        text(parent, gx + (c % 9) * cell + 2.5, gy + Math.floor(c / 9) * cell + 9, String(i + 1), { "font-size": 7.5, fill: C.probe });
      });
      text(parent, AX, 466, data.tokens.slice(0, 4).map(placementName).join("  ") + "  …  [clues_end]", { "font-size": 12, "font-family": "monospace", fill: C.text });
      text(parent, AX, 484, "small numbers: position of the token in the sequence", { "font-size": 11, fill: "#93a1a1" });
    }

    function drawEmbedding(parent: Element, s: Station): void {
      panelTitle(parent, AX, "Embedding", "token embedding + position embedding");
      image(parent, stream("tok", s.tok!), AX + 10, 200, 120, 120);
      text(parent, AX + 150, 266, "+", { "font-size": 26, "text-anchor": "middle" });
      image(parent, stream("pos", s.pos!), AX + 170, 200, 120, 120);
      text(parent, AX + 70, 340, "token [clues_end]", { "text-anchor": "middle", "font-size": 12 });
      text(parent, AX + 230, 340, `position ${data.tokens.length}`, { "text-anchor": "middle", "font-size": 12 });
      text(parent, AX, 388, "At this position the stream only knows", { "font-size": 12.5 });
      text(parent, AX, 406, "which token it is and where it is.", { "font-size": 12.5 });
      text(parent, AX, 430, "The clues are elsewhere in the sequence:", { "font-size": 12.5 });
      text(parent, AX, 448, "only attention can bring them here.", { "font-size": 12.5 });
    }

    function drawHeads(parent: Element, s: Station, layer: number): void {
      panelTitle(parent, AX, `L${layer + 1} attention`, `LayerNorm → ${data.config.heads} heads (softmax(QKᵀ) V) → W_O → add`);
      const cell = 7.8, W = 9 * cell;
      s.heads!.forEach((h, k) => {
        const x = AX + 4 + (k % 4) * 84, y = 190 + Math.floor(k / 4) * 126;
        const top = Math.max(...h.cells.map((p) => p[1]), 1e-6);
        el("rect", { x, y, width: W, height: W, fill: rgb(BASE) }, parent);
        h.cells.forEach(([c, w]) => {
          el("rect", { x: x + (c % 9) * cell, y: y + Math.floor(c / 9) * cell, width: cell, height: cell, fill: rgb(mix(HOT, w / top)) }, parent);
        });
        for (const k3 of [0, 3, 6, 9]) {
          el("line", { x1: x, y1: y + k3 * cell, x2: x + W, y2: y + k3 * cell, stroke: "#586e75", "stroke-width": 0.7 }, parent);
          el("line", { x1: x + k3 * cell, y1: y, x2: x + k3 * cell, y2: y + W, stroke: "#586e75", "stroke-width": 0.7 }, parent);
        }
        if (h.focus) {
          const [fx, fy, fw, fh] = focusRect(h.focus);
          el("rect", { x: x + fx * cell, y: y + fy * cell, width: fw * cell, height: fh * cell, fill: "none", stroke: C.accent, "stroke-width": 2 }, parent);
        }
        text(parent, x, y + W + 15, `H${k + 1}`, { "font-size": 12.5, "font-weight": "bold" });
        text(parent, x + 20, y + W + 15, h.focus ? focusShort(h.focus) : "", { "font-size": 11, fill: C.accent });
        text(parent, x, y + W + 30, `self ${pct(h.self)}`, { "font-size": 10.5, fill: "#93a1a1" });
      });
      text(parent, AX, 452, "brighter = more attention from [clues_end] to that clue", { "font-size": 11, fill: "#93a1a1" });
    }

    function drawNeurons(parent: Element, s: Station, layer: number): void {
      const d = data.config.d_mlp;
      panelTitle(parent, AX, `L${layer + 1} MLP`, `LayerNorm → W_in (${data.config.d_model}→${d}) → GELU → W_out → add`);
      const cols = 72, cell = 4.4, x0 = AX + 4, y0 = 188;
      image(parent, heatImage(`n${layer}`, s.neurons!, cols, (v) => mix(HOT, v / 30)), x0, y0, cols * cell, (d / cols) * cell);
      text(parent, x0, y0 + (d / cols) * cell + 14, `${d} neurons · brighter = larger activation`, { "font-size": 11, fill: "#93a1a1" });
      let y = y0 + (d / cols) * cell + 34;
      for (const n of s.top_neurons!.filter((m) => m.role).slice(0, 4)) {
        const r = n.role!;
        el("circle", { cx: x0 + ((n.index % cols) + 0.5) * cell, cy: y0 + (Math.floor(n.index / cols) + 0.5) * cell, r: 6, fill: "none", stroke: C.accent, "stroke-width": 1.5 }, parent);
        const what = r.kind === "cell" ? `all 9 digits of ${cellName(r.cell)}` : `all 81 placements of box ${r.box + 1}`;
        text(parent, x0, y, `n${n.index} (${n.act.toFixed(1)}) → +${r.boost.toFixed(1)} on ${what}`, { "font-size": 12 });
        y += 17;
      }
    }

    function drawUnembed(parent: Element): void {
      panelTitle(parent, AX, "Unembedding", `LayerNorm → W_U (${data.config.d_model}→734 tokens)`);
      const cell = 9, x0 = AX + 22, y0 = 188;
      image(parent, heatImage("logits", data.logits, 27, logitColour, placementPixel), x0, y0, 27 * cell, 27 * cell);
      for (const k of [0, 9, 18, 27]) {
        el("line", { x1: x0, y1: y0 + k * cell, x2: x0 + 27 * cell, y2: y0 + k * cell, stroke: "#93a1a1", "stroke-width": 1.2 }, parent);
        el("line", { x1: x0 + k * cell, y1: y0, x2: x0 + k * cell, y2: y0 + 27 * cell, stroke: "#93a1a1", "stroke-width": 1.2 }, parent);
      }
      text(parent, AX, 456, "729 placement logits, one 3×3 block per cell", { "font-size": 11.5, fill: "#93a1a1" });
      text(parent, AX, 474, "(digits 1–9 in reading order) · brighter = larger", { "font-size": 11.5, fill: "#93a1a1" });
    }

    // ------------------------------------------------------------------ panel B: the stream itself
    const BX = 375;

    function drawStream(parent: Element, k: number): void {
      panelTitle(parent, BX, "Residual stream at [clues_end]", `${data.config.d_model} numbers as a 24×24 image · orange > 0 · blue < 0`);
      if (k < 0) {
        text(parent, BX, 236, "The stream is created by the embedding,", { "font-size": 12.5 });
        text(parent, BX, 254, "then every component reads it and adds", { "font-size": 12.5 });
        text(parent, BX, 272, "its output to it.", { "font-size": 12.5 });
        return;
      }
      const s = S[Math.min(k, nStations - 1)];
      if (k === last) {
        image(parent, stream(`x${nStations - 1}`, s.x), BX + 68, 198, 168, 168);
        text(parent, BX + 152, 388, `final stream, ‖x‖ = ${s.norm}`, { "text-anchor": "middle", "font-size": 12.5 });
        text(parent, BX + 152, 418, "→ LayerNorm → W_U → softmax", { "text-anchor": "middle", "font-size": 12.5, fill: C.accent });
        return;
      }
      if (k > 0) {
        image(parent, stream(`x${k - 1}`, S[k - 1].x), BX + 14, 190, 110, 110);
        text(parent, BX + 152, 252, "+", { "font-size": 24, "text-anchor": "middle" });
        image(parent, stream(`w${k}`, s.write), BX + 180, 190, 110, 110);
        text(parent, BX + 69, 316, `before, ‖x‖ = ${S[k - 1].norm}`, { "text-anchor": "middle", "font-size": 11.5 });
        text(parent, BX + 235, 316, `write, ‖Δ‖ = ${s.write_norm}`, { "text-anchor": "middle", "font-size": 11.5 });
        text(parent, BX + 52, 406, "=", { "font-size": 24, "text-anchor": "middle" });
      }
      image(parent, stream(`x${k}`, s.x), BX + 82, 330, 140, 140);
      text(parent, BX + 152, 488, `after ${s.name}, ‖x‖ = ${s.norm}`, { "text-anchor": "middle", "font-size": 11.5 });
    }

    // ------------------------------------------------------------------ panel C: reading the stream
    const CX0 = 702;

    function drawReadout(parent: Element, k: number): void {
      panelTitle(parent, CX0, "Reading the stream", `pencil marks from linear probes (${data.n_probe_train.toLocaleString("en")} other grids)`);
      const cell = 27, gx = CX0 + 10, gy = 188;
      const s = k < 0 ? undefined : S[Math.min(k, nStations - 1)];
      if (s) { // where the logit lens would play
        s.lens_cells.forEach((p, c) => {
          if (p > 0.01) {
            el("rect", { x: gx + (c % 9) * cell, y: gy + Math.floor(c / 9) * cell, width: cell, height: cell, fill: C.accent, "fill-opacity": Math.min(0.75, 0.15 + 1.2 * p) }, parent);
          }
        });
      }
      drawGrid(parent, gx, gy, cell);
      drawClues(parent, gx, gy, cell, 15);
      if (s) {
        s.cand.forEach((probs, c) => {
          probs.forEach((v, d) => {
            const truth = data.true_cand[c].includes(d), p = v / 99;
            if (!truth && p < 0.25) {
              return;
            }
            text(parent, gx + (c % 9) * cell + 5 + (d % 3) * 8.5, gy + Math.floor(c / 9) * cell + 9 + Math.floor(d / 3) * 8.2, String(d + 1), {
              "font-size": 8.5, "text-anchor": "middle", fill: truth ? "#eee8d5" : C.miss, "fill-opacity": truth ? 0.12 + 0.88 * p : p,
              "font-weight": "bold",
            });
          });
        });
        const nEmpty = data.true_cand.length - [...data.grid].filter((ch) => ch !== "0").length;
        text(parent, CX0, 450, `probes right on ${s.sub_ok}/243 substructure facts`, { "font-size": 12 });
        text(parent, CX0, 465, `and ${s.cand_ok}/${9 * nEmpty} candidate facts`, { "font-size": 12 });
        const moves = (k === last ? data.final_top.slice(0, 4) : s.lens_top.slice(0, 3)).map(([t, p]) => `${placementName(t)} ${pct(p)}`);
        text(parent, CX0, 482, k === last ? "model output (shaded cells):" : "logit lens (shaded cells):", { "font-size": 12, fill: C.accent });
        for (let j = 0; j < moves.length; j += 4) { // at most four moves per line
          text(parent, CX0, 497 + (j / 4) * 15, moves.slice(j, j + 4).join(" · "), { "font-size": 11.5, "font-family": "monospace" });
        }
      } else {
        text(parent, CX0, 460, "nothing computed yet", { "font-size": 12, fill: "#93a1a1" });
      }
    }

    // ------------------------------------------------------------------ one step
    const draw = (i: number): void => {
      clear(root);
      const k = i - 1; // station index: -1 for the input, `last` for the unembedding
      drawPipeline(root, k);
      el("line", { x1: 360, y1: 145, x2: 360, y2: 496, stroke: "#2c5a66" }, root);
      el("line", { x1: 690, y1: 145, x2: 690, y2: 496, stroke: "#2c5a66" }, root);
      if (k < 0) {
        drawInput(root);
      } else if (k === 0) {
        drawEmbedding(root, S[0]);
      } else if (k === last) {
        drawUnembed(root);
      } else if (k % 2 === 1) {
        drawHeads(root, S[k], (k - 1) / 2);
      } else {
        drawNeurons(root, S[k], (k - 2) / 2);
      }
      drawStream(root, k);
      drawReadout(root, k);
    };

    player = new Player(host, data.steps, draw); // the panels already name the current component
    return player;
  }

  views["residual"] = mountResidual;
}
