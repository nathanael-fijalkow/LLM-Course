// SynthID-Text (Dathathri et al., 2024): 2^m candidates are drawn from the model, and a knockout tournament
// of m rounds picks the output; in round l, the candidate with the larger g-value g_l wins (ties: a coin).
// The text is drawn in HTML, the bracket in SVG; winners slide from one round to the next.

namespace Anim {
  interface SynthToken {
    ctx: string; // the last h tokens, hashed with the key
    text: string;
    cands: string[]; // 2^m candidates drawn from the model
    g: number[][]; // g-values of each candidate, m bits
    rounds: number[][]; // indices of the candidates that win each round
    ties: boolean[][]; // matches settled by a coin
    repeat: boolean; // repeated context: no watermark
  }

  interface SynthStep extends Step {
    t: number;
    stage: number; // 0: candidates drawn, 1: g-values shown, 1 + l: round l played
    detect?: boolean;
  }

  interface SynthData {
    h: number;
    m: number;
    prompt: string[];
    tokens: SynthToken[];
    detect: { scored: number; ones: number; per_round: number[]; z: number; p: number };
    steps: SynthStep[];
  }

  const SYNTH_STYLE = `
.anim .sb-bracket svg { height: auto; }
.sb-box { transition: transform 0.6s ease, opacity 0.4s ease; }
.sb-bits, .sb-coin { transition: opacity 0.4s ease; }
.sb-line { fill: none; stroke: #586e75; stroke-width: 1.5; transition: stroke 0.4s, stroke-width 0.4s; }
.sb-line.won { stroke: ${C.accent}; stroke-width: 2.5; }
`;

  const W = 1000, BOX_W = 190, BOX_H = 23, PITCH = 28, TOP = 24;

  interface BoxView {
    g: SVGGElement;
    rect: SVGRectElement;
    bits: SVGGElement;
    squares: SVGRectElement[];
  }

  function bitX(j: number, m: number): number {
    return BOX_W - 8 - (m - j) * 17 + 3;
  }

  function makeBox(parent: SVGElement, label: string, g: number[], m: number): BoxView {
    const group = el("g", { class: "sb-box" }, parent);
    const rect = el("rect", { width: BOX_W, height: BOX_H, rx: 4, fill: "rgba(255, 255, 255, 0.06)", stroke: C.node, "stroke-width": 1 }, group);
    el("text", { x: 8, y: 16.5, fill: "#eee8d5", "font-size": 15, "font-family": "monospace" }, group,
      label.length > 13 ? label.slice(0, 12) + "…" : label);
    const bits = el("g", { class: "sb-bits" }, group);
    const squares = g.map((b, j) => el("rect", {
      x: bitX(j, m), y: 5.5, width: 12, height: 12, rx: 2, fill: b ? WM.green : "none", stroke: b ? WM.green : C.node,
    }, bits));
    return { g: group, rect, bits, squares };
  }

  function place(box: BoxView, x: number, y: number, opacity: number): void {
    box.g.style.transform = `translate(${x}px, ${y}px)`;
    box.g.style.opacity = String(opacity);
  }

  function winner(tk: SynthToken): number {
    return tk.rounds[tk.rounds.length - 1][0];
  }

  function ones(tk: SynthToken): number {
    return tk.g[winner(tk)].reduce((a, b) => a + b, 0);
  }

  function mountSynthid(host: HTMLElement, raw: unknown): Player {
    const data = raw as SynthData;
    const m = data.m;
    addStyle("synthid-style", SYNTH_STYLE);
    const f = wmFrame(host);
    const wrap = div("sb-bracket wa-fade", f.body);
    const svg = el("svg", { viewBox: `0 0 ${W} ${TOP + 2 ** m * PITCH}`, role: "img", "aria-label": "Tournament sampling" });
    wrap.appendChild(svg);

    const colX = (c: number): number => (c * (W - BOX_W)) / m;
    const slotY = (c: number, k: number): number => TOP + (k * 2 ** c + (2 ** c - 1) / 2) * PITCH;
    for (let c = 0; c <= m; c++) {
      const label = c === 0 ? "drawn from p" : `round ${c}: g${c}` + (c === m ? " → output" : "");
      el("text", { x: colX(c), y: 15, fill: "#93a1a1", "font-size": 15 }, svg, label);
    }
    for (let j = 0; j < m; j++) {
      el("text", { x: bitX(j, m) + 6, y: 15, fill: "#93a1a1", "font-size": 12, "text-anchor": "middle" }, svg, `g${j + 1}`);
    }
    const lineLayer = el("g", {}, svg);
    const boxLayer = el("g", {}, svg);
    const coinLayer = el("g", {}, svg);

    const d = data.detect;
    const n = m * d.scored;
    const detect = detectPanel(f.body, [
      ["g-values of the chosen tokens", `${d.ones} ones of ${n}`],
      ["ones per round", `${d.per_round.join(" / ")} (of ${d.scored})`],
      ["expected without the key", `${n / 2} ± ${(Math.sqrt(n) / 2).toFixed(1)}`],
      ["z-score", d.z.toFixed(2)],
      ["p-value", pValue(d.p)],
    ]);

    let shown = -1;
    let who: number[][] = []; // who[c][k]: the candidate in slot k of column c (column 0: the candidates)
    let boxes: BoxView[][] = [];
    let lines: { path: SVGPathElement; c: number; k: number; j: number }[] = [];
    let coins: { text: SVGTextElement; c: number }[] = [];

    // The slot of column c - 1 that the winner of slot k of column c comes from
    const source = (c: number, k: number): number => (who[c - 1][2 * k] === who[c][k] ? 2 * k : 2 * k + 1);

    const build = (t: number): void => {
      const tk = data.tokens[t];
      [lineLayer, boxLayer, coinLayer].forEach(clear);
      who = [tk.cands.map((_, i) => i), ...tk.rounds];
      lines = [];
      coins = [];
      for (let c = 1; c <= m; c++) {
        who[c].forEach((_, k) => {
          const xm = (colX(c - 1) + BOX_W + colX(c)) / 2;
          const yt = slotY(c, k) + BOX_H / 2;
          for (const j of [2 * k, 2 * k + 1]) {
            const path = el("path", {
              class: "sb-line", d: `M ${colX(c - 1) + BOX_W} ${slotY(c - 1, j) + BOX_H / 2} H ${xm} V ${yt} H ${colX(c)}`,
            }, lineLayer);
            lines.push({ path, c, k, j });
          }
          if (tk.ties[c - 1][k]) {
            const text = el("text", { class: "sb-coin", x: xm + 5, y: yt - 5, fill: C.probe, "font-size": 12 }, coinLayer, "coin");
            coins.push({ text, c });
          }
        });
      }
      boxes = who.map((column, c) => column.map((idx, k) => {
        const b = makeBox(boxLayer, tk.cands[idx], tk.g[idx], m);
        place(b, c === 0 ? colX(0) : colX(c - 1), c === 0 ? slotY(0, k) : slotY(c - 1, source(c, k)), 0);
        return b;
      }));
      void svg.getBoundingClientRect(); // boxes start hidden, so that they fade in and slide
    };

    const draw = (i: number): void => {
      const s = data.steps[i];
      const t = s.t;
      const tk = data.tokens[t];
      const stage = s.stage;
      const chosen = stage >= m + 1;

      const now = data.prompt.length + t;
      const shade = (x: SynthToken): string => x.repeat ? "rgba(147, 161, 161, 0.25)"
        : `rgba(102, 187, 106, ${(0.1 + (0.75 * ones(x)) / m).toFixed(2)})`;
      const words: Word[] = [
        ...data.prompt.map((text) => ({ text })),
        ...data.tokens.slice(0, chosen ? t + 1 : t).map((x) => ({ text: x.text, bg: shade(x) })),
      ];
      drawText(f.text, words, s.detect ? null : [now - data.h, now], chosen && !s.detect ? now : -1, !chosen);
      if (s.detect) {
        drawNote(f.seed, "The detector recomputes the g-values of every chosen token from the key and the text: no model needed.");
      } else {
        drawSeed(f.seed, "g-values = ", tk.ctx, ", v)", `: ${m} bits for every token v (last ${data.h} tokens)`);
      }

      if (shown !== t) {
        build(t);
        shown = t;
      }
      boxes.forEach((column, c) => column.forEach((b, k) => {
        const visible = c === 0 || stage >= 1 + c;
        const lost = c < m && stage >= 2 + c && who[c + 1][k >> 1] !== who[c][k];
        if (visible) {
          place(b, colX(c), slotY(c, k), lost ? 0.3 : 1);
        } else {
          place(b, colX(c - 1), slotY(c - 1, source(c, k)), 0);
        }
        b.bits.style.opacity = stage >= 1 ? "1" : "0";
        b.squares.forEach((q, j) => {
          const current = stage === c + 2 && j === c; // the bit that decides the round being played
          const bit = tk.g[who[c][k]][j];
          q.setAttribute("stroke", current ? "#fdf6e3" : bit ? WM.green : C.node);
          q.setAttribute("stroke-width", current ? "2.5" : "1.2");
        });
        const final = c === m && chosen && !s.detect;
        b.rect.setAttribute("stroke", final ? "#fdf6e3" : C.node);
        b.rect.setAttribute("stroke-width", final ? "2.5" : "1");
      }));
      lines.forEach(({ path, c, k, j }) => path.classList.toggle("won", stage >= 1 + c && who[c - 1][j] === who[c][k]));
      coins.forEach(({ text, c }) => { text.style.opacity = stage >= 1 + c ? "1" : "0"; });

      wrap.style.opacity = s.detect ? "0.12" : tk.repeat ? "0.25" : "1";
      detect.classList.toggle("on", !!s.detect);

      // the count of the detector so far, on the border of the text
      const done = data.tokens.slice(0, chosen ? t + 1 : t).filter((x) => !x.repeat);
      const k = done.reduce((sum, x) => sum + ones(x), 0);
      const total = m * done.length;
      drawTally(f.tally, s.detect ? [["g-values equal to 1", `${d.ones} / ${n}`], ["z-score", d.z.toFixed(2)]]
        : total ? [["g-values equal to 1", `${k} / ${total}`], ["z-score", ((k - total / 2) / (Math.sqrt(total) / 2)).toFixed(1)]] : []);
    };

    return new Player(host, data.steps, draw);
  }

  views["synthid"] = mountSynthid;
}
