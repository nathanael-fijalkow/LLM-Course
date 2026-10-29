// LSH with random projections: hyperplanes through the origin cut the space into buckets,
// and a query is compared only with the vectors of its bucket.

namespace Anim {
  interface LshStep extends Step {
    planes: number; // hyperplanes drawn so far
    query?: [number, number];
    qcode?: string;
    buckets?: string[]; // buckets searched
    candidates?: number[];
    best?: number | null;
    truth?: number;
    result?: boolean; // show the best candidate and the true nearest neighbour
  }

  interface LshData {
    points: [number, number][];
    normals: [number, number][];
    codes: string[];
    steps: LshStep[];
  }

  // A wide drawing: the plane on the left (clipped to a 450 x 400 box), the panel on the right
  const CX = 225, CY = 200, R = 160, PANEL_X = 480;

  function xy(v: [number, number], scale = 1): [number, number] {
    return [CX + R * scale * v[0], CY - R * scale * v[1]];
  }

  function polar(angle: number, radius: number): [number, number] {
    return xy([Math.cos(angle), Math.sin(angle)], radius);
  }

  interface Sector {
    from: number;
    to: number;
    code: string;
  }

  // Lines through the origin cut the plane into angular sectors; each sector is one bucket
  function sectors(normals: [number, number][]): Sector[] {
    if (normals.length === 0) {
      return [];
    }
    const cuts: number[] = [];
    for (const [a, b] of normals) {
      const theta = Math.atan2(b, a) + Math.PI / 2;
      cuts.push((theta + 4 * Math.PI) % (2 * Math.PI), (theta + 5 * Math.PI) % (2 * Math.PI));
    }
    cuts.sort((p, q) => p - q);
    return cuts.map((from, i) => {
      const to = i + 1 < cuts.length ? cuts[i + 1] : cuts[0] + 2 * Math.PI;
      const mid = (from + to) / 2;
      const code = normals.map(([a, b]) => (a * Math.cos(mid) + b * Math.sin(mid) > 0 ? "1" : "0")).join("");
      return { from, to, code };
    });
  }

  let instances = 0; // svg ids must be unique in the page

  function mountLsh(host: HTMLElement, raw: unknown): Player {
    const data = raw as LshData;
    const uid = `lsh-${instances++}`;
    const n = data.points.length;
    const svg = el("svg", { viewBox: "0 0 960 400", role: "img", "aria-label": "LSH with random projections" });
    host.appendChild(svg);
    const defs = el("defs", {}, svg);
    const clip = el("clipPath", { id: `${uid}-clip` }, defs);
    el("rect", { x: CX - 225, y: CY - 200, width: 450, height: 400 }, clip);
    const marker = el("marker", { id: `${uid}-arrow`, viewBox: "0 0 10 10", refX: 8, refY: 5, markerWidth: 7, markerHeight: 7, orient: "auto-start-reverse" }, defs);
    el("path", { d: "M 0 0 L 10 5 L 0 10 z", fill: C.text }, marker);

    const plot = el("g", { "clip-path": `url(#${uid}-clip)` }, svg);
    const panel = el("g", {}, svg);

    const draw = (i: number): void => {
      const s = data.steps[i];
      clear(plot);
      clear(panel);
      const normals = data.normals.slice(0, s.planes);
      const colour = new Map<string, string>();
      sectors(normals).forEach((sector, k) => {
        colour.set(sector.code, PALETTE[k % PALETTE.length]);
        const searched = s.buckets?.includes(sector.code) ?? false;
        const [x1, y1] = polar(sector.from, 1.8); // beyond the corners of the clipped square
        const [x2, y2] = polar(sector.to, 1.8);
        const large = sector.to - sector.from > Math.PI ? 1 : 0;
        el("path", {
          d: `M ${CX} ${CY} L ${x1} ${y1} A ${1.8 * R} ${1.8 * R} 0 ${large} 0 ${x2} ${y2} Z`,
          fill: colour.get(sector.code)!, "fill-opacity": searched ? 0.4 : 0.09,
        }, plot);
        const [tx, ty] = polar((sector.from + sector.to) / 2, 1 + 28 / R); // beyond the vectors
        el("text", {
          x: tx, y: ty + 6, fill: colour.get(sector.code)!, "font-size": 19, "text-anchor": "middle",
          "font-family": "monospace", "font-weight": searched ? "bold" : "normal",
        }, plot, sector.code);
      });
      el("line", { x1: CX - 8, y1: CY, x2: CX + 8, y2: CY, stroke: C.text, "stroke-width": 1.5 }, plot); // origin
      el("line", { x1: CX, y1: CY - 8, x2: CX, y2: CY + 8, stroke: C.text, "stroke-width": 1.5 }, plot);
      normals.forEach(([a, b], k) => {
        const norm = Math.hypot(a, b);
        const [dx, dy] = [-b / norm, a / norm];
        const [x1, y1] = xy([-1.4 * dx, -1.4 * dy]);
        const [x2, y2] = xy([1.4 * dx, 1.4 * dy]);
        el("line", { x1, y1, x2, y2, stroke: C.text, "stroke-opacity": 0.75, "stroke-width": 1.5, "stroke-dasharray": "7 5" }, plot);
        const [ax, ay] = xy([(0.42 * a) / norm, (0.42 * b) / norm]);
        el("line", { x1: CX, y1: CY, x2: ax, y2: ay, stroke: C.text, "stroke-width": 2, "marker-end": `url(#${uid}-arrow)` }, plot);
        const [lx, ly] = xy([(0.52 * a) / norm, (0.52 * b) / norm]);
        el("text", { x: lx, y: ly + 6, fill: C.text, "font-size": 17, "text-anchor": "middle" }, plot, `h${k + 1}`);
      });

      data.points.forEach((p, k) => {
        const [x, y] = xy(p);
        const inBucket = s.candidates ? s.candidates.includes(k) : true;
        const fill = s.planes ? colour.get(data.codes[k].slice(0, s.planes))! : C.node;
        el("circle", {
          cx: x, cy: y, r: 6.5, fill, "fill-opacity": inBucket ? 1 : 0.2,
          stroke: s.candidates && inBucket ? "white" : "none", "stroke-width": 1.5,
        }, plot);
      });

      if (s.query) {
        const [x, y] = xy(s.query);
        const [ex, ey] = xy(s.query, 1.35);
        el("line", { x1: CX, y1: CY, x2: ex, y2: ey, stroke: C.query, "stroke-opacity": 0.6, "stroke-dasharray": "2 4", "stroke-width": 2 }, plot);
        el("polygon", { points: star(x, y, 13), fill: C.query, stroke: "white", "stroke-width": 1 }, plot);
      }
      if (s.result && s.truth !== undefined) {
        const found = s.best === s.truth;
        if (s.best !== null && s.best !== undefined) {
          const [x, y] = xy(data.points[s.best]);
          el("circle", { cx: x, cy: y, r: 13, fill: "none", stroke: C.beam, "stroke-width": 3 }, plot);
        }
        if (!found) {
          const [x, y] = xy(data.points[s.truth]);
          el("circle", { cx: x, cy: y, r: 13, fill: "none", stroke: C.miss, "stroke-width": 3, "stroke-dasharray": "4 3" }, plot);
        }
      }

      // side panel: the bits of the query, what is searched, and what it costs
      let y = 36;
      const line = (text: string, colour: string = C.text, size = 22, mono = false): void => {
        el("text", { x: PANEL_X, y, fill: colour, "font-size": size, "font-family": mono ? "monospace" : "inherit" }, panel, text);
        y += size + 10;
      };
      line("Hyperplanes", C.accent, 27);
      y += 2;
      data.normals.forEach((_, k) => {
        const drawn = k < s.planes;
        const bit = s.qcode ? s.qcode[k] : undefined;
        const text = !drawn ? `h${k + 1}  (not drawn yet)`
          : bit === undefined ? `h${k + 1}  normal vector n${k + 1}`
          : `h${k + 1}  q · n${k + 1} ${bit === "1" ? ">" : "<"} 0  →  bit ${bit}`;
        line(text, drawn ? C.text : "#607d8b");
      });
      y += 6;
      const buckets = new Set(data.codes.map((c) => c.slice(0, s.planes))).size;
      line(`${buckets} non-empty bucket${buckets > 1 ? "s" : ""}`);
      if (s.qcode) {
        line(`query code: ${s.qcode}`, C.query, 22, true);
      }
      if (s.buckets) {
        line(`searched: ${s.buckets.join(", ")}`, C.text, 20, true);
      }
      if (s.candidates) {
        line(`distance computations: ${s.candidates.length} of ${n}`);
      }
      if (s.result && s.truth !== undefined) {
        line(s.best === s.truth ? "nearest neighbour found" : "nearest neighbour missed", s.best === s.truth ? C.beam : C.miss);
      }
    };

    return new Player(host, data.steps, draw);
  }

  views["lsh"] = mountLsh;
}
