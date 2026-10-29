// IVF: k-means training (Voronoi cells), inverted lists, and a query scanned with nprobe = 1, then 2.

namespace Anim {
  type P = [number, number];

  interface IvfStep extends Step {
    centroids: P[] | null;
    labels?: number[];
    iteration?: number;
    lists?: boolean; // show the inverted lists
    query?: P;
    order?: number[]; // cells by distance to the query
    probe?: number[]; // cells scanned
    scanned?: number[];
    best?: number;
    truth?: number;
    result?: boolean;
    count?: number; // distance computations
  }

  interface IvfData {
    points: P[];
    steps: IvfStep[];
  }

  // The plot keeps the square of the former layout (a static frame crops it with viewBox "30 15 530 530"),
  // and the inverted lists take the rest of a wide drawing, one row per cell.
  const PX = 40, PY = 25, PS = 510;
  const VW = 1860, VH = 560, LX = 640, LEND = 1780;

  function xy(p: P): P {
    return [PX + PS * p[0], PY + PS * (1 - p[1])];
  }

  // Cell of centroid i inside the unit square: clip the square by the bisector of (i, j), for every j
  function voronoiCell(centroids: P[], i: number): P[] {
    let poly: P[] = [[0, 0], [1, 0], [1, 1], [0, 1]];
    const [ax, ay] = centroids[i];
    centroids.forEach(([bx, by], j) => {
      if (j === i || poly.length === 0) {
        return;
      }
      // keep the points p with (p - m) . (b - a) <= 0, m the middle of a and b
      const side = ([x, y]: P): number => (x - (ax + bx) / 2) * (bx - ax) + (y - (ay + by) / 2) * (by - ay);
      const clipped: P[] = [];
      poly.forEach((p, k) => {
        const q = poly[(k + 1) % poly.length];
        const sp = side(p), sq = side(q);
        if (sp <= 0) {
          clipped.push(p);
        }
        if ((sp < 0 && sq > 0) || (sp > 0 && sq < 0)) {
          const t = sp / (sp - sq);
          clipped.push([p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])]);
        }
      });
      poly = clipped;
    });
    return poly;
  }

  // Outline of the union of some cells, as a path: the edges of their polygons that no two of them share.
  // An edge of cell a is shared with cell b when its middle is as far from both centroids.
  function outline(centroids: P[], cells: number[]): string {
    const dist = (p: P, c: number): number => Math.hypot(p[0] - centroids[c][0], p[1] - centroids[c][1]);
    const parts: string[] = [];
    for (const a of cells) {
      const poly = voronoiCell(centroids, a);
      poly.forEach((p, k) => {
        const q = poly[(k + 1) % poly.length];
        const m: P = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
        if (!cells.some((b) => b !== a && Math.abs(dist(m, b) - dist(m, a)) < 1e-7)) {
          parts.push(`M ${xy(p).join(" ")} L ${xy(q).join(" ")}`);
        }
      });
    }
    return parts.join(" ");
  }

  function mountIvf(host: HTMLElement, raw: unknown): Player {
    const data = raw as IvfData;
    const n = data.points.length;
    const svg = el("svg", { viewBox: `0 0 ${VW} ${VH}`, role: "img", "aria-label": "IVF index" });
    const sizes = data.steps.flatMap((s) => (s.labels && s.centroids ? s.centroids.map((_, c) => s.labels!.filter((l) => l === c).length) : []));
    const pitch = Math.min(30, (LEND - 860) / Math.max(1, ...sizes)); // one square per vector of a list
    host.appendChild(svg);
    el("rect", { x: PX, y: PY, width: PS, height: PS, fill: "none", stroke: C.accent, "stroke-opacity": 0.35 }, svg);
    const plot = el("g", {}, svg);
    const panel = el("g", {}, svg);

    const draw = (i: number): void => {
      const s = data.steps[i];
      clear(plot);
      clear(panel);
      const centroids = s.centroids ?? [];
      const probed = new Set(s.probe ?? []);
      centroids.forEach((_, c) => {
        const cell = voronoiCell(centroids, c).map((p) => xy(p).join(",")).join(" ");
        el("polygon", {
          points: cell, fill: PALETTE[c], "fill-opacity": probed.has(c) ? 0.38 : 0.1,
          stroke: C.text, "stroke-opacity": 0.5, "stroke-width": 1.2,
        }, plot);
      });
      if (probed.size) { // the scanned region: a heavy outline around the nprobe cells, on a dark casing
        const d = outline(centroids, [...probed]);
        const line = { d, fill: "none", "stroke-linecap": "round", "stroke-linejoin": "round" };
        el("path", { ...line, stroke: "#002b36", "stroke-width": 12 }, plot);
        el("path", { ...line, stroke: "white", "stroke-width": 6 }, plot);
      }
      const scanned = s.scanned ? new Set(s.scanned) : null;
      data.points.forEach((p, k) => {
        const [x, y] = xy(p);
        const inScan = scanned ? scanned.has(k) : true;
        el("circle", {
          cx: x, cy: y, r: 6, fill: s.labels ? PALETTE[s.labels[k]] : C.node, "fill-opacity": inScan ? 1 : 0.2,
          stroke: scanned && inScan ? "white" : "none", "stroke-width": 1.5,
        }, plot);
      });
      if (s.query && s.order) {
        const [qx, qy] = xy(s.query);
        for (const c of s.order) {
          const [x, y] = xy(centroids[c]);
          el("line", { x1: qx, y1: qy, x2: x, y2: y, stroke: C.query, "stroke-opacity": probed.size ? 0.15 : 0.6, "stroke-dasharray": "4 4", "stroke-width": 1.5 }, plot);
        }
      }
      centroids.forEach((ctr, c) => {
        const [x, y] = xy(ctr);
        el("rect", {
          x: x - 8, y: y - 8, width: 16, height: 16, transform: `rotate(45 ${x} ${y})`,
          fill: PALETTE[c], stroke: "white", "stroke-width": 2,
        }, plot);
      });
      if (s.query) {
        const [x, y] = xy(s.query);
        el("polygon", { points: star(x, y, 13), fill: C.query, stroke: "white", "stroke-width": 1 }, plot);
      }
      if (s.result && s.best !== undefined && s.truth !== undefined) {
        // the vector returned (green, with a halo) and, when it differs, the true nearest neighbour (red),
        // each with a short label, the labels on opposite sides so that they do not overlap
        const found = s.best === s.truth;
        const [bx, by] = xy(data.points[s.best]);
        const [tx, ty] = xy(data.points[s.truth]);
        const up = found || by <= ty;
        const label = (x: number, y: number, text: string, colour: string): void => {
          el("text", {
            x, y, fill: colour, "font-size": 24, "font-weight": "bold", "text-anchor": "middle",
            stroke: "#002b36", "stroke-width": 6, "paint-order": "stroke", "stroke-linejoin": "round",
          }, plot, text);
        };
        if (!found) {
          el("circle", { cx: tx, cy: ty, r: 16, fill: "none", stroke: C.miss, "stroke-width": 4.5, "stroke-dasharray": "6 4" }, plot);
          label(tx, up ? ty + 58 : ty - 40, "nearest neighbour, missed", C.miss);
        }
        el("circle", { cx: bx, cy: by, r: 26, fill: C.beam, "fill-opacity": 0.4 }, plot);
        el("circle", { cx: bx, cy: by, r: 16, fill: "none", stroke: C.beam, "stroke-width": 4.5 }, plot);
        label(bx, up ? by - 42 : by + 60, found ? "nearest neighbour, found" : "result", C.beam);
      }

      // the lists: one row per cell, with one square per vector of the cell
      const text = (x: number, y: number, label: string, colour: string = C.text, size = 38, anchor = "start"): void => {
        el("text", { x, y, fill: colour, "font-size": size, "text-anchor": anchor }, panel, label);
      };
      const title = !s.centroids ? "Vectors"
        : s.lists ? "Inverted lists" + (s.probe ? `, nprobe = ${s.probe.length}` : "")
        : "k-means" + (s.iteration !== undefined ? `, iteration ${s.iteration}` : ", initial centroids");
      text(LX, 68, title, C.accent, 48);
      if (!s.centroids) {
        text(LX, 150, `${n} vectors, no index yet`);
        return;
      }
      centroids.forEach((_, c) => {
        const y = 150 + 66 * c; // middle of the row
        const scanned = probed.has(c);
        const dim = probed.size > 0 && !scanned;
        el("rect", { x: LX, y: y - 17, width: 34, height: 34, fill: PALETTE[c], "fill-opacity": s.labels ? (dim ? 0.3 : 1) : 0.4 }, panel);
        text(LX + 56, y + 13, `cell ${c + 1}`, scanned ? "white" : dim ? "#607d8b" : C.text);
        if (!s.labels) {
          return;
        }
        const members = s.labels.flatMap((l, k) => (l === c ? [k] : []));
        members.forEach((k, j) => {
          el("rect", {
            x: 860 + j * pitch, y: y - 17, width: Math.max(4, pitch - 6), height: 34, rx: 3, fill: PALETTE[c],
            "fill-opacity": dim ? 0.2 : 0.9, stroke: scanned && s.scanned?.includes(k) ? "white" : "none", "stroke-width": 3,
          }, panel);
        });
        text(860 + members.length * pitch + 10, y + 13, String(members.length), scanned ? "white" : dim ? "#607d8b" : C.text);
      });
      if (s.count !== undefined) {
        const found = s.best === s.truth;
        text(LX, 548, `distance computations: ${s.count} of ${n}` + (s.result ? "," : ""), C.text, 36);
        if (s.result) {
          text(LEND + 60, 548, found ? "nearest neighbour found" : "nearest neighbour missed", found ? C.beam : C.miss, 36, "end");
        }
      }
    };

    return new Player(host, data.steps, draw);
  }

  views["ivf"] = mountIvf;
}
