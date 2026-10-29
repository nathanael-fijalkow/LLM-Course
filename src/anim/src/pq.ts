// Product quantization of 2D vectors with m = 2 sub-vectors (one coordinate each):
// one codebook per coordinate, the product grid, the codes, and distances by table lookups.

namespace Anim {
  type P = [number, number];

  interface PqStep extends Step {
    stage: number; // 0 points, 1 split, 2 and 3 codebooks, 4 grid, 5 codes, 6 query, 7 lookup, 8 ranking
    example?: number; // vector whose distance is computed by lookups
    status?: string;
  }

  interface PqData {
    points: P[];
    codebooks: [number[], number[]];
    codes: P[];
    query: P;
    tables: [number[], number[]];
    exact: number[];
    top: number[];
    truth: number[];
    steps: PqStep[];
  }

  // A wide drawing: the plot with its two strips on the left, the tables on the right
  const PX = 80, PY = 10, PS = 332, TX = 480, TX2 = 690;

  function xy(p: P): P {
    return [PX + PS * p[0], PY + PS * (1 - p[1])];
  }

  // boundaries of the 1D cells: middles of consecutive centroids
  function cuts(codebook: number[]): number[] {
    return codebook.slice(1).map((c, i) => (c + codebook[i]) / 2);
  }

  function mountPq(host: HTMLElement, raw: unknown): Player {
    const data = raw as PqData;
    const [cbx, cby] = data.codebooks;
    const svg = el("svg", { viewBox: "0 0 960 400", role: "img", "aria-label": "Product quantization" });
    host.appendChild(svg);
    el("rect", { x: PX, y: PY, width: PS, height: PS, fill: "none", stroke: C.accent, "stroke-opacity": 0.35 }, svg);
    const stripY = PY + PS + 14; // projections on the first coordinate
    const stripX = PX - 14; // projections on the second coordinate
    const layer = el("g", {}, svg);
    const panel = el("g", {}, svg);

    const draw = (i: number): void => {
      const s = data.steps[i];
      clear(layer);
      clear(panel);
      const recon = (k: number): P => [cbx[data.codes[k][0]], cby[data.codes[k][1]]];

      if (s.stage >= 1) {
        el("text", { x: PX + PS / 2, y: stripY + 36, fill: C.text, "font-size": 18, "text-anchor": "middle" }, layer, "sub-vector 1");
        el("text", {
          x: stripX - 30, y: PY + PS / 2, fill: C.text, "font-size": 18, "text-anchor": "middle",
          transform: `rotate(-90 ${stripX - 30} ${PY + PS / 2})`,
        }, layer, "sub-vector 2");
        for (const p of data.points) {
          const [x, y] = xy(p);
          el("line", { x1: x, y1: stripY, x2: x, y2: stripY + 12, stroke: C.node, "stroke-opacity": 0.6 }, layer);
          el("line", { x1: stripX - 12, y1: y, x2: stripX, y2: y, stroke: C.node, "stroke-opacity": 0.6 }, layer);
        }
      }
      if (s.stage >= 2) {
        for (const c of cuts(cbx)) {
          const [x] = xy([c, 0]);
          el("line", { x1: x, y1: PY, x2: x, y2: PY + PS, stroke: C.accent, "stroke-opacity": 0.45, "stroke-width": 1.2 }, layer);
        }
        cbx.forEach((c) => {
          const [x] = xy([c, 0]);
          el("polygon", { points: `${x},${stripY + 2} ${x - 7},${stripY + 16} ${x + 7},${stripY + 16}`, fill: C.accent }, layer);
        });
      }
      if (s.stage >= 3) {
        for (const c of cuts(cby)) {
          const [, y] = xy([0, c]);
          el("line", { x1: PX, y1: y, x2: PX + PS, y2: y, stroke: C.probe, "stroke-opacity": 0.45, "stroke-width": 1.2 }, layer);
        }
        cby.forEach((c) => {
          const [, y] = xy([0, c]);
          el("polygon", { points: `${stripX - 2},${y} ${stripX - 16},${y - 7} ${stripX - 16},${y + 7}`, fill: C.probe }, layer);
        });
      }
      if (s.stage >= 4) {
        for (const a of cbx) {
          for (const b of cby) {
            const [x, y] = xy([a, b]);
            el("rect", { x: x - 3.5, y: y - 3.5, width: 7, height: 7, transform: `rotate(45 ${x} ${y})`, fill: "white", "fill-opacity": 0.55 }, layer);
          }
        }
      }
      data.points.forEach((p, k) => {
        const [x, y] = xy(p);
        if (s.stage >= 5) {
          const [rx, ry] = xy(recon(k));
          el("line", { x1: x, y1: y, x2: rx, y2: ry, stroke: C.query, "stroke-opacity": 0.7, "stroke-width": 1.5 }, layer);
        }
        el("circle", { cx: x, cy: y, r: 5.5, fill: C.node, "fill-opacity": s.stage >= 5 ? 0.45 : 0.9 }, layer);
      });
      if (s.stage >= 6) {
        const [x, y] = xy(data.query);
        el("polygon", { points: star(x, y, 13), fill: C.query, stroke: "white", "stroke-width": 1 }, layer);
      }
      if (s.example !== undefined) {
        const [x, y] = xy(data.points[s.example]);
        const [rx, ry] = xy(recon(s.example));
        el("circle", { cx: x, cy: y, r: 11, fill: "none", stroke: "white", "stroke-width": 2.5 }, layer);
        el("rect", { x: rx - 7, y: ry - 7, width: 14, height: 14, transform: `rotate(45 ${rx} ${ry})`, fill: C.beam }, layer);
      }
      if (s.stage >= 8) {
        for (const k of data.top) {
          const [x, y] = xy(data.points[k]);
          el("circle", { cx: x, cy: y, r: 8, fill: C.beam }, layer);
        }
        for (const k of data.truth) {
          const [x, y] = xy(data.points[k]);
          el("circle", { cx: x, cy: y, r: 14, fill: "none", stroke: "white", "stroke-width": 1.5, "stroke-dasharray": "3 3" }, layer);
        }
      }

      // side panel: the two codebooks, then the two lookup tables of the query, and the cost of a vector
      let y = 34;
      const text = (x: number, label: string, colour: string = C.text, size = 21, mono = true, anchor = "start"): void => {
        el("text", { x, y, fill: colour, "font-size": size, "font-family": mono ? "monospace" : "inherit", "text-anchor": anchor }, panel, label);
      };
      const bits = Math.log2(cbx.length);
      const withQuery = s.stage >= 6;
      text(TX, withQuery ? "Lookup tables" : "Codebooks", C.accent, 27, false);
      if (s.status) {
        text(950, s.status, C.probe, 22, false, "end");
      }
      if (s.stage < 2) {
        y += 46;
        text(TX, s.stage === 0 ? "a vector: 2 floats, 64 bits" : "a vector: 2 sub-vectors", C.text, 22, false);
        return;
      }
      y += 42;
      text(TX, withQuery ? "T1[i]" : "c1[i]", C.accent, 21);
      if (s.stage >= 3) {
        text(TX2, withQuery ? "T2[j]" : "c2[j]", C.probe, 21);
      }
      y += 4;
      cbx.forEach((cx, k) => {
        y += 29;
        const used = s.example !== undefined;
        const hiX = used && data.codes[s.example!][0] === k;
        const hiY = used && data.codes[s.example!][1] === k;
        text(TX, `${k}: ${(withQuery ? data.tables[0][k] : cx).toFixed(4)}`, hiX ? C.beam : C.text);
        if (s.stage >= 3) {
          text(TX2, `${k}: ${(withQuery ? data.tables[1][k] : cby[k]).toFixed(4)}`, hiY ? C.beam : C.text);
        }
      });
      y += 44;
      if (s.example !== undefined) {
        const [a, b] = data.codes[s.example];
        const approx = data.tables[0][a] + data.tables[1][b];
        text(TX, `code (${a}, ${b}): ${data.tables[0][a].toFixed(4)} + ${data.tables[1][b].toFixed(4)}`, C.beam, 21);
        y += 30;
        text(TX, `  = ${approx.toFixed(4)}, exact ${data.exact[s.example].toFixed(4)}`, C.text, 21);
      } else if (s.stage >= 4) {
        text(TX, `${cbx.length} \u00d7 ${cby.length} = ${cbx.length * cby.length} points, ${2 * bits} bits`, C.text, 21, false);
      }
    };

    return new Player(host, data.steps, draw);
  }

  views["pq"] = mountPq;
}
