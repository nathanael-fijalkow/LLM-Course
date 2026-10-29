// HNSW: the three layers drawn as stacked planes, and a search replayed step by step.

namespace Anim {
  type Edge = [number, number, number]; // layer, from, to

  interface HnswStep extends Step {
    layer: number;
    current: number | null;
    probe: Edge[]; // edges examined at this step
    path: Edge[]; // greedy moves so far
    drops: [number, number][]; // (layer, node): descents so far
    seen: number[][]; // per layer, nodes whose distance to the query is known
    beam: number[];
    found: number[];
    count: number; // distance computations so far
  }

  interface HnswData {
    points: [number, number][];
    levels: number[];
    edges: [number, number][][]; // per layer
    query: [number, number];
    truth: number[];
    ef: number;
    steps: HnswStep[];
  }

  // A point (x, y) of the unit square, seen in perspective on the plane of a layer: wide and flat planes,
  // so that the three layers fit under the legend of a wide drawing
  const W = 690, S = 150, H = 112, X0 = 110;
  const BASE = [392, 268, 144];

  function at(p: [number, number], layer: number): [number, number] {
    return [X0 + W * p[0] + S * p[1], BASE[layer] - H * p[1]];
  }

  // The legend, on one line; its last item also counts the distance computations, so it returns that text
  function legend(svg: SVGSVGElement): SVGTSpanElement {
    const items: [string, (g: SVGGElement) => void][] = [
      ["query", (g) => el("polygon", { points: star(0, 0, 8), fill: C.query }, g)],
      ["current node", (g) => el("circle", { r: 7, fill: C.accent, stroke: "white", "stroke-width": 1.5 }, g)],
      ["edge examined", (g) => el("line", { x1: -9, x2: 9, stroke: C.probe, "stroke-width": 3 }, g)],
      [`beam (ef best)`, (g) => el("circle", { r: 7, fill: "none", stroke: C.beam, "stroke-width": 2.5 }, g)],
      ["result", (g) => el("circle", { r: 6.5, fill: C.beam }, g)],
      ["distance computed", (g) => el("circle", { r: 5.5, fill: C.seen }, g)],
    ];
    let x = 22;
    let label: SVGTextElement | undefined;
    for (const [text, icon] of items) {
      const g = el("g", { transform: `translate(${x}, 14)` }, svg);
      icon(g);
      label = el("text", { x: 14, y: 5, fill: C.text, "font-size": 16 }, g, text);
      x += 14 + 7.5 * text.length + 32;
    }
    return el("tspan", { fill: "white" }, label);
  }

  function mountHnsw(host: HTMLElement, raw: unknown): Player {
    const data = raw as HnswData;
    const n = data.points.length;
    const svg = el("svg", { viewBox: "0 0 960 400", role: "img", "aria-label": "HNSW search" });
    host.appendChild(svg);
    const counter = legend(svg);

    // static picture: planes, edges, nodes, and the query projected on every layer
    const planes: SVGPolygonElement[] = [];
    for (let layer = 2; layer >= 0; layer--) {
      const corners = ([[0, 0], [1, 0], [1, 1], [0, 1]] as [number, number][]).map((c) => at(c, layer).join(","));
      planes[layer] = el("polygon", {
        points: corners.join(" "), fill: C.accent, "fill-opacity": 0.04,
        stroke: C.accent, "stroke-opacity": 0.35,
      }, svg);
      const members = data.levels.filter((l) => l >= layer).length;
      const [lx, ly] = at([0, 0.55], layer);
      el("text", { x: lx - 18, y: ly, fill: C.accent, "font-size": 19, "text-anchor": "end" }, svg, `Layer ${layer}`);
      el("text", { x: lx - 18, y: ly + 21, fill: C.text, "font-size": 15, "text-anchor": "end" }, svg, `${members} nodes`);
      for (const [a, b] of data.edges[layer]) {
        const [x1, y1] = at(data.points[a], layer);
        const [x2, y2] = at(data.points[b], layer);
        el("line", { x1, y1, x2, y2, stroke: C.edge, "stroke-opacity": layer === 0 ? 0.22 : 0.4, "stroke-width": 1.2 }, svg);
      }
    }
    // every node of an upper layer also lives in the layers below it
    data.levels.forEach((level, i) => {
      if (level > 0) {
        const [x, y1] = at(data.points[i], level);
        const [, y2] = at(data.points[i], 0);
        el("line", { x1: x, y1, x2: x, y2, stroke: C.edge, "stroke-opacity": 0.12, "stroke-dasharray": "2 4" }, svg);
      }
    });
    for (let layer = 2; layer >= 0; layer--) {
      data.levels.forEach((level, i) => {
        if (level >= layer) {
          const [x, y] = at(data.points[i], layer);
          el("circle", { cx: x, cy: y, r: layer === 0 ? 4.5 : 5.5, fill: C.node, "fill-opacity": 0.75 }, svg);
        }
      });
    }
    const [qx, qTop] = at(data.query, 2);
    el("line", { x1: qx, y1: qTop, x2: qx, y2: at(data.query, 0)[1], stroke: C.query, "stroke-opacity": 0.35, "stroke-dasharray": "3 5" }, svg);
    for (let layer = 0; layer < 3; layer++) {
      const [x, y] = at(data.query, layer);
      el("polygon", { points: star(x, y, 9), fill: C.query }, svg);
    }

    const overlay = el("g", {}, svg);

    const draw = (i: number): void => {
      const s = data.steps[i];
      clear(overlay);
      counter.textContent = `: ${s.count} of ${n}`;
      planes.forEach((p, layer) => p.setAttribute("fill-opacity", layer === s.layer ? "0.13" : "0.04"));
      for (const [layer, a, b] of s.path) {
        const [x1, y1] = at(data.points[a], layer);
        const [x2, y2] = at(data.points[b], layer);
        el("line", { x1, y1, x2, y2, stroke: C.accent, "stroke-width": 4, "stroke-linecap": "round" }, overlay);
      }
      for (const [layer, node] of s.drops) {
        const [x, y1] = at(data.points[node], layer);
        const [, y2] = at(data.points[node], layer - 1);
        el("line", { x1: x, y1, x2: x, y2, stroke: C.accent, "stroke-width": 2.5, "stroke-dasharray": "6 4" }, overlay);
      }
      for (const [layer, a, b] of s.probe) {
        const [x1, y1] = at(data.points[a], layer);
        const [x2, y2] = at(data.points[b], layer);
        el("line", { x1, y1, x2, y2, stroke: C.probe, "stroke-width": 4, "stroke-linecap": "round" }, overlay);
      }
      s.seen.forEach((nodes, layer) => nodes.forEach((node) => {
        const [x, y] = at(data.points[node], layer);
        el("circle", { cx: x, cy: y, r: 6, fill: C.seen }, overlay);
      }));
      for (const [layer, , b] of s.probe) {
        const [x, y] = at(data.points[b], layer);
        el("circle", { cx: x, cy: y, r: 10, fill: "none", stroke: C.probe, "stroke-width": 2.5 }, overlay);
      }
      for (const node of s.found.length ? [] : s.beam) {
        const [x, y] = at(data.points[node], s.layer);
        el("circle", { cx: x, cy: y, r: 12, fill: "none", stroke: C.beam, "stroke-width": 3 }, overlay);
      }
      if (s.current !== null) {
        const [x, y] = at(data.points[s.current], s.layer);
        el("circle", { cx: x, cy: y, r: 9, fill: C.accent, stroke: "white", "stroke-width": 2 }, overlay);
      }
      for (const node of s.found) {
        const [x, y] = at(data.points[node], 0);
        el("circle", { cx: x, cy: y, r: 8, fill: C.beam }, overlay);
      }
      if (s.found.length) {
        for (const node of data.truth) {
          const [x, y] = at(data.points[node], 0);
          el("circle", { cx: x, cy: y, r: 14, fill: "none", stroke: "white", "stroke-width": 1.5, "stroke-dasharray": "3 3" }, overlay);
        }
      }
    };

    return new Player(host, data.steps, draw);
  }

  views["hnsw"] = mountHnsw;
}
