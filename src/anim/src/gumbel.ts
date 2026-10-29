// The Gumbel watermark (Aaronson, 2022): the key and the last h tokens give every token v a number r_v in (0, 1),
// and the output is the token with the largest r_v^(1/p_v). The distribution p of the model is not changed.

namespace Anim {
  interface GumbelRow {
    tok: string;
    p: number; // probability under the model
    r: number; // keyed pseudo-random number
    s: number; // r^(1/p), the largest wins
    extra?: boolean; // the winner, outside the most likely tokens
    rank?: number;
  }

  interface GumbelToken {
    ctx: string; // the last h tokens, hashed with the key
    text: string;
    rows: GumbelRow[];
    pick: number; // row of the output token
    r: number; // r of the output token
    repeat: boolean; // repeated context: sampled with fresh randomness
  }

  interface GumbelStep extends Step {
    t: number;
    phase: "model" | "noise" | "race" | "detect";
  }

  interface GumbelData {
    h: number;
    prompt: string[];
    tokens: GumbelToken[];
    detect: { scored: number; S: number; p: number };
    steps: GumbelStep[];
  }

  const GUMBEL_STYLE = `
.gb-head, .gb-rows .wa-row { display: grid; grid-template-columns: 6.6em 1fr 3.4em 1fr 3.4em 1fr 3.8em; gap: 0.5em; }
.gb-head { color: #93a1a1; padding: 0 calc(0.3em + 2px); margin-bottom: 0.15em; }
.gb-head .wide { grid-column: span 2; }
.gb-rows { min-height: 10.9em; } /* room for 7 rows: the 6 most likely and the winner */
`;

  const PHASES = ["model", "noise", "race", "detect"];

  // Shade of a chosen token: its detection score -log(1 - r), 1 on average without the key
  function shade(tk: GumbelToken): string {
    if (tk.repeat) {
      return "rgba(147, 161, 161, 0.25)";
    }
    const score = -Math.log(1 - tk.r);
    return `rgba(79, 195, 247, ${Math.min(0.85, 0.1 + 0.15 * score).toFixed(2)})`;
  }

  interface GumbelRowView {
    row: HTMLDivElement;
    bars: Bar[]; // p, r, score
    values: HTMLDivElement[];
  }

  function mountGumbel(host: HTMLElement, raw: unknown): Player {
    const data = raw as GumbelData;
    addStyle("gumbel-style", GUMBEL_STYLE);
    const f = wmFrame(host);
    const table = div("wa-fade", f.body);
    const head = div("gb-head", table);
    div("", head, "token");
    div("wide", head, "p: the model");
    div("wide", head, "r: from the key");
    div("wide", head, "r^(1/p): largest wins");
    const rowBox = div("gb-rows", table);

    const d = data.detect;
    const detect = detectPanel(f.body, [
      ["tokens scored", `${d.scored}`],
      ["S = sum of −log(1 − r)", d.S.toFixed(1)],
      ["expected without the key", `${d.scored} ± ${Math.sqrt(d.scored).toFixed(1)}`],
      ["p-value", pValue(d.p)],
    ]);

    let shown = -1;
    let rows: GumbelRowView[] = [];
    const colours = [C.node, C.probe, C.accent];

    const buildRows = (t: number): void => {
      clear(rowBox);
      rows = data.tokens[t].rows.map((r) => {
        const row = div(`wa-row${r.extra ? " extra" : ""}`, rowBox);
        div("wa-tok", row, r.tok);
        const bars: Bar[] = [], values: HTMLDivElement[] = [];
        colours.forEach((colour, j) => {
          bars.push(bar(row, colour));
          values.push(div("wa-val", row));
          if (j === 0 && r.extra) {
            span(bars[0].track, `rank ${r.rank}`, "wa-rank");
          }
        });
        return { row, bars, values };
      });
      void f.root.offsetHeight; // new bars start from zero width, so that they grow
    };

    const draw = (i: number): void => {
      const s = data.steps[i];
      const level = PHASES.indexOf(s.phase);
      const detecting = s.phase === "detect";
      const t = s.t;
      const tk = data.tokens[t];
      const chosen = level >= 2;

      const now = data.prompt.length + t;
      const words: Word[] = [
        ...data.prompt.map((text) => ({ text })),
        ...data.tokens.slice(0, chosen ? t + 1 : t).map((x) => ({ text: x.text, bg: shade(x) })),
      ];
      drawText(f.text, words, detecting ? null : [now - data.h, now], s.phase === "race" ? now : -1, !chosen);
      if (detecting) {
        drawNote(f.seed, "The detector recomputes r for every chosen token from the key and the text: no model needed.");
      } else {
        drawSeed(f.seed, "r = ", tk.ctx, ", v)", ` for every token v of the vocabulary (last ${data.h} tokens)`);
      }

      if (shown !== t) {
        buildRows(t);
        shown = t;
      }
      tk.rows.forEach((r, k) => {
        const v = rows[k];
        setWidth(v.bars[0].fill, r.p);
        v.values[0].textContent = prob(r.p);
        setWidth(v.bars[1].fill, level >= 1 ? r.r : 0);
        v.values[1].textContent = level >= 1 ? r.r.toFixed(3) : "";
        setWidth(v.bars[2].fill, chosen ? r.s : 0);
        v.values[2].textContent = chosen ? prob(r.s) : "";
        v.row.classList.toggle("pick", chosen && !detecting && k === tk.pick);
      });
      table.style.opacity = detecting ? "0.12" : "1";
      detect.classList.toggle("on", detecting);

      // the score of the detector so far, on the border of the text
      const done = data.tokens.slice(0, chosen ? t + 1 : t).filter((x) => !x.repeat);
      const S = done.reduce((sum, x) => sum - Math.log(1 - x.r), 0);
      drawTally(f.tally, detecting ? [["tokens scored", `${d.scored}`], ["S", d.S.toFixed(1)]]
        : done.length ? [["tokens scored", `${done.length}`], ["S", S.toFixed(1)], ["expected without the key", `${done.length}`]] : []);
    };

    return new Player(host, data.steps, draw);
  }

  views["gumbel"] = mountGumbel;
}
