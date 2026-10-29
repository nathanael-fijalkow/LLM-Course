// The Gumbel-max trick as an exponential race, without a language model: every token v gets an arrival time
// E_v = -log(U_v) / p_v, exponential with rate p_v, and the first token to arrive is the sample.

namespace Anim {
  interface Race {
    U: number[]; // one uniform per token (keyed values r in the last race)
    E: number[]; // arrival times
    score: number[]; // -log E = log p + g
    win: number;
  }

  interface RaceStep extends Step {
    race?: number;
    level?: number; // 0: p, 1: U, 2: arrival times, 3: the race, 4: the Gumbel form
    freq?: number; // index in freqs: frequencies of the winners over many races
    keyed?: boolean;
  }

  interface RaceData {
    tokens: string[];
    p: number[];
    races: Race[];
    freqs: { n: number; f: number[] }[];
    steps: RaceStep[];
  }

  const RACE_STYLE = `
.anim .rc svg { height: auto; }
.rc-fade { transition: opacity 0.5s ease; }
.rc-move { transition: transform 0.6s ease, opacity 0.5s ease; }
.rc-bar { transform-box: fill-box; transform-origin: left center; transition: transform 0.7s ease, opacity 0.5s ease; }
.rc-lane, .rc-dot { transition: fill 0.4s ease; }
`;

  const W = 1000, X0 = 250, X1 = 830, TMAX = 4, FMAX = 0.5, Y0 = 34, PITCH = 44, LANE_H = 36;
  const COL_P = 135, COL_U = 215, COL_E = 905, COL_S = 1000;
  const WIN_FILL = "rgba(102, 187, 106, 0.22)", LANE_FILL = "rgba(255, 255, 255, 0.04)";

  const laneY = (k: number): number => Y0 + k * PITCH;
  const tX = (t: number): number => X0 + (Math.min(t, TMAX) / TMAX) * (X1 - X0);
  const fX = (f: number): number => X0 + (f / FMAX) * (X1 - X0);

  interface Lane {
    bg: SVGRectElement;
    density: SVGPathElement;
    marker: SVGGElement;
    dot: SVGCircleElement;
    arrow: SVGPolygonElement; // for arrival times beyond the axis
    bar: SVGRectElement;
    ghost: SVGRectElement;
    u: SVGTextElement;
    e: SVGTextElement;
    s: SVGTextElement;
  }

  function mountRace(host: HTMLElement, raw: unknown): Player {
    const data = raw as RaceData;
    addStyle("race-style", RACE_STYLE);
    const n = data.p.length;
    const wrap = div("rc", host);
    const H = laneY(n) + 34;
    const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": "The Gumbel-max trick as an exponential race" });
    wrap.appendChild(svg);

    const head = (x: number, anchor: string, text: string): SVGTextElement =>
      el("text", { x, y: 18, fill: "#93a1a1", "font-size": 16, "text-anchor": anchor }, svg, text);
    head(0, "start", "token");
    head(COL_P, "end", "p");
    const headU = head(COL_U, "end", "U");
    const headLane = head(X0, "start", "");
    const headRace = head(X1, "end", ""); // which race, or how many races
    headRace.setAttribute("fill", "#eee8d5");
    const headE = head(COL_E, "end", "E");
    const headS = head(COL_S, "end", "log p + g");

    const pmax = Math.max(...data.p);
    const lanes: Lane[] = data.p.map((p, k) => {
      const y = laneY(k), cy = y + LANE_H / 2;
      const bg = el("rect", { class: "rc-lane", x: X0, y, width: X1 - X0, height: LANE_H, rx: 4, fill: LANE_FILL }, svg);
      const points: string[] = [];
      for (let j = 0; j <= 80; j++) {
        const t = (TMAX * j) / 80;
        points.push(`${tX(t).toFixed(1)},${(y + LANE_H - ((LANE_H - 6) * p * Math.exp(-p * t)) / pmax).toFixed(1)}`);
      }
      const density = el("path", {
        class: "rc-fade", d: `M ${X0} ${y + LANE_H} L ${points.join(" L ")} L ${X1} ${y + LANE_H} Z`,
        fill: C.accent, "fill-opacity": 0.22, stroke: C.accent, "stroke-opacity": 0.5,
      }, svg);
      const ghost = el("rect", {
        class: "rc-fade", x: X0, y: y + 7, width: fX(p) - X0, height: LANE_H - 14, fill: "none",
        stroke: "#fdf6e3", "stroke-dasharray": "5 4", "stroke-width": 1.5,
      }, svg);
      const bar = el("rect", { class: "rc-bar", x: X0, y: y + 9, width: X1 - X0, height: LANE_H - 18, fill: C.accent, rx: 2 }, svg);
      bar.style.transform = "scaleX(0)";
      const marker = el("g", { class: "rc-move" }, svg);
      const dot = el("circle", { class: "rc-dot", cx: 0, cy, r: 8, fill: C.accent, stroke: "#fdf6e3", "stroke-width": 1.5 }, marker);
      const arrow = el("polygon", { points: `-10,${cy - 8} 4,${cy} -10,${cy + 8}`, fill: C.node }, marker);
      el("text", { x: 0, y: cy + 6, fill: "#eee8d5", "font-size": 17, "font-family": "monospace" }, svg, data.tokens[k]);
      el("text", { x: COL_P, y: cy + 6, fill: "#eee8d5", "font-size": 17, "text-anchor": "end", "font-family": "monospace" }, svg, p.toFixed(2));
      const text = (x: number): SVGTextElement =>
        el("text", { x, y: cy + 6, fill: "#cfd8dc", "font-size": 17, "text-anchor": "end", "font-family": "monospace" }, svg, "");
      return { bg, density, marker, dot, arrow, bar, ghost, u: text(COL_U), e: text(COL_E), s: text(COL_S) };
    });

    const axis = el("g", {}, svg);
    const clock = el("g", {}, svg);
    el("line", { x1: 0, x2: 0, y1: Y0 - 6, y2: laneY(n) - PITCH + LANE_H + 6, stroke: C.probe, "stroke-width": 2.5 }, clock);
    clock.style.opacity = "0";

    let race = -1; // the race whose arrival times are on screen
    let swept = false; // the clock has reached the first arrival of that race

    const drawAxis = (freqMode: boolean): void => {
      clear(axis);
      const y = laneY(n) - PITCH + LANE_H + 8;
      el("line", { x1: X0, x2: X1, y1: y, y2: y, stroke: C.node, "stroke-width": 1 }, axis);
      const ticks = freqMode ? [0, 0.1, 0.2, 0.3, 0.4, 0.5] : [0, 1, 2, 3, 4];
      for (const v of ticks) {
        const x = freqMode ? fX(v) : tX(v);
        el("line", { x1: x, x2: x, y1: y, y2: y + 5, stroke: C.node }, axis);
        el("text", { x, y: y + 21, fill: "#93a1a1", "font-size": 14, "text-anchor": "middle" }, axis,
          freqMode ? v.toFixed(1) : String(v) + (v === TMAX ? "+" : ""));
      }
    };

    const draw = (i: number): void => {
      const s = data.steps[i];
      const freqMode = s.freq !== undefined;
      drawAxis(freqMode);
      headU.textContent = freqMode ? "" : s.keyed ? "r (key)" : "U";
      headLane.textContent = freqMode ? "frequency of wins over many races (dashed: p)" : "arrival time E = −log(U) / p";
      headE.textContent = freqMode ? "freq." : "E";
      headS.textContent = freqMode ? "" : "log p + g";
      headRace.textContent = freqMode ? `${data.freqs[s.freq!].n.toLocaleString("en")} races`
        : s.keyed ? "race with keyed values" : `race ${s.race! + 1}`;

      if (freqMode) {
        const f = data.freqs[s.freq!].f;
        lanes.forEach((lane, k) => {
          lane.marker.style.opacity = "0";
          lane.density.style.opacity = "0";
          lane.bg.setAttribute("fill", LANE_FILL);
          lane.bar.style.opacity = "1";
          lane.bar.style.transform = `scaleX(${f[k] / FMAX})`;
          lane.ghost.style.opacity = "0.8";
          lane.u.textContent = "";
          lane.e.textContent = f[k].toFixed(3);
          lane.s.textContent = "";
          for (const t of [lane.e, lane.s]) {
            t.setAttribute("font-weight", "normal");
            t.setAttribute("fill", "#cfd8dc");
          }
        });
        clock.style.opacity = "0";
        swept = false;
        return;
      }

      const level = s.level!;
      const r = data.races[s.race!];
      const winX = tX(r.E[r.win]);
      const sweep = level >= 3 && (s.race !== race || !swept); // the clock runs from 0 to the first arrival
      race = s.race!;
      swept = level >= 3;
      if (sweep) {
        clock.style.transition = "none";
        clock.style.transform = `translate(${X0}px, 0px)`;
        void svg.getBoundingClientRect();
        clock.style.transition = "transform 1.2s linear, opacity 0.3s";
      }
      clock.style.transform = `translate(${level >= 3 ? winX : X0}px, 0px)`;
      clock.style.opacity = level >= 3 ? "1" : "0";

      lanes.forEach((lane, k) => {
        const won = level >= 3 && k === r.win;
        const beyond = r.E[k] > TMAX;
        lane.marker.style.opacity = level >= 2 ? "1" : "0";
        lane.marker.style.transform = `translate(${tX(r.E[k])}px, 0px)`;
        lane.dot.style.display = beyond ? "none" : "";
        lane.arrow.style.display = beyond ? "" : "none";
        lane.density.style.opacity = level >= 2 ? "1" : "0";
        lane.bar.style.opacity = "0";
        lane.bar.style.transform = "scaleX(0)";
        lane.ghost.style.opacity = "0";
        // the winner lights up when the clock reaches it
        lane.bg.style.transitionDelay = lane.dot.style.transitionDelay = won && sweep ? "1.2s" : "0s";
        lane.bg.setAttribute("fill", won ? WIN_FILL : LANE_FILL);
        lane.dot.setAttribute("fill", won ? WM.green : C.accent);
        lane.u.textContent = level >= 1 ? r.U[k].toFixed(3) : "";
        lane.e.textContent = level >= 2 ? r.E[k].toFixed(2) : "";
        lane.s.textContent = level >= 4 ? r.score[k].toFixed(2) : "";
        for (const t of [lane.e, lane.s]) {
          t.setAttribute("font-weight", won ? "bold" : "normal");
          t.setAttribute("fill", won ? WM.green : "#cfd8dc");
        }
      });
    };

    return new Player(host, data.steps, draw);
  }

  views["race"] = mountRace;
}
