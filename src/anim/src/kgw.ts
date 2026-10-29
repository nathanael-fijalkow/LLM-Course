// Red/green lists (Kirchenbauer et al., 2023): at every step, the key and the previous token split the
// vocabulary into a green list and a red list, and the green logits get a bonus delta before sampling.

namespace Anim {
  interface KgwRow {
    tok: string;
    p: number; // probability under the model
    pw: number; // probability with the watermark
    rank: number; // rank under the model, from 1
    extra?: boolean; // the sampled token, outside the 5 most likely of its list
  }

  interface KgwToken {
    prev: string; // previous token, which seeds the green list
    text: string; // the sampled token, as it appears in the text
    green: boolean;
    pg: number; // probability of the green list, without and with the bias
    pgw: number;
    lists: [KgwRow[], KgwRow[]]; // green, red
    pick: [number, number]; // list and row of the sampled token
  }

  interface KgwStep extends Step {
    t: number; // token being generated
    phase: "lists" | "bias" | "sample" | "detect";
  }

  interface KgwData {
    gamma: number;
    delta: number;
    prompt: string[]; // tokens of the beginning of the story, not watermarked
    tokens: KgwToken[];
    detect: { scored: number; green: number; z: number; p: number };
    steps: KgwStep[];
  }

  const KGW_STYLE = `
.kgw-lists { display: grid; grid-template-columns: 1fr 1fr; gap: 1.6em; }
.kgw-head { font-weight: bold; margin: 0 0 0.2em 0.35em; }
.kgw-list.green .kgw-head { color: ${WM.green}; }
.kgw-list.red .kgw-head { color: ${WM.red}; }
.kgw-list.green { --c: ${WM.green}; }
.kgw-list.red { --c: ${WM.red}; }
.kgw-rows { min-height: 9.4em; } /* room for 6 rows: the 5 most likely and the sampled token */
.kgw-rows .wa-row { display: grid; grid-template-columns: 6.6em 1fr 7.4em; gap: 0.5em; }
.kgw-mass { display: grid; grid-template-columns: auto 1fr 7.4em; gap: 0.7em; align-items: center; margin: 0.5em 0.35em 0; }
.kgw-massbar { display: flex; height: 0.95em; border-radius: 3px; overflow: hidden; background: ${WM.red}; }
.kgw-massbar .g { background: ${WM.green}; width: 0; transition: width 0.7s ease; }
`;

  const BG_GREEN = "rgba(46, 160, 67, 0.55)", BG_RED = "rgba(218, 54, 51, 0.45)";

  function zScore(green: number, n: number, gamma: number): number {
    return (green - gamma * n) / Math.sqrt(n * gamma * (1 - gamma));
  }

  interface RowView {
    row: HTMLDivElement;
    bar: Bar;
    value: HTMLDivElement;
  }

  function mountKgw(host: HTMLElement, raw: unknown): Player {
    const data = raw as KgwData;
    addStyle("kgw-style", KGW_STYLE);
    const f = wmFrame(host);
    const listBox = div("kgw-lists wa-fade", f.body);
    const rowBoxes = (["green", "red"] as const).map((name) => {
      const box = div(`kgw-list ${name}`, listBox);
      div("kgw-head", box, `${name === "green" ? "Green" : "Red"} list: 5 most likely tokens`);
      return div("kgw-rows", box);
    });
    const mass = div("kgw-mass wa-fade", f.body);
    span(mass, "P(next token is green)");
    const massGreen = div("g", div("kgw-massbar", mass));
    const massValue = div("wa-val", mass);

    const d = data.detect;
    const expected = data.gamma * d.scored;
    const sd = Math.sqrt(d.scored * data.gamma * (1 - data.gamma));
    const detect = detectPanel(f.body, [
      ["green tokens", `${d.green} of ${d.scored}`],
      ["expected without the key", `${expected.toFixed(1)} ± ${sd.toFixed(1)}`],
      ["z-score", `(${d.green} − ${expected.toFixed(1)}) / ${sd.toFixed(1)} = ${d.z.toFixed(2)}`],
      ["p-value", pValue(d.p)],
    ]);

    let shown = -1; // the token whose lists are on screen
    let rows: RowView[][] = [];

    const buildRows = (t: number): void => {
      rows = data.tokens[t].lists.map((list, j) => {
        clear(rowBoxes[j]);
        return list.map((r) => {
          const row = div(`wa-row${r.extra ? " extra" : ""}`, rowBoxes[j]);
          div("wa-tok", row, r.tok);
          const b = bar(row);
          if (r.extra) {
            span(b.track, `rank ${r.rank}`, "wa-rank");
          }
          return { row, bar: b, value: div("wa-val", row) };
        });
      });
      void f.root.offsetHeight; // new bars start from zero width, so that they grow
    };

    const draw = (i: number): void => {
      const s = data.steps[i];
      const detecting = s.phase === "detect";
      const t = s.t;
      const tk = data.tokens[t];
      const sampled = s.phase === "sample" || detecting;
      const biased = s.phase !== "lists";

      const now = data.prompt.length + t; // position of the token being generated
      const words: Word[] = [
        ...data.prompt.map((text) => ({ text })),
        ...data.tokens.slice(0, sampled ? t + 1 : t).map((x) => ({ text: x.text, bg: x.green ? BG_GREEN : BG_RED })),
      ];
      drawText(f.text, words, detecting ? null : [now - 1, now], s.phase === "sample" ? now : -1, !sampled);
      if (detecting) {
        drawNote(f.seed, "The detector rebuilds every list from the key and the text: it does not need the model.");
      } else {
        drawSeed(f.seed, "green list = ", tk.prev, ")",
          `, a fraction γ = ${data.gamma} of the vocabulary` + (biased ? `; green logits + δ = ${data.delta}` : ""));
      }

      if (shown !== t) {
        buildRows(t);
        shown = t;
      }
      tk.lists.forEach((list, j) => list.forEach((r, k) => {
        const v = rows[j][k];
        setWidth(v.bar.fill, biased ? r.pw : r.p);
        setWidth(v.bar.ghost, r.p);
        v.bar.ghost.style.opacity = biased && r.p >= 0.005 ? "0.8" : "0"; // no dashed sliver for tiny probabilities
        v.value.textContent = biased ? `${prob(r.p)} → ${prob(r.pw)}` : prob(r.p);
        v.row.classList.toggle("pick", sampled && !detecting && tk.pick[0] === j && tk.pick[1] === k);
      }));
      setWidth(massGreen, biased ? tk.pgw : tk.pg);
      massValue.textContent = biased ? `${tk.pg.toFixed(2)} → ${tk.pgw.toFixed(2)}` : tk.pg.toFixed(2);

      listBox.style.opacity = detecting ? "0.12" : "1";
      mass.style.opacity = detecting ? "0.12" : "1";
      detect.classList.toggle("on", detecting);

      // the count of the detector so far, on the border of the text
      const n = sampled ? t + 1 : t;
      const g = data.tokens.slice(0, n).filter((x) => x.green).length;
      drawTally(f.tally, detecting ? [["green tokens", `${d.green} / ${d.scored}`], ["z-score", d.z.toFixed(2)]]
        : n ? [["green tokens", `${g} / ${n}`], ["z-score", zScore(g, n, data.gamma).toFixed(1)]] : []);
    };

    return new Player(host, data.steps, draw);
  }

  views["kgw"] = mountKgw;
}
