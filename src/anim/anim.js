"use strict";
// Shared pieces: SVG helpers, colours, and a step player with Previous / Next / Reset.
// Each animation receives a list of steps computed in Python, and only draws them.
var Anim;
(function (Anim) {
    Anim.SVG_NS = "http://www.w3.org/2000/svg";
    // Solarized accents on the "moon" theme, plus the accent colour of src/custom.css
    Anim.C = {
        accent: "#4fc3f7",
        node: "#93a1a1",
        edge: "#93a1a1",
        seen: "#2aa198",
        probe: "#ffd54f",
        beam: "#81c784",
        query: "#ff8a65",
        miss: "#ef5350",
        text: "#cfd8dc",
    };
    // Distinct colours for buckets and cells
    Anim.PALETTE = ["#4fc3f7", "#ffb74d", "#81c784", "#e57373", "#ba68c8", "#fff176", "#4db6ac", "#f06292"];
    function el(tag, attrs = {}, parent, text) {
        const node = document.createElementNS(Anim.SVG_NS, tag);
        for (const [key, value] of Object.entries(attrs)) {
            node.setAttribute(key, String(value));
        }
        if (text !== undefined) {
            node.textContent = text;
        }
        parent === null || parent === void 0 ? void 0 : parent.appendChild(node);
        return node;
    }
    Anim.el = el;
    function clear(node) {
        while (node.firstChild) {
            node.removeChild(node.firstChild);
        }
    }
    Anim.clear = clear;
    // A five-pointed star centred at (x, y), used for queries
    function star(x, y, r) {
        const corners = [];
        for (let i = 0; i < 10; i++) {
            const radius = i % 2 === 0 ? r : r * 0.45;
            const angle = -Math.PI / 2 + (i * Math.PI) / 5;
            corners.push(`${(x + radius * Math.cos(angle)).toFixed(1)},${(y + radius * Math.sin(angle)).toFixed(1)}`);
        }
        return corners.join(" ");
    }
    Anim.star = star;
    class Player {
        // The presenter moves through the steps with Previous / Next / Reset. A host with a data-frame
        // attribute shows that single step, without controls (a static figure).
        // The bar only holds the buttons and "Step X / Y", in a box of fixed width, so that it never moves;
        // whatever else a view wants to report at each step goes in its drawing.
        constructor(host, steps, draw) {
            this.steps = steps;
            this.draw = draw;
            this.index = 0;
            this.root = host;
            const frame = host.dataset.frame;
            if (frame === undefined) {
                const bar = document.createElement("div");
                bar.className = "anim-bar";
                this.previousButton = this.button(bar, "Previous", () => this.previous());
                this.nextButton = this.button(bar, "Next", () => this.next());
                this.button(bar, "Reset", () => this.reset());
                this.counter = document.createElement("span");
                this.counter.className = "anim-counter";
                this.counter.style.width = `${3.3 + 1.2 * String(steps.length).length}em`; // room for "Step Y / Y"
                bar.appendChild(this.counter);
                host.appendChild(bar);
            }
            // Every caption sits in the same grid cell and only the current one is visible, so the block always
            // has the height of the longest caption: reveal.js centres slides vertically, and a caption that
            // grew by one line would move the bar at the next layout. This works even while the slide is hidden.
            this.caption = document.createElement("div");
            this.caption.className = "anim-caption";
            this.caption.setAttribute("aria-live", "polite");
            this.lines = steps.map((step, k) => {
                const line = document.createElement("div");
                line.textContent = frame === undefined || k === Number(frame) ? step.text : "";
                this.caption.appendChild(line);
                return line;
            });
            host.appendChild(this.caption);
            this.show(frame === undefined ? 0 : Number(frame));
        }
        previous() {
            if (this.index > 0) {
                this.show(this.index - 1);
            }
        }
        next() {
            if (this.index < this.steps.length - 1) {
                this.show(this.index + 1);
            }
        }
        reset() {
            this.show(0);
        }
        // Jump to a step (a view can call it when the presenter clicks on its drawing)
        goto(i) {
            this.show(Math.max(0, Math.min(this.steps.length - 1, i)));
        }
        show(i) {
            this.index = i;
            this.draw(i);
            this.lines.forEach((line, k) => {
                line.className = k === i ? "on" : "";
                line.setAttribute("aria-hidden", String(k !== i));
            });
            if (this.counter) {
                this.counter.textContent = `Step ${i + 1} / ${this.steps.length}`;
            }
            if (this.previousButton && this.nextButton) {
                this.previousButton.disabled = i === 0;
                this.nextButton.disabled = i === this.steps.length - 1;
            }
        }
        button(bar, label, action) {
            const b = document.createElement("button");
            b.type = "button";
            b.textContent = label;
            b.addEventListener("click", (event) => {
                event.stopPropagation();
                action();
                b.blur(); // give the keyboard back to reveal.js (space, arrows)
            });
            bar.appendChild(b);
            return b;
        }
    }
    Anim.Player = Player;
    // Each animation kind registers a function that mounts it in a host element
    Anim.views = {};
})(Anim || (Anim = {}));
// HNSW: the three layers drawn as stacked planes, and a search replayed step by step.
var Anim;
(function (Anim) {
    // A point (x, y) of the unit square, seen in perspective on the plane of a layer: wide and flat planes,
    // so that the three layers fit under the legend of a wide drawing
    const W = 690, S = 150, H = 112, X0 = 110;
    const BASE = [392, 268, 144];
    function at(p, layer) {
        return [X0 + W * p[0] + S * p[1], BASE[layer] - H * p[1]];
    }
    // The legend, on one line; its last item also counts the distance computations, so it returns that text
    function legend(svg) {
        const items = [
            ["query", (g) => Anim.el("polygon", { points: Anim.star(0, 0, 8), fill: Anim.C.query }, g)],
            ["current node", (g) => Anim.el("circle", { r: 7, fill: Anim.C.accent, stroke: "white", "stroke-width": 1.5 }, g)],
            ["edge examined", (g) => Anim.el("line", { x1: -9, x2: 9, stroke: Anim.C.probe, "stroke-width": 3 }, g)],
            [`beam (ef best)`, (g) => Anim.el("circle", { r: 7, fill: "none", stroke: Anim.C.beam, "stroke-width": 2.5 }, g)],
            ["result", (g) => Anim.el("circle", { r: 6.5, fill: Anim.C.beam }, g)],
            ["distance computed", (g) => Anim.el("circle", { r: 5.5, fill: Anim.C.seen }, g)],
        ];
        let x = 22;
        let label;
        for (const [text, icon] of items) {
            const g = Anim.el("g", { transform: `translate(${x}, 14)` }, svg);
            icon(g);
            label = Anim.el("text", { x: 14, y: 5, fill: Anim.C.text, "font-size": 16 }, g, text);
            x += 14 + 7.5 * text.length + 32;
        }
        return Anim.el("tspan", { fill: "white" }, label);
    }
    function mountHnsw(host, raw) {
        const data = raw;
        const n = data.points.length;
        const svg = Anim.el("svg", { viewBox: "0 0 960 400", role: "img", "aria-label": "HNSW search" });
        host.appendChild(svg);
        const counter = legend(svg);
        // static picture: planes, edges, nodes, and the query projected on every layer
        const planes = [];
        for (let layer = 2; layer >= 0; layer--) {
            const corners = [[0, 0], [1, 0], [1, 1], [0, 1]].map((c) => at(c, layer).join(","));
            planes[layer] = Anim.el("polygon", {
                points: corners.join(" "), fill: Anim.C.accent, "fill-opacity": 0.04,
                stroke: Anim.C.accent, "stroke-opacity": 0.35,
            }, svg);
            const members = data.levels.filter((l) => l >= layer).length;
            const [lx, ly] = at([0, 0.55], layer);
            Anim.el("text", { x: lx - 18, y: ly, fill: Anim.C.accent, "font-size": 19, "text-anchor": "end" }, svg, `Layer ${layer}`);
            Anim.el("text", { x: lx - 18, y: ly + 21, fill: Anim.C.text, "font-size": 15, "text-anchor": "end" }, svg, `${members} nodes`);
            for (const [a, b] of data.edges[layer]) {
                const [x1, y1] = at(data.points[a], layer);
                const [x2, y2] = at(data.points[b], layer);
                Anim.el("line", { x1, y1, x2, y2, stroke: Anim.C.edge, "stroke-opacity": layer === 0 ? 0.22 : 0.4, "stroke-width": 1.2 }, svg);
            }
        }
        // every node of an upper layer also lives in the layers below it
        data.levels.forEach((level, i) => {
            if (level > 0) {
                const [x, y1] = at(data.points[i], level);
                const [, y2] = at(data.points[i], 0);
                Anim.el("line", { x1: x, y1, x2: x, y2, stroke: Anim.C.edge, "stroke-opacity": 0.12, "stroke-dasharray": "2 4" }, svg);
            }
        });
        for (let layer = 2; layer >= 0; layer--) {
            data.levels.forEach((level, i) => {
                if (level >= layer) {
                    const [x, y] = at(data.points[i], layer);
                    Anim.el("circle", { cx: x, cy: y, r: layer === 0 ? 4.5 : 5.5, fill: Anim.C.node, "fill-opacity": 0.75 }, svg);
                }
            });
        }
        const [qx, qTop] = at(data.query, 2);
        Anim.el("line", { x1: qx, y1: qTop, x2: qx, y2: at(data.query, 0)[1], stroke: Anim.C.query, "stroke-opacity": 0.35, "stroke-dasharray": "3 5" }, svg);
        for (let layer = 0; layer < 3; layer++) {
            const [x, y] = at(data.query, layer);
            Anim.el("polygon", { points: Anim.star(x, y, 9), fill: Anim.C.query }, svg);
        }
        const overlay = Anim.el("g", {}, svg);
        const draw = (i) => {
            const s = data.steps[i];
            Anim.clear(overlay);
            counter.textContent = `: ${s.count} of ${n}`;
            planes.forEach((p, layer) => p.setAttribute("fill-opacity", layer === s.layer ? "0.13" : "0.04"));
            for (const [layer, a, b] of s.path) {
                const [x1, y1] = at(data.points[a], layer);
                const [x2, y2] = at(data.points[b], layer);
                Anim.el("line", { x1, y1, x2, y2, stroke: Anim.C.accent, "stroke-width": 4, "stroke-linecap": "round" }, overlay);
            }
            for (const [layer, node] of s.drops) {
                const [x, y1] = at(data.points[node], layer);
                const [, y2] = at(data.points[node], layer - 1);
                Anim.el("line", { x1: x, y1, x2: x, y2, stroke: Anim.C.accent, "stroke-width": 2.5, "stroke-dasharray": "6 4" }, overlay);
            }
            for (const [layer, a, b] of s.probe) {
                const [x1, y1] = at(data.points[a], layer);
                const [x2, y2] = at(data.points[b], layer);
                Anim.el("line", { x1, y1, x2, y2, stroke: Anim.C.probe, "stroke-width": 4, "stroke-linecap": "round" }, overlay);
            }
            s.seen.forEach((nodes, layer) => nodes.forEach((node) => {
                const [x, y] = at(data.points[node], layer);
                Anim.el("circle", { cx: x, cy: y, r: 6, fill: Anim.C.seen }, overlay);
            }));
            for (const [layer, , b] of s.probe) {
                const [x, y] = at(data.points[b], layer);
                Anim.el("circle", { cx: x, cy: y, r: 10, fill: "none", stroke: Anim.C.probe, "stroke-width": 2.5 }, overlay);
            }
            for (const node of s.found.length ? [] : s.beam) {
                const [x, y] = at(data.points[node], s.layer);
                Anim.el("circle", { cx: x, cy: y, r: 12, fill: "none", stroke: Anim.C.beam, "stroke-width": 3 }, overlay);
            }
            if (s.current !== null) {
                const [x, y] = at(data.points[s.current], s.layer);
                Anim.el("circle", { cx: x, cy: y, r: 9, fill: Anim.C.accent, stroke: "white", "stroke-width": 2 }, overlay);
            }
            for (const node of s.found) {
                const [x, y] = at(data.points[node], 0);
                Anim.el("circle", { cx: x, cy: y, r: 8, fill: Anim.C.beam }, overlay);
            }
            if (s.found.length) {
                for (const node of data.truth) {
                    const [x, y] = at(data.points[node], 0);
                    Anim.el("circle", { cx: x, cy: y, r: 14, fill: "none", stroke: "white", "stroke-width": 1.5, "stroke-dasharray": "3 3" }, overlay);
                }
            }
        };
        return new Anim.Player(host, data.steps, draw);
    }
    Anim.views["hnsw"] = mountHnsw;
})(Anim || (Anim = {}));
// LSH with random projections: hyperplanes through the origin cut the space into buckets,
// and a query is compared only with the vectors of its bucket.
var Anim;
(function (Anim) {
    // A wide drawing: the plane on the left (clipped to a 450 x 400 box), the panel on the right
    const CX = 225, CY = 200, R = 160, PANEL_X = 480;
    function xy(v, scale = 1) {
        return [CX + R * scale * v[0], CY - R * scale * v[1]];
    }
    function polar(angle, radius) {
        return xy([Math.cos(angle), Math.sin(angle)], radius);
    }
    // Lines through the origin cut the plane into angular sectors; each sector is one bucket
    function sectors(normals) {
        if (normals.length === 0) {
            return [];
        }
        const cuts = [];
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
    function mountLsh(host, raw) {
        const data = raw;
        const uid = `lsh-${instances++}`;
        const n = data.points.length;
        const svg = Anim.el("svg", { viewBox: "0 0 960 400", role: "img", "aria-label": "LSH with random projections" });
        host.appendChild(svg);
        const defs = Anim.el("defs", {}, svg);
        const clip = Anim.el("clipPath", { id: `${uid}-clip` }, defs);
        Anim.el("rect", { x: CX - 225, y: CY - 200, width: 450, height: 400 }, clip);
        const marker = Anim.el("marker", { id: `${uid}-arrow`, viewBox: "0 0 10 10", refX: 8, refY: 5, markerWidth: 7, markerHeight: 7, orient: "auto-start-reverse" }, defs);
        Anim.el("path", { d: "M 0 0 L 10 5 L 0 10 z", fill: Anim.C.text }, marker);
        const plot = Anim.el("g", { "clip-path": `url(#${uid}-clip)` }, svg);
        const panel = Anim.el("g", {}, svg);
        const draw = (i) => {
            const s = data.steps[i];
            Anim.clear(plot);
            Anim.clear(panel);
            const normals = data.normals.slice(0, s.planes);
            const colour = new Map();
            sectors(normals).forEach((sector, k) => {
                var _a, _b;
                colour.set(sector.code, Anim.PALETTE[k % Anim.PALETTE.length]);
                const searched = (_b = (_a = s.buckets) === null || _a === void 0 ? void 0 : _a.includes(sector.code)) !== null && _b !== void 0 ? _b : false;
                const [x1, y1] = polar(sector.from, 1.8); // beyond the corners of the clipped square
                const [x2, y2] = polar(sector.to, 1.8);
                const large = sector.to - sector.from > Math.PI ? 1 : 0;
                Anim.el("path", {
                    d: `M ${CX} ${CY} L ${x1} ${y1} A ${1.8 * R} ${1.8 * R} 0 ${large} 0 ${x2} ${y2} Z`,
                    fill: colour.get(sector.code), "fill-opacity": searched ? 0.4 : 0.09,
                }, plot);
                const [tx, ty] = polar((sector.from + sector.to) / 2, 1 + 28 / R); // beyond the vectors
                Anim.el("text", {
                    x: tx, y: ty + 6, fill: colour.get(sector.code), "font-size": 19, "text-anchor": "middle",
                    "font-family": "monospace", "font-weight": searched ? "bold" : "normal",
                }, plot, sector.code);
            });
            Anim.el("line", { x1: CX - 8, y1: CY, x2: CX + 8, y2: CY, stroke: Anim.C.text, "stroke-width": 1.5 }, plot); // origin
            Anim.el("line", { x1: CX, y1: CY - 8, x2: CX, y2: CY + 8, stroke: Anim.C.text, "stroke-width": 1.5 }, plot);
            normals.forEach(([a, b], k) => {
                const norm = Math.hypot(a, b);
                const [dx, dy] = [-b / norm, a / norm];
                const [x1, y1] = xy([-1.4 * dx, -1.4 * dy]);
                const [x2, y2] = xy([1.4 * dx, 1.4 * dy]);
                Anim.el("line", { x1, y1, x2, y2, stroke: Anim.C.text, "stroke-opacity": 0.75, "stroke-width": 1.5, "stroke-dasharray": "7 5" }, plot);
                const [ax, ay] = xy([(0.42 * a) / norm, (0.42 * b) / norm]);
                Anim.el("line", { x1: CX, y1: CY, x2: ax, y2: ay, stroke: Anim.C.text, "stroke-width": 2, "marker-end": `url(#${uid}-arrow)` }, plot);
                const [lx, ly] = xy([(0.52 * a) / norm, (0.52 * b) / norm]);
                Anim.el("text", { x: lx, y: ly + 6, fill: Anim.C.text, "font-size": 17, "text-anchor": "middle" }, plot, `h${k + 1}`);
            });
            data.points.forEach((p, k) => {
                const [x, y] = xy(p);
                const inBucket = s.candidates ? s.candidates.includes(k) : true;
                const fill = s.planes ? colour.get(data.codes[k].slice(0, s.planes)) : Anim.C.node;
                Anim.el("circle", {
                    cx: x, cy: y, r: 6.5, fill, "fill-opacity": inBucket ? 1 : 0.2,
                    stroke: s.candidates && inBucket ? "white" : "none", "stroke-width": 1.5,
                }, plot);
            });
            if (s.query) {
                const [x, y] = xy(s.query);
                const [ex, ey] = xy(s.query, 1.35);
                Anim.el("line", { x1: CX, y1: CY, x2: ex, y2: ey, stroke: Anim.C.query, "stroke-opacity": 0.6, "stroke-dasharray": "2 4", "stroke-width": 2 }, plot);
                Anim.el("polygon", { points: Anim.star(x, y, 13), fill: Anim.C.query, stroke: "white", "stroke-width": 1 }, plot);
            }
            if (s.result && s.truth !== undefined) {
                const found = s.best === s.truth;
                if (s.best !== null && s.best !== undefined) {
                    const [x, y] = xy(data.points[s.best]);
                    Anim.el("circle", { cx: x, cy: y, r: 13, fill: "none", stroke: Anim.C.beam, "stroke-width": 3 }, plot);
                }
                if (!found) {
                    const [x, y] = xy(data.points[s.truth]);
                    Anim.el("circle", { cx: x, cy: y, r: 13, fill: "none", stroke: Anim.C.miss, "stroke-width": 3, "stroke-dasharray": "4 3" }, plot);
                }
            }
            // side panel: the bits of the query, what is searched, and what it costs
            let y = 36;
            const line = (text, colour = Anim.C.text, size = 22, mono = false) => {
                Anim.el("text", { x: PANEL_X, y, fill: colour, "font-size": size, "font-family": mono ? "monospace" : "inherit" }, panel, text);
                y += size + 10;
            };
            line("Hyperplanes", Anim.C.accent, 27);
            y += 2;
            data.normals.forEach((_, k) => {
                const drawn = k < s.planes;
                const bit = s.qcode ? s.qcode[k] : undefined;
                const text = !drawn ? `h${k + 1}  (not drawn yet)`
                    : bit === undefined ? `h${k + 1}  normal vector n${k + 1}`
                        : `h${k + 1}  q · n${k + 1} ${bit === "1" ? ">" : "<"} 0  →  bit ${bit}`;
                line(text, drawn ? Anim.C.text : "#607d8b");
            });
            y += 6;
            const buckets = new Set(data.codes.map((c) => c.slice(0, s.planes))).size;
            line(`${buckets} non-empty bucket${buckets > 1 ? "s" : ""}`);
            if (s.qcode) {
                line(`query code: ${s.qcode}`, Anim.C.query, 22, true);
            }
            if (s.buckets) {
                line(`searched: ${s.buckets.join(", ")}`, Anim.C.text, 20, true);
            }
            if (s.candidates) {
                line(`distance computations: ${s.candidates.length} of ${n}`);
            }
            if (s.result && s.truth !== undefined) {
                line(s.best === s.truth ? "nearest neighbour found" : "nearest neighbour missed", s.best === s.truth ? Anim.C.beam : Anim.C.miss);
            }
        };
        return new Anim.Player(host, data.steps, draw);
    }
    Anim.views["lsh"] = mountLsh;
})(Anim || (Anim = {}));
// IVF: k-means training (Voronoi cells), inverted lists, and a query scanned with nprobe = 1, then 2.
var Anim;
(function (Anim) {
    // The plot keeps the square of the former layout (a static frame crops it with viewBox "30 15 530 530"),
    // and the inverted lists take the rest of a wide drawing, one row per cell.
    const PX = 40, PY = 25, PS = 510;
    const VW = 1860, VH = 560, LX = 640, LEND = 1780;
    function xy(p) {
        return [PX + PS * p[0], PY + PS * (1 - p[1])];
    }
    // Cell of centroid i inside the unit square: clip the square by the bisector of (i, j), for every j
    function voronoiCell(centroids, i) {
        let poly = [[0, 0], [1, 0], [1, 1], [0, 1]];
        const [ax, ay] = centroids[i];
        centroids.forEach(([bx, by], j) => {
            if (j === i || poly.length === 0) {
                return;
            }
            // keep the points p with (p - m) . (b - a) <= 0, m the middle of a and b
            const side = ([x, y]) => (x - (ax + bx) / 2) * (bx - ax) + (y - (ay + by) / 2) * (by - ay);
            const clipped = [];
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
    function outline(centroids, cells) {
        const dist = (p, c) => Math.hypot(p[0] - centroids[c][0], p[1] - centroids[c][1]);
        const parts = [];
        for (const a of cells) {
            const poly = voronoiCell(centroids, a);
            poly.forEach((p, k) => {
                const q = poly[(k + 1) % poly.length];
                const m = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
                if (!cells.some((b) => b !== a && Math.abs(dist(m, b) - dist(m, a)) < 1e-7)) {
                    parts.push(`M ${xy(p).join(" ")} L ${xy(q).join(" ")}`);
                }
            });
        }
        return parts.join(" ");
    }
    function mountIvf(host, raw) {
        const data = raw;
        const n = data.points.length;
        const svg = Anim.el("svg", { viewBox: `0 0 ${VW} ${VH}`, role: "img", "aria-label": "IVF index" });
        const sizes = data.steps.flatMap((s) => (s.labels && s.centroids ? s.centroids.map((_, c) => s.labels.filter((l) => l === c).length) : []));
        const pitch = Math.min(30, (LEND - 860) / Math.max(1, ...sizes)); // one square per vector of a list
        host.appendChild(svg);
        Anim.el("rect", { x: PX, y: PY, width: PS, height: PS, fill: "none", stroke: Anim.C.accent, "stroke-opacity": 0.35 }, svg);
        const plot = Anim.el("g", {}, svg);
        const panel = Anim.el("g", {}, svg);
        const draw = (i) => {
            var _a, _b;
            const s = data.steps[i];
            Anim.clear(plot);
            Anim.clear(panel);
            const centroids = (_a = s.centroids) !== null && _a !== void 0 ? _a : [];
            const probed = new Set((_b = s.probe) !== null && _b !== void 0 ? _b : []);
            centroids.forEach((_, c) => {
                const cell = voronoiCell(centroids, c).map((p) => xy(p).join(",")).join(" ");
                Anim.el("polygon", {
                    points: cell, fill: Anim.PALETTE[c], "fill-opacity": probed.has(c) ? 0.38 : 0.1,
                    stroke: Anim.C.text, "stroke-opacity": 0.5, "stroke-width": 1.2,
                }, plot);
            });
            if (probed.size) { // the scanned region: a heavy outline around the nprobe cells, on a dark casing
                const d = outline(centroids, [...probed]);
                const line = { d, fill: "none", "stroke-linecap": "round", "stroke-linejoin": "round" };
                Anim.el("path", { ...line, stroke: "#002b36", "stroke-width": 12 }, plot);
                Anim.el("path", { ...line, stroke: "white", "stroke-width": 6 }, plot);
            }
            const scanned = s.scanned ? new Set(s.scanned) : null;
            data.points.forEach((p, k) => {
                const [x, y] = xy(p);
                const inScan = scanned ? scanned.has(k) : true;
                Anim.el("circle", {
                    cx: x, cy: y, r: 6, fill: s.labels ? Anim.PALETTE[s.labels[k]] : Anim.C.node, "fill-opacity": inScan ? 1 : 0.2,
                    stroke: scanned && inScan ? "white" : "none", "stroke-width": 1.5,
                }, plot);
            });
            if (s.query && s.order) {
                const [qx, qy] = xy(s.query);
                for (const c of s.order) {
                    const [x, y] = xy(centroids[c]);
                    Anim.el("line", { x1: qx, y1: qy, x2: x, y2: y, stroke: Anim.C.query, "stroke-opacity": probed.size ? 0.15 : 0.6, "stroke-dasharray": "4 4", "stroke-width": 1.5 }, plot);
                }
            }
            centroids.forEach((ctr, c) => {
                const [x, y] = xy(ctr);
                Anim.el("rect", {
                    x: x - 8, y: y - 8, width: 16, height: 16, transform: `rotate(45 ${x} ${y})`,
                    fill: Anim.PALETTE[c], stroke: "white", "stroke-width": 2,
                }, plot);
            });
            if (s.query) {
                const [x, y] = xy(s.query);
                Anim.el("polygon", { points: Anim.star(x, y, 13), fill: Anim.C.query, stroke: "white", "stroke-width": 1 }, plot);
            }
            if (s.result && s.best !== undefined && s.truth !== undefined) {
                // the vector returned (green, with a halo) and, when it differs, the true nearest neighbour (red),
                // each with a short label, the labels on opposite sides so that they do not overlap
                const found = s.best === s.truth;
                const [bx, by] = xy(data.points[s.best]);
                const [tx, ty] = xy(data.points[s.truth]);
                const up = found || by <= ty;
                const label = (x, y, text, colour) => {
                    Anim.el("text", {
                        x, y, fill: colour, "font-size": 24, "font-weight": "bold", "text-anchor": "middle",
                        stroke: "#002b36", "stroke-width": 6, "paint-order": "stroke", "stroke-linejoin": "round",
                    }, plot, text);
                };
                if (!found) {
                    Anim.el("circle", { cx: tx, cy: ty, r: 16, fill: "none", stroke: Anim.C.miss, "stroke-width": 4.5, "stroke-dasharray": "6 4" }, plot);
                    label(tx, up ? ty + 58 : ty - 40, "nearest neighbour, missed", Anim.C.miss);
                }
                Anim.el("circle", { cx: bx, cy: by, r: 26, fill: Anim.C.beam, "fill-opacity": 0.4 }, plot);
                Anim.el("circle", { cx: bx, cy: by, r: 16, fill: "none", stroke: Anim.C.beam, "stroke-width": 4.5 }, plot);
                label(bx, up ? by - 42 : by + 60, found ? "nearest neighbour, found" : "result", Anim.C.beam);
            }
            // the lists: one row per cell, with one square per vector of the cell
            const text = (x, y, label, colour = Anim.C.text, size = 38, anchor = "start") => {
                Anim.el("text", { x, y, fill: colour, "font-size": size, "text-anchor": anchor }, panel, label);
            };
            const title = !s.centroids ? "Vectors"
                : s.lists ? "Inverted lists" + (s.probe ? `, nprobe = ${s.probe.length}` : "")
                    : "k-means" + (s.iteration !== undefined ? `, iteration ${s.iteration}` : ", initial centroids");
            text(LX, 68, title, Anim.C.accent, 48);
            if (!s.centroids) {
                text(LX, 150, `${n} vectors, no index yet`);
                return;
            }
            centroids.forEach((_, c) => {
                const y = 150 + 66 * c; // middle of the row
                const scanned = probed.has(c);
                const dim = probed.size > 0 && !scanned;
                Anim.el("rect", { x: LX, y: y - 17, width: 34, height: 34, fill: Anim.PALETTE[c], "fill-opacity": s.labels ? (dim ? 0.3 : 1) : 0.4 }, panel);
                text(LX + 56, y + 13, `cell ${c + 1}`, scanned ? "white" : dim ? "#607d8b" : Anim.C.text);
                if (!s.labels) {
                    return;
                }
                const members = s.labels.flatMap((l, k) => (l === c ? [k] : []));
                members.forEach((k, j) => {
                    var _a;
                    Anim.el("rect", {
                        x: 860 + j * pitch, y: y - 17, width: Math.max(4, pitch - 6), height: 34, rx: 3, fill: Anim.PALETTE[c],
                        "fill-opacity": dim ? 0.2 : 0.9, stroke: scanned && ((_a = s.scanned) === null || _a === void 0 ? void 0 : _a.includes(k)) ? "white" : "none", "stroke-width": 3,
                    }, panel);
                });
                text(860 + members.length * pitch + 10, y + 13, String(members.length), scanned ? "white" : dim ? "#607d8b" : Anim.C.text);
            });
            if (s.count !== undefined) {
                const found = s.best === s.truth;
                text(LX, 548, `distance computations: ${s.count} of ${n}` + (s.result ? "," : ""), Anim.C.text, 36);
                if (s.result) {
                    text(LEND + 60, 548, found ? "nearest neighbour found" : "nearest neighbour missed", found ? Anim.C.beam : Anim.C.miss, 36, "end");
                }
            }
        };
        return new Anim.Player(host, data.steps, draw);
    }
    Anim.views["ivf"] = mountIvf;
})(Anim || (Anim = {}));
// Product quantization of 2D vectors with m = 2 sub-vectors (one coordinate each):
// one codebook per coordinate, the product grid, the codes, and distances by table lookups.
var Anim;
(function (Anim) {
    // A wide drawing: the plot with its two strips on the left, the tables on the right
    const PX = 80, PY = 10, PS = 332, TX = 480, TX2 = 690;
    function xy(p) {
        return [PX + PS * p[0], PY + PS * (1 - p[1])];
    }
    // boundaries of the 1D cells: middles of consecutive centroids
    function cuts(codebook) {
        return codebook.slice(1).map((c, i) => (c + codebook[i]) / 2);
    }
    function mountPq(host, raw) {
        const data = raw;
        const [cbx, cby] = data.codebooks;
        const svg = Anim.el("svg", { viewBox: "0 0 960 400", role: "img", "aria-label": "Product quantization" });
        host.appendChild(svg);
        Anim.el("rect", { x: PX, y: PY, width: PS, height: PS, fill: "none", stroke: Anim.C.accent, "stroke-opacity": 0.35 }, svg);
        const stripY = PY + PS + 14; // projections on the first coordinate
        const stripX = PX - 14; // projections on the second coordinate
        const layer = Anim.el("g", {}, svg);
        const panel = Anim.el("g", {}, svg);
        const draw = (i) => {
            const s = data.steps[i];
            Anim.clear(layer);
            Anim.clear(panel);
            const recon = (k) => [cbx[data.codes[k][0]], cby[data.codes[k][1]]];
            if (s.stage >= 1) {
                Anim.el("text", { x: PX + PS / 2, y: stripY + 36, fill: Anim.C.text, "font-size": 18, "text-anchor": "middle" }, layer, "sub-vector 1");
                Anim.el("text", {
                    x: stripX - 30, y: PY + PS / 2, fill: Anim.C.text, "font-size": 18, "text-anchor": "middle",
                    transform: `rotate(-90 ${stripX - 30} ${PY + PS / 2})`,
                }, layer, "sub-vector 2");
                for (const p of data.points) {
                    const [x, y] = xy(p);
                    Anim.el("line", { x1: x, y1: stripY, x2: x, y2: stripY + 12, stroke: Anim.C.node, "stroke-opacity": 0.6 }, layer);
                    Anim.el("line", { x1: stripX - 12, y1: y, x2: stripX, y2: y, stroke: Anim.C.node, "stroke-opacity": 0.6 }, layer);
                }
            }
            if (s.stage >= 2) {
                for (const c of cuts(cbx)) {
                    const [x] = xy([c, 0]);
                    Anim.el("line", { x1: x, y1: PY, x2: x, y2: PY + PS, stroke: Anim.C.accent, "stroke-opacity": 0.45, "stroke-width": 1.2 }, layer);
                }
                cbx.forEach((c) => {
                    const [x] = xy([c, 0]);
                    Anim.el("polygon", { points: `${x},${stripY + 2} ${x - 7},${stripY + 16} ${x + 7},${stripY + 16}`, fill: Anim.C.accent }, layer);
                });
            }
            if (s.stage >= 3) {
                for (const c of cuts(cby)) {
                    const [, y] = xy([0, c]);
                    Anim.el("line", { x1: PX, y1: y, x2: PX + PS, y2: y, stroke: Anim.C.probe, "stroke-opacity": 0.45, "stroke-width": 1.2 }, layer);
                }
                cby.forEach((c) => {
                    const [, y] = xy([0, c]);
                    Anim.el("polygon", { points: `${stripX - 2},${y} ${stripX - 16},${y - 7} ${stripX - 16},${y + 7}`, fill: Anim.C.probe }, layer);
                });
            }
            if (s.stage >= 4) {
                for (const a of cbx) {
                    for (const b of cby) {
                        const [x, y] = xy([a, b]);
                        Anim.el("rect", { x: x - 3.5, y: y - 3.5, width: 7, height: 7, transform: `rotate(45 ${x} ${y})`, fill: "white", "fill-opacity": 0.55 }, layer);
                    }
                }
            }
            data.points.forEach((p, k) => {
                const [x, y] = xy(p);
                if (s.stage >= 5) {
                    const [rx, ry] = xy(recon(k));
                    Anim.el("line", { x1: x, y1: y, x2: rx, y2: ry, stroke: Anim.C.query, "stroke-opacity": 0.7, "stroke-width": 1.5 }, layer);
                }
                Anim.el("circle", { cx: x, cy: y, r: 5.5, fill: Anim.C.node, "fill-opacity": s.stage >= 5 ? 0.45 : 0.9 }, layer);
            });
            if (s.stage >= 6) {
                const [x, y] = xy(data.query);
                Anim.el("polygon", { points: Anim.star(x, y, 13), fill: Anim.C.query, stroke: "white", "stroke-width": 1 }, layer);
            }
            if (s.example !== undefined) {
                const [x, y] = xy(data.points[s.example]);
                const [rx, ry] = xy(recon(s.example));
                Anim.el("circle", { cx: x, cy: y, r: 11, fill: "none", stroke: "white", "stroke-width": 2.5 }, layer);
                Anim.el("rect", { x: rx - 7, y: ry - 7, width: 14, height: 14, transform: `rotate(45 ${rx} ${ry})`, fill: Anim.C.beam }, layer);
            }
            if (s.stage >= 8) {
                for (const k of data.top) {
                    const [x, y] = xy(data.points[k]);
                    Anim.el("circle", { cx: x, cy: y, r: 8, fill: Anim.C.beam }, layer);
                }
                for (const k of data.truth) {
                    const [x, y] = xy(data.points[k]);
                    Anim.el("circle", { cx: x, cy: y, r: 14, fill: "none", stroke: "white", "stroke-width": 1.5, "stroke-dasharray": "3 3" }, layer);
                }
            }
            // side panel: the two codebooks, then the two lookup tables of the query, and the cost of a vector
            let y = 34;
            const text = (x, label, colour = Anim.C.text, size = 21, mono = true, anchor = "start") => {
                Anim.el("text", { x, y, fill: colour, "font-size": size, "font-family": mono ? "monospace" : "inherit", "text-anchor": anchor }, panel, label);
            };
            const bits = Math.log2(cbx.length);
            const withQuery = s.stage >= 6;
            text(TX, withQuery ? "Lookup tables" : "Codebooks", Anim.C.accent, 27, false);
            if (s.status) {
                text(950, s.status, Anim.C.probe, 22, false, "end");
            }
            if (s.stage < 2) {
                y += 46;
                text(TX, s.stage === 0 ? "a vector: 2 floats, 64 bits" : "a vector: 2 sub-vectors", Anim.C.text, 22, false);
                return;
            }
            y += 42;
            text(TX, withQuery ? "T1[i]" : "c1[i]", Anim.C.accent, 21);
            if (s.stage >= 3) {
                text(TX2, withQuery ? "T2[j]" : "c2[j]", Anim.C.probe, 21);
            }
            y += 4;
            cbx.forEach((cx, k) => {
                y += 29;
                const used = s.example !== undefined;
                const hiX = used && data.codes[s.example][0] === k;
                const hiY = used && data.codes[s.example][1] === k;
                text(TX, `${k}: ${(withQuery ? data.tables[0][k] : cx).toFixed(4)}`, hiX ? Anim.C.beam : Anim.C.text);
                if (s.stage >= 3) {
                    text(TX2, `${k}: ${(withQuery ? data.tables[1][k] : cby[k]).toFixed(4)}`, hiY ? Anim.C.beam : Anim.C.text);
                }
            });
            y += 44;
            if (s.example !== undefined) {
                const [a, b] = data.codes[s.example];
                const approx = data.tables[0][a] + data.tables[1][b];
                text(TX, `code (${a}, ${b}): ${data.tables[0][a].toFixed(4)} + ${data.tables[1][b].toFixed(4)}`, Anim.C.beam, 21);
                y += 30;
                text(TX, `  = ${approx.toFixed(4)}, exact ${data.exact[s.example].toFixed(4)}`, Anim.C.text, 21);
            }
            else if (s.stage >= 4) {
                text(TX, `${cbx.length} \u00d7 ${cby.length} = ${cbx.length * cby.length} points, ${2 * bits} bits`, Anim.C.text, 21, false);
            }
        };
        return new Anim.Player(host, data.steps, draw);
    }
    Anim.views["pq"] = mountPq;
})(Anim || (Anim = {}));
// Shared pieces of the watermarking animations (deck 10): the text being generated, the line that shows
// what the key is hashed with, bars, and the detection panel. Drawn in HTML rather than SVG, so that the
// text wraps and the bars move with CSS transitions.
var Anim;
(function (Anim) {
    Anim.WM = { green: "#66bb6a", red: "#ef5350" };
    const WM_STYLE = `
.wa { position: relative; padding-top: 0.6em; font-size: 0.5em; text-align: left; color: #eee8d5; }
.wa-tally { position: absolute; top: 0.6em; right: 1.2em; transform: translateY(-50%); padding: 0 0.5em; background: #002b36;
  color: #93a1a1; font-size: 0.85em; line-height: 1.3; white-space: nowrap; font-variant-numeric: tabular-nums; }
.wa-tally:empty { display: none; }
.wa-tally b { color: #eee8d5; font-weight: normal; }
.wa-text { font-family: monospace; font-size: 0.95em; line-height: 1.9; white-space: pre-wrap; min-height: 5.7em;
  padding: 0.15em 0.6em; border: 1px solid rgba(255, 255, 255, 0.12); border-radius: 6px; background: rgba(0, 0, 0, 0.15); }
.wa-text .tk { border-radius: 3px; }
.wa-text .ctx { outline: 2px solid ${Anim.C.accent}; outline-offset: 1px; border-radius: 3px; }
.wa-text .new { animation: wa-pop 0.7s ease-out; }
.wa-slot { color: ${Anim.C.accent}; border: 1.5px dashed ${Anim.C.accent}; border-radius: 3px; padding: 0 0.3em; margin-left: 0.4em; }
@keyframes wa-pop { from { box-shadow: 0 0 0 5px rgba(255, 255, 255, 0.8); } to { box-shadow: 0 0 0 0 rgba(255, 255, 255, 0); } }
.wa-seed { text-align: center; color: #93a1a1; font-size: 0.9em; margin: 0.45em 0 0.35em; min-height: 1.4em; }
.wa-seed .key { font-family: monospace; color: ${Anim.C.accent}; }
.wa-seed .ctx-ref { font-family: monospace; color: #eee8d5; white-space: pre; outline: 2px solid ${Anim.C.accent};
  outline-offset: 1px; border-radius: 3px; padding: 0 0.2em; }
.wa-body { position: relative; }
.wa-fade { transition: opacity 0.5s; }
.wa-row { align-items: center; height: 1.5em; box-sizing: border-box; padding: 0 0.3em;
  border: 2px solid transparent; border-radius: 4px; transition: border-color 0.3s, background 0.3s; }
.wa-row.extra { margin-top: 0.4em; position: relative; }
.wa-row.extra::before { content: "⋯"; position: absolute; left: 2.5em; top: -0.95em; color: #93a1a1; font-size: 0.8em; }
.wa-row.pick { border-color: #fdf6e3; background: rgba(255, 255, 255, 0.1); font-weight: bold; }
.wa-tok { font-family: monospace; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.wa-track { position: relative; height: 0.85em; background: rgba(255, 255, 255, 0.06); border-radius: 2px; }
.wa-fill, .wa-ghost { position: absolute; left: 0; top: 0; bottom: 0; width: 0; transition: width 0.7s ease, opacity 0.4s; }
.wa-fill { background: var(--c); border-radius: 2px; }
.wa-ghost { box-sizing: border-box; border: 1.5px dashed #fdf6e3; border-radius: 2px; opacity: 0; }
.wa-val { font-family: monospace; font-size: 0.85em; text-align: right; color: #cfd8dc; white-space: nowrap; }
.wa-rank { position: absolute; right: 0.4em; top: 50%; transform: translateY(-50%); font-size: 0.7em; line-height: 1;
  color: #93a1a1; font-weight: normal; }
.wa-detect { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
  opacity: 0; pointer-events: none; transition: opacity 0.5s; }
.wa-detect.on { opacity: 1; }
.wa-detect-grid { display: grid; grid-template-columns: auto auto; gap: 0.3em 1.5em; font-size: 1.2em;
  padding: 0.6em 1.4em; border: 1px solid ${Anim.C.accent}; border-radius: 8px; background: rgba(0, 43, 54, 0.9); }
.wa-detect-grid .label { color: #93a1a1; }
.wa-detect-grid .value { font-family: monospace; }
`;
    function addStyle(id, css) {
        if (!document.getElementById(id)) {
            const style = document.createElement("style");
            style.id = id;
            style.textContent = css;
            document.head.appendChild(style);
        }
    }
    Anim.addStyle = addStyle;
    function div(cls, parent, text) {
        const node = document.createElement("div");
        node.className = cls;
        if (text !== undefined) {
            node.textContent = text;
        }
        parent.appendChild(node);
        return node;
    }
    Anim.div = div;
    function span(parent, text, cls = "") {
        const node = document.createElement("span");
        node.className = cls;
        node.textContent = text;
        parent.appendChild(node);
        return node;
    }
    Anim.span = span;
    function prob(p) {
        return p >= 0.0005 ? p.toFixed(3) : "<0.001";
    }
    Anim.prob = prob;
    function pValue(p) {
        return p >= 0.001 ? p.toPrecision(2) : p.toExponential(1);
    }
    Anim.pValue = pValue;
    // The context window as shown in the line of the hash
    function tidy(context) {
        return context.replace(/\n/g, "↵").trim();
    }
    Anim.tidy = tidy;
    function wmFrame(host) {
        addStyle("wa-style", WM_STYLE);
        const root = div("wa", host);
        const text = div("wa-text", root);
        const tally = div("wa-tally", root);
        return { root, text, tally, seed: div("wa-seed", root), body: div("wa-body", root) };
    }
    Anim.wmFrame = wmFrame;
    // The tally as label / value pairs, for instance [["green tokens", "5 / 8"], ["z", "1.9"]]
    function drawTally(box, items) {
        Anim.clear(box);
        items.forEach(([label, value], k) => {
            span(box, (k ? ", " : "") + label + ": ");
            box.appendChild(document.createElement("b")).textContent = value;
        });
    }
    Anim.drawTally = drawTally;
    // The text so far: the tokens of the context window [from, to) are outlined, the token at index `fresh`
    // flashes, and a slot stands for the next token when `slot` is true
    function drawText(box, words, ctx, fresh, slot) {
        Anim.clear(box);
        let target = box;
        words.forEach((w, k) => {
            if (ctx && k === Math.max(ctx[0], 0)) {
                target = span(box, "", "ctx");
            }
            const s = span(target, w.text, k === fresh ? "tk new" : "tk");
            if (w.bg) {
                s.style.background = w.bg;
            }
            if (ctx && k === ctx[1] - 1) {
                target = box;
            }
        });
        if (slot) {
            span(box, "?", "wa-slot");
        }
    }
    Anim.drawText = drawText;
    // For instance: green list = hash(key, [small])
    function drawSeed(box, pre, ctx, close, post) {
        Anim.clear(box);
        span(box, pre);
        span(box, "hash(key, ", "key");
        span(box, tidy(ctx), "ctx-ref");
        span(box, close, "key");
        span(box, post);
    }
    Anim.drawSeed = drawSeed;
    function drawNote(box, text) {
        Anim.clear(box);
        span(box, text);
    }
    Anim.drawNote = drawNote;
    function detectPanel(parent, rows) {
        const panel = div("wa-detect", parent);
        const grid = div("wa-detect-grid", panel);
        for (const [label, value] of rows) {
            div("label", grid, label);
            div("value", grid, value);
        }
        return panel;
    }
    Anim.detectPanel = detectPanel;
    function bar(parent, colour) {
        const track = div("wa-track", parent);
        if (colour) {
            track.style.setProperty("--c", colour);
        }
        return { track, ghost: div("wa-ghost", track), fill: div("wa-fill", track) };
    }
    Anim.bar = bar;
    function setWidth(node, fraction) {
        node.style.width = `${100 * Math.max(0, Math.min(1, fraction))}%`;
    }
    Anim.setWidth = setWidth;
})(Anim || (Anim = {}));
// Red/green lists (Kirchenbauer et al., 2023): at every step, the key and the previous token split the
// vocabulary into a green list and a red list, and the green logits get a bonus delta before sampling.
var Anim;
(function (Anim) {
    const KGW_STYLE = `
.kgw-lists { display: grid; grid-template-columns: 1fr 1fr; gap: 1.6em; }
.kgw-head { font-weight: bold; margin: 0 0 0.2em 0.35em; }
.kgw-list.green .kgw-head { color: ${Anim.WM.green}; }
.kgw-list.red .kgw-head { color: ${Anim.WM.red}; }
.kgw-list.green { --c: ${Anim.WM.green}; }
.kgw-list.red { --c: ${Anim.WM.red}; }
.kgw-rows { min-height: 9.4em; } /* room for 6 rows: the 5 most likely and the sampled token */
.kgw-rows .wa-row { display: grid; grid-template-columns: 6.6em 1fr 7.4em; gap: 0.5em; }
.kgw-mass { display: grid; grid-template-columns: auto 1fr 7.4em; gap: 0.7em; align-items: center; margin: 0.5em 0.35em 0; }
.kgw-massbar { display: flex; height: 0.95em; border-radius: 3px; overflow: hidden; background: ${Anim.WM.red}; }
.kgw-massbar .g { background: ${Anim.WM.green}; width: 0; transition: width 0.7s ease; }
`;
    const BG_GREEN = "rgba(46, 160, 67, 0.55)", BG_RED = "rgba(218, 54, 51, 0.45)";
    function zScore(green, n, gamma) {
        return (green - gamma * n) / Math.sqrt(n * gamma * (1 - gamma));
    }
    function mountKgw(host, raw) {
        const data = raw;
        Anim.addStyle("kgw-style", KGW_STYLE);
        const f = Anim.wmFrame(host);
        const listBox = Anim.div("kgw-lists wa-fade", f.body);
        const rowBoxes = ["green", "red"].map((name) => {
            const box = Anim.div(`kgw-list ${name}`, listBox);
            Anim.div("kgw-head", box, `${name === "green" ? "Green" : "Red"} list: 5 most likely tokens`);
            return Anim.div("kgw-rows", box);
        });
        const mass = Anim.div("kgw-mass wa-fade", f.body);
        Anim.span(mass, "P(next token is green)");
        const massGreen = Anim.div("g", Anim.div("kgw-massbar", mass));
        const massValue = Anim.div("wa-val", mass);
        const d = data.detect;
        const expected = data.gamma * d.scored;
        const sd = Math.sqrt(d.scored * data.gamma * (1 - data.gamma));
        const detect = Anim.detectPanel(f.body, [
            ["green tokens", `${d.green} of ${d.scored}`],
            ["expected without the key", `${expected.toFixed(1)} ± ${sd.toFixed(1)}`],
            ["z-score", `(${d.green} − ${expected.toFixed(1)}) / ${sd.toFixed(1)} = ${d.z.toFixed(2)}`],
            ["p-value", Anim.pValue(d.p)],
        ]);
        let shown = -1; // the token whose lists are on screen
        let rows = [];
        const buildRows = (t) => {
            rows = data.tokens[t].lists.map((list, j) => {
                Anim.clear(rowBoxes[j]);
                return list.map((r) => {
                    const row = Anim.div(`wa-row${r.extra ? " extra" : ""}`, rowBoxes[j]);
                    Anim.div("wa-tok", row, r.tok);
                    const b = Anim.bar(row);
                    if (r.extra) {
                        Anim.span(b.track, `rank ${r.rank}`, "wa-rank");
                    }
                    return { row, bar: b, value: Anim.div("wa-val", row) };
                });
            });
            void f.root.offsetHeight; // new bars start from zero width, so that they grow
        };
        const draw = (i) => {
            const s = data.steps[i];
            const detecting = s.phase === "detect";
            const t = s.t;
            const tk = data.tokens[t];
            const sampled = s.phase === "sample" || detecting;
            const biased = s.phase !== "lists";
            const now = data.prompt.length + t; // position of the token being generated
            const words = [
                ...data.prompt.map((text) => ({ text })),
                ...data.tokens.slice(0, sampled ? t + 1 : t).map((x) => ({ text: x.text, bg: x.green ? BG_GREEN : BG_RED })),
            ];
            Anim.drawText(f.text, words, detecting ? null : [now - 1, now], s.phase === "sample" ? now : -1, !sampled);
            if (detecting) {
                Anim.drawNote(f.seed, "The detector rebuilds every list from the key and the text: it does not need the model.");
            }
            else {
                Anim.drawSeed(f.seed, "green list = ", tk.prev, ")", `, a fraction γ = ${data.gamma} of the vocabulary` + (biased ? `; green logits + δ = ${data.delta}` : ""));
            }
            if (shown !== t) {
                buildRows(t);
                shown = t;
            }
            tk.lists.forEach((list, j) => list.forEach((r, k) => {
                const v = rows[j][k];
                Anim.setWidth(v.bar.fill, biased ? r.pw : r.p);
                Anim.setWidth(v.bar.ghost, r.p);
                v.bar.ghost.style.opacity = biased && r.p >= 0.005 ? "0.8" : "0"; // no dashed sliver for tiny probabilities
                v.value.textContent = biased ? `${Anim.prob(r.p)} → ${Anim.prob(r.pw)}` : Anim.prob(r.p);
                v.row.classList.toggle("pick", sampled && !detecting && tk.pick[0] === j && tk.pick[1] === k);
            }));
            Anim.setWidth(massGreen, biased ? tk.pgw : tk.pg);
            massValue.textContent = biased ? `${tk.pg.toFixed(2)} → ${tk.pgw.toFixed(2)}` : tk.pg.toFixed(2);
            listBox.style.opacity = detecting ? "0.12" : "1";
            mass.style.opacity = detecting ? "0.12" : "1";
            detect.classList.toggle("on", detecting);
            // the count of the detector so far, on the border of the text
            const n = sampled ? t + 1 : t;
            const g = data.tokens.slice(0, n).filter((x) => x.green).length;
            Anim.drawTally(f.tally, detecting ? [["green tokens", `${d.green} / ${d.scored}`], ["z-score", d.z.toFixed(2)]]
                : n ? [["green tokens", `${g} / ${n}`], ["z-score", zScore(g, n, data.gamma).toFixed(1)]] : []);
        };
        return new Anim.Player(host, data.steps, draw);
    }
    Anim.views["kgw"] = mountKgw;
})(Anim || (Anim = {}));
// The Gumbel-max trick as an exponential race, without a language model: every token v gets an arrival time
// E_v = -log(U_v) / p_v, exponential with rate p_v, and the first token to arrive is the sample.
var Anim;
(function (Anim) {
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
    const laneY = (k) => Y0 + k * PITCH;
    const tX = (t) => X0 + (Math.min(t, TMAX) / TMAX) * (X1 - X0);
    const fX = (f) => X0 + (f / FMAX) * (X1 - X0);
    function mountRace(host, raw) {
        const data = raw;
        Anim.addStyle("race-style", RACE_STYLE);
        const n = data.p.length;
        const wrap = Anim.div("rc", host);
        const H = laneY(n) + 34;
        const svg = Anim.el("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": "The Gumbel-max trick as an exponential race" });
        wrap.appendChild(svg);
        const head = (x, anchor, text) => Anim.el("text", { x, y: 18, fill: "#93a1a1", "font-size": 16, "text-anchor": anchor }, svg, text);
        head(0, "start", "token");
        head(COL_P, "end", "p");
        const headU = head(COL_U, "end", "U");
        const headLane = head(X0, "start", "");
        const headRace = head(X1, "end", ""); // which race, or how many races
        headRace.setAttribute("fill", "#eee8d5");
        const headE = head(COL_E, "end", "E");
        const headS = head(COL_S, "end", "log p + g");
        const pmax = Math.max(...data.p);
        const lanes = data.p.map((p, k) => {
            const y = laneY(k), cy = y + LANE_H / 2;
            const bg = Anim.el("rect", { class: "rc-lane", x: X0, y, width: X1 - X0, height: LANE_H, rx: 4, fill: LANE_FILL }, svg);
            const points = [];
            for (let j = 0; j <= 80; j++) {
                const t = (TMAX * j) / 80;
                points.push(`${tX(t).toFixed(1)},${(y + LANE_H - ((LANE_H - 6) * p * Math.exp(-p * t)) / pmax).toFixed(1)}`);
            }
            const density = Anim.el("path", {
                class: "rc-fade", d: `M ${X0} ${y + LANE_H} L ${points.join(" L ")} L ${X1} ${y + LANE_H} Z`,
                fill: Anim.C.accent, "fill-opacity": 0.22, stroke: Anim.C.accent, "stroke-opacity": 0.5,
            }, svg);
            const ghost = Anim.el("rect", {
                class: "rc-fade", x: X0, y: y + 7, width: fX(p) - X0, height: LANE_H - 14, fill: "none",
                stroke: "#fdf6e3", "stroke-dasharray": "5 4", "stroke-width": 1.5,
            }, svg);
            const bar = Anim.el("rect", { class: "rc-bar", x: X0, y: y + 9, width: X1 - X0, height: LANE_H - 18, fill: Anim.C.accent, rx: 2 }, svg);
            bar.style.transform = "scaleX(0)";
            const marker = Anim.el("g", { class: "rc-move" }, svg);
            const dot = Anim.el("circle", { class: "rc-dot", cx: 0, cy, r: 8, fill: Anim.C.accent, stroke: "#fdf6e3", "stroke-width": 1.5 }, marker);
            const arrow = Anim.el("polygon", { points: `-10,${cy - 8} 4,${cy} -10,${cy + 8}`, fill: Anim.C.node }, marker);
            Anim.el("text", { x: 0, y: cy + 6, fill: "#eee8d5", "font-size": 17, "font-family": "monospace" }, svg, data.tokens[k]);
            Anim.el("text", { x: COL_P, y: cy + 6, fill: "#eee8d5", "font-size": 17, "text-anchor": "end", "font-family": "monospace" }, svg, p.toFixed(2));
            const text = (x) => Anim.el("text", { x, y: cy + 6, fill: "#cfd8dc", "font-size": 17, "text-anchor": "end", "font-family": "monospace" }, svg, "");
            return { bg, density, marker, dot, arrow, bar, ghost, u: text(COL_U), e: text(COL_E), s: text(COL_S) };
        });
        const axis = Anim.el("g", {}, svg);
        const clock = Anim.el("g", {}, svg);
        Anim.el("line", { x1: 0, x2: 0, y1: Y0 - 6, y2: laneY(n) - PITCH + LANE_H + 6, stroke: Anim.C.probe, "stroke-width": 2.5 }, clock);
        clock.style.opacity = "0";
        let race = -1; // the race whose arrival times are on screen
        let swept = false; // the clock has reached the first arrival of that race
        const drawAxis = (freqMode) => {
            Anim.clear(axis);
            const y = laneY(n) - PITCH + LANE_H + 8;
            Anim.el("line", { x1: X0, x2: X1, y1: y, y2: y, stroke: Anim.C.node, "stroke-width": 1 }, axis);
            const ticks = freqMode ? [0, 0.1, 0.2, 0.3, 0.4, 0.5] : [0, 1, 2, 3, 4];
            for (const v of ticks) {
                const x = freqMode ? fX(v) : tX(v);
                Anim.el("line", { x1: x, x2: x, y1: y, y2: y + 5, stroke: Anim.C.node }, axis);
                Anim.el("text", { x, y: y + 21, fill: "#93a1a1", "font-size": 14, "text-anchor": "middle" }, axis, freqMode ? v.toFixed(1) : String(v) + (v === TMAX ? "+" : ""));
            }
        };
        const draw = (i) => {
            const s = data.steps[i];
            const freqMode = s.freq !== undefined;
            drawAxis(freqMode);
            headU.textContent = freqMode ? "" : s.keyed ? "r (key)" : "U";
            headLane.textContent = freqMode ? "frequency of wins over many races (dashed: p)" : "arrival time E = −log(U) / p";
            headE.textContent = freqMode ? "freq." : "E";
            headS.textContent = freqMode ? "" : "log p + g";
            headRace.textContent = freqMode ? `${data.freqs[s.freq].n.toLocaleString("en")} races`
                : s.keyed ? "race with keyed values" : `race ${s.race + 1}`;
            if (freqMode) {
                const f = data.freqs[s.freq].f;
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
            const level = s.level;
            const r = data.races[s.race];
            const winX = tX(r.E[r.win]);
            const sweep = level >= 3 && (s.race !== race || !swept); // the clock runs from 0 to the first arrival
            race = s.race;
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
                lane.dot.setAttribute("fill", won ? Anim.WM.green : Anim.C.accent);
                lane.u.textContent = level >= 1 ? r.U[k].toFixed(3) : "";
                lane.e.textContent = level >= 2 ? r.E[k].toFixed(2) : "";
                lane.s.textContent = level >= 4 ? r.score[k].toFixed(2) : "";
                for (const t of [lane.e, lane.s]) {
                    t.setAttribute("font-weight", won ? "bold" : "normal");
                    t.setAttribute("fill", won ? Anim.WM.green : "#cfd8dc");
                }
            });
        };
        return new Anim.Player(host, data.steps, draw);
    }
    Anim.views["race"] = mountRace;
})(Anim || (Anim = {}));
// The Gumbel watermark (Aaronson, 2022): the key and the last h tokens give every token v a number r_v in (0, 1),
// and the output is the token with the largest r_v^(1/p_v). The distribution p of the model is not changed.
var Anim;
(function (Anim) {
    const GUMBEL_STYLE = `
.gb-head, .gb-rows .wa-row { display: grid; grid-template-columns: 6.6em 1fr 3.4em 1fr 3.4em 1fr 3.8em; gap: 0.5em; }
.gb-head { color: #93a1a1; padding: 0 calc(0.3em + 2px); margin-bottom: 0.15em; }
.gb-head .wide { grid-column: span 2; }
.gb-rows { min-height: 10.9em; } /* room for 7 rows: the 6 most likely and the winner */
`;
    const PHASES = ["model", "noise", "race", "detect"];
    // Shade of a chosen token: its detection score -log(1 - r), 1 on average without the key
    function shade(tk) {
        if (tk.repeat) {
            return "rgba(147, 161, 161, 0.25)";
        }
        const score = -Math.log(1 - tk.r);
        return `rgba(79, 195, 247, ${Math.min(0.85, 0.1 + 0.15 * score).toFixed(2)})`;
    }
    function mountGumbel(host, raw) {
        const data = raw;
        Anim.addStyle("gumbel-style", GUMBEL_STYLE);
        const f = Anim.wmFrame(host);
        const table = Anim.div("wa-fade", f.body);
        const head = Anim.div("gb-head", table);
        Anim.div("", head, "token");
        Anim.div("wide", head, "p: the model");
        Anim.div("wide", head, "r: from the key");
        Anim.div("wide", head, "r^(1/p): largest wins");
        const rowBox = Anim.div("gb-rows", table);
        const d = data.detect;
        const detect = Anim.detectPanel(f.body, [
            ["tokens scored", `${d.scored}`],
            ["S = sum of −log(1 − r)", d.S.toFixed(1)],
            ["expected without the key", `${d.scored} ± ${Math.sqrt(d.scored).toFixed(1)}`],
            ["p-value", Anim.pValue(d.p)],
        ]);
        let shown = -1;
        let rows = [];
        const colours = [Anim.C.node, Anim.C.probe, Anim.C.accent];
        const buildRows = (t) => {
            Anim.clear(rowBox);
            rows = data.tokens[t].rows.map((r) => {
                const row = Anim.div(`wa-row${r.extra ? " extra" : ""}`, rowBox);
                Anim.div("wa-tok", row, r.tok);
                const bars = [], values = [];
                colours.forEach((colour, j) => {
                    bars.push(Anim.bar(row, colour));
                    values.push(Anim.div("wa-val", row));
                    if (j === 0 && r.extra) {
                        Anim.span(bars[0].track, `rank ${r.rank}`, "wa-rank");
                    }
                });
                return { row, bars, values };
            });
            void f.root.offsetHeight; // new bars start from zero width, so that they grow
        };
        const draw = (i) => {
            const s = data.steps[i];
            const level = PHASES.indexOf(s.phase);
            const detecting = s.phase === "detect";
            const t = s.t;
            const tk = data.tokens[t];
            const chosen = level >= 2;
            const now = data.prompt.length + t;
            const words = [
                ...data.prompt.map((text) => ({ text })),
                ...data.tokens.slice(0, chosen ? t + 1 : t).map((x) => ({ text: x.text, bg: shade(x) })),
            ];
            Anim.drawText(f.text, words, detecting ? null : [now - data.h, now], s.phase === "race" ? now : -1, !chosen);
            if (detecting) {
                Anim.drawNote(f.seed, "The detector recomputes r for every chosen token from the key and the text: no model needed.");
            }
            else {
                Anim.drawSeed(f.seed, "r = ", tk.ctx, ", v)", ` for every token v of the vocabulary (last ${data.h} tokens)`);
            }
            if (shown !== t) {
                buildRows(t);
                shown = t;
            }
            tk.rows.forEach((r, k) => {
                const v = rows[k];
                Anim.setWidth(v.bars[0].fill, r.p);
                v.values[0].textContent = Anim.prob(r.p);
                Anim.setWidth(v.bars[1].fill, level >= 1 ? r.r : 0);
                v.values[1].textContent = level >= 1 ? r.r.toFixed(3) : "";
                Anim.setWidth(v.bars[2].fill, chosen ? r.s : 0);
                v.values[2].textContent = chosen ? Anim.prob(r.s) : "";
                v.row.classList.toggle("pick", chosen && !detecting && k === tk.pick);
            });
            table.style.opacity = detecting ? "0.12" : "1";
            detect.classList.toggle("on", detecting);
            // the score of the detector so far, on the border of the text
            const done = data.tokens.slice(0, chosen ? t + 1 : t).filter((x) => !x.repeat);
            const S = done.reduce((sum, x) => sum - Math.log(1 - x.r), 0);
            Anim.drawTally(f.tally, detecting ? [["tokens scored", `${d.scored}`], ["S", d.S.toFixed(1)]]
                : done.length ? [["tokens scored", `${done.length}`], ["S", S.toFixed(1)], ["expected without the key", `${done.length}`]] : []);
        };
        return new Anim.Player(host, data.steps, draw);
    }
    Anim.views["gumbel"] = mountGumbel;
})(Anim || (Anim = {}));
// SynthID-Text (Dathathri et al., 2024): 2^m candidates are drawn from the model, and a knockout tournament
// of m rounds picks the output; in round l, the candidate with the larger g-value g_l wins (ties: a coin).
// The text is drawn in HTML, the bracket in SVG; winners slide from one round to the next.
var Anim;
(function (Anim) {
    const SYNTH_STYLE = `
.anim .sb-bracket svg { height: auto; }
.sb-box { transition: transform 0.6s ease, opacity 0.4s ease; }
.sb-bits, .sb-coin { transition: opacity 0.4s ease; }
.sb-line { fill: none; stroke: #586e75; stroke-width: 1.5; transition: stroke 0.4s, stroke-width 0.4s; }
.sb-line.won { stroke: ${Anim.C.accent}; stroke-width: 2.5; }
`;
    const W = 1000, BOX_W = 190, BOX_H = 23, PITCH = 28, TOP = 24;
    function bitX(j, m) {
        return BOX_W - 8 - (m - j) * 17 + 3;
    }
    function makeBox(parent, label, g, m) {
        const group = Anim.el("g", { class: "sb-box" }, parent);
        const rect = Anim.el("rect", { width: BOX_W, height: BOX_H, rx: 4, fill: "rgba(255, 255, 255, 0.06)", stroke: Anim.C.node, "stroke-width": 1 }, group);
        Anim.el("text", { x: 8, y: 16.5, fill: "#eee8d5", "font-size": 15, "font-family": "monospace" }, group, label.length > 13 ? label.slice(0, 12) + "…" : label);
        const bits = Anim.el("g", { class: "sb-bits" }, group);
        const squares = g.map((b, j) => Anim.el("rect", {
            x: bitX(j, m), y: 5.5, width: 12, height: 12, rx: 2, fill: b ? Anim.WM.green : "none", stroke: b ? Anim.WM.green : Anim.C.node,
        }, bits));
        return { g: group, rect, bits, squares };
    }
    function place(box, x, y, opacity) {
        box.g.style.transform = `translate(${x}px, ${y}px)`;
        box.g.style.opacity = String(opacity);
    }
    function winner(tk) {
        return tk.rounds[tk.rounds.length - 1][0];
    }
    function ones(tk) {
        return tk.g[winner(tk)].reduce((a, b) => a + b, 0);
    }
    function mountSynthid(host, raw) {
        const data = raw;
        const m = data.m;
        Anim.addStyle("synthid-style", SYNTH_STYLE);
        const f = Anim.wmFrame(host);
        const wrap = Anim.div("sb-bracket wa-fade", f.body);
        const svg = Anim.el("svg", { viewBox: `0 0 ${W} ${TOP + 2 ** m * PITCH}`, role: "img", "aria-label": "Tournament sampling" });
        wrap.appendChild(svg);
        const colX = (c) => (c * (W - BOX_W)) / m;
        const slotY = (c, k) => TOP + (k * 2 ** c + (2 ** c - 1) / 2) * PITCH;
        for (let c = 0; c <= m; c++) {
            const label = c === 0 ? "drawn from p" : `round ${c}: g${c}` + (c === m ? " → output" : "");
            Anim.el("text", { x: colX(c), y: 15, fill: "#93a1a1", "font-size": 15 }, svg, label);
        }
        for (let j = 0; j < m; j++) {
            Anim.el("text", { x: bitX(j, m) + 6, y: 15, fill: "#93a1a1", "font-size": 12, "text-anchor": "middle" }, svg, `g${j + 1}`);
        }
        const lineLayer = Anim.el("g", {}, svg);
        const boxLayer = Anim.el("g", {}, svg);
        const coinLayer = Anim.el("g", {}, svg);
        const d = data.detect;
        const n = m * d.scored;
        const detect = Anim.detectPanel(f.body, [
            ["g-values of the chosen tokens", `${d.ones} ones of ${n}`],
            ["ones per round", `${d.per_round.join(" / ")} (of ${d.scored})`],
            ["expected without the key", `${n / 2} ± ${(Math.sqrt(n) / 2).toFixed(1)}`],
            ["z-score", d.z.toFixed(2)],
            ["p-value", Anim.pValue(d.p)],
        ]);
        let shown = -1;
        let who = []; // who[c][k]: the candidate in slot k of column c (column 0: the candidates)
        let boxes = [];
        let lines = [];
        let coins = [];
        // The slot of column c - 1 that the winner of slot k of column c comes from
        const source = (c, k) => (who[c - 1][2 * k] === who[c][k] ? 2 * k : 2 * k + 1);
        const build = (t) => {
            const tk = data.tokens[t];
            [lineLayer, boxLayer, coinLayer].forEach(Anim.clear);
            who = [tk.cands.map((_, i) => i), ...tk.rounds];
            lines = [];
            coins = [];
            for (let c = 1; c <= m; c++) {
                who[c].forEach((_, k) => {
                    const xm = (colX(c - 1) + BOX_W + colX(c)) / 2;
                    const yt = slotY(c, k) + BOX_H / 2;
                    for (const j of [2 * k, 2 * k + 1]) {
                        const path = Anim.el("path", {
                            class: "sb-line", d: `M ${colX(c - 1) + BOX_W} ${slotY(c - 1, j) + BOX_H / 2} H ${xm} V ${yt} H ${colX(c)}`,
                        }, lineLayer);
                        lines.push({ path, c, k, j });
                    }
                    if (tk.ties[c - 1][k]) {
                        const text = Anim.el("text", { class: "sb-coin", x: xm + 5, y: yt - 5, fill: Anim.C.probe, "font-size": 12 }, coinLayer, "coin");
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
        const draw = (i) => {
            const s = data.steps[i];
            const t = s.t;
            const tk = data.tokens[t];
            const stage = s.stage;
            const chosen = stage >= m + 1;
            const now = data.prompt.length + t;
            const shade = (x) => x.repeat ? "rgba(147, 161, 161, 0.25)"
                : `rgba(102, 187, 106, ${(0.1 + (0.75 * ones(x)) / m).toFixed(2)})`;
            const words = [
                ...data.prompt.map((text) => ({ text })),
                ...data.tokens.slice(0, chosen ? t + 1 : t).map((x) => ({ text: x.text, bg: shade(x) })),
            ];
            Anim.drawText(f.text, words, s.detect ? null : [now - data.h, now], chosen && !s.detect ? now : -1, !chosen);
            if (s.detect) {
                Anim.drawNote(f.seed, "The detector recomputes the g-values of every chosen token from the key and the text: no model needed.");
            }
            else {
                Anim.drawSeed(f.seed, "g-values = ", tk.ctx, ", v)", `: ${m} bits for every token v (last ${data.h} tokens)`);
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
                }
                else {
                    place(b, colX(c - 1), slotY(c - 1, source(c, k)), 0);
                }
                b.bits.style.opacity = stage >= 1 ? "1" : "0";
                b.squares.forEach((q, j) => {
                    const current = stage === c + 2 && j === c; // the bit that decides the round being played
                    const bit = tk.g[who[c][k]][j];
                    q.setAttribute("stroke", current ? "#fdf6e3" : bit ? Anim.WM.green : Anim.C.node);
                    q.setAttribute("stroke-width", current ? "2.5" : "1.2");
                });
                const final = c === m && chosen && !s.detect;
                b.rect.setAttribute("stroke", final ? "#fdf6e3" : Anim.C.node);
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
            Anim.drawTally(f.tally, s.detect ? [["g-values equal to 1", `${d.ones} / ${n}`], ["z-score", d.z.toFixed(2)]]
                : total ? [["g-values equal to 1", `${k} / ${total}`], ["z-score", ((k - total / 2) / (Math.sqrt(total) / 2)).toFixed(1)]] : []);
        };
        return new Anim.Player(host, data.steps, draw);
    }
    Anim.views["synthid"] = mountSynthid;
})(Anim || (Anim = {}));
// The residual stream of the Sudoku transformer (Kniazev & Fijalkow, 2026), followed at the
// [clues_end] position through every component. The forward pass is cached by
// src/sudoku/make_residual_trace.py; this view only draws it.
var Anim;
(function (Anim) {
    const BASE = [10, 52, 64];
    const POS = [255, 183, 77];
    const NEG = [79, 195, 247];
    const HOT = [255, 213, 79];
    function mix(target, t) {
        const u = Math.pow(Math.min(1, Math.max(0, t)), 0.7); // keep small values visible
        return [0, 1, 2].map((k) => Math.round(BASE[k] + (target[k] - BASE[k]) * u));
    }
    const diverging = (v) => (v >= 0 ? mix(POS, v / 99) : mix(NEG, -v / 99));
    const rgb = (c) => `rgb(${c[0]},${c[1]},${c[2]})`;
    // Heatmaps are drawn on a canvas (one pixel block per value) and placed in the SVG as an image
    const images = new Map();
    function heatImage(key, values, cols, colour, at = (k) => k) {
        const cached = images.get(key);
        if (cached) {
            return cached;
        }
        const rows = Math.ceil(values.length / cols), s = 6;
        const canvas = document.createElement("canvas");
        canvas.width = cols * s;
        canvas.height = rows * s;
        const ctx = canvas.getContext("2d");
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
    const placementPixel = (t) => {
        const cell = Math.floor(t / 9), d = t % 9;
        return (3 * Math.floor(cell / 9) + Math.floor(d / 3)) * 27 + 3 * (cell % 9) + (d % 3);
    };
    const cellName = (c) => `R${Math.floor(c / 9) + 1}C${(c % 9) + 1}`;
    const placementName = (t) => `${cellName(Math.floor(t / 9))}=${(t % 9) + 1}`;
    const pct = (p) => `${Math.round(100 * p)}%`;
    function focusShort(f) {
        const k = f[2];
        const tag = { row: `R${k + 1}`, col: `C${k + 1}`, box: `B${k + 1}`, band: `R${3 * k + 1}–${3 * k + 3}`, stack: `C${3 * k + 1}–${3 * k + 3}` }[f[1]];
        return `${tag} · ${pct(f[3])}`;
    }
    // Cells of a focus group, as a rectangle in grid coordinates (col, row, width, height)
    function focusRect(f) {
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
    function mountResidual(host, raw) {
        const data = raw;
        const uid = `res-${instances++}`;
        const S = data.stations;
        const nStations = S.length; // embedding + 2 per layer
        const last = nStations; // index of the unembedding station
        const svg = Anim.el("svg", { viewBox: "0 0 1050 500", role: "img", "aria-label": "Residual stream of the Sudoku transformer" });
        host.appendChild(svg);
        const defs = Anim.el("defs", {}, svg);
        const marker = Anim.el("marker", { id: `${uid}-arrow`, viewBox: "0 0 10 10", refX: 8, refY: 5, markerWidth: 6, markerHeight: 6, orient: "auto" }, defs);
        Anim.el("path", { d: "M 0 0 L 10 5 L 0 10 z", fill: Anim.C.node }, marker);
        const root = Anim.el("g", {}, svg);
        let player;
        const text = (parent, x, y, s, attrs = {}) => Anim.el("text", { x, y, fill: Anim.C.text, "font-size": 13, ...attrs }, parent, s);
        const image = (parent, href, x, y, w, h) => {
            Anim.el("image", { href, x, y, width: w, height: h, preserveAspectRatio: "none", style: "image-rendering: pixelated" }, parent);
            Anim.el("rect", { x, y, width: w, height: h, fill: "none", stroke: "#586e75", "stroke-width": 0.8 }, parent);
        };
        const stream = (key, values) => heatImage(key, values, 24, diverging);
        // ------------------------------------------------------------------ the pipeline (top band)
        const X0 = 40, DX = 55, BW = 46, LINE = 80;
        const stationX = (k) => X0 + k * DX;
        const stationLabel = (k) => (k === 0 ? "Emb" : k === last ? "Unemb" : k % 2 === 1 ? "Attn" : "MLP");
        function drawPipeline(parent, current) {
            Anim.el("line", { x1: 12, y1: LINE, x2: 1038, y2: LINE, stroke: Anim.C.node, "stroke-width": 2, "marker-end": `url(#${uid}-arrow)` }, parent);
            for (let l = 0; l < data.config.layers; l++) {
                const x = stationX(2 * l + 1) - BW / 2 - 3;
                Anim.el("rect", { x, y: 21, width: DX + BW + 6, height: 42, rx: 6, fill: "none", stroke: "#2c5a66", "stroke-width": 1 }, parent);
                text(parent, x + (DX + BW + 6) / 2, 15, `L${l + 1}`, { "text-anchor": "middle", "font-size": 13, fill: "#93a1a1" });
            }
            for (let k = 0; k <= last; k++) {
                const x = stationX(k), done = k < current, active = k === current;
                const g = Anim.el("g", { style: "cursor: pointer" }, parent);
                g.addEventListener("click", (event) => {
                    event.stopPropagation();
                    player === null || player === void 0 ? void 0 : player.goto(k + 1);
                });
                Anim.el("rect", {
                    x: x - BW / 2, y: 29, width: BW, height: 28, rx: 4,
                    fill: active ? Anim.C.accent : done ? "rgba(79,195,247,0.22)" : "rgba(0,0,0,0)",
                    stroke: active || done ? Anim.C.accent : "#586e75", "stroke-width": 1.2,
                }, g);
                text(g, x, 47.5, stationLabel(k), { "text-anchor": "middle", "font-size": k === last ? 10.5 : 12, fill: active ? "#002b36" : Anim.C.text, "font-weight": active ? "bold" : "normal" });
                if (k > 0 && k < last) { // read (through a LayerNorm) on the left, add on the right
                    Anim.el("line", { x1: x - 9, y1: LINE, x2: x - 9, y2: 57, stroke: "#586e75", "stroke-width": 1 }, parent);
                    Anim.el("line", { x1: x + 9, y1: 57, x2: x + 9, y2: LINE - 5, stroke: done || active ? Anim.C.accent : "#586e75", "stroke-width": 1.2 }, parent);
                    Anim.el("circle", { cx: x + 9, cy: LINE, r: 5, fill: "#002b36", stroke: done || active ? Anim.C.accent : "#586e75", "stroke-width": 1.2 }, parent);
                    text(parent, x + 9, LINE + 3.6, "+", { "text-anchor": "middle", "font-size": 10, fill: done || active ? Anim.C.accent : "#93a1a1" });
                }
                else {
                    Anim.el("line", { x1: x, y1: 57, x2: x, y2: LINE, stroke: done || active ? Anim.C.accent : "#586e75", "stroke-width": 1.2 }, parent);
                }
                // the stream after this component
                const tx = x - 21, ty = 91;
                if (k <= current) {
                    const href = k === last ? heatImage("logits", data.logits, 27, logitColour, placementPixel) : stream(`x${k}`, S[k].x);
                    image(g, href, tx, ty, 42, 42);
                }
                else {
                    Anim.el("rect", { x: tx, y: ty, width: 42, height: 42, fill: "none", stroke: "#2c5a66", "stroke-dasharray": "3 3" }, g);
                }
                if (active) {
                    Anim.el("rect", { x: tx - 3, y: ty - 3, width: 48, height: 48, fill: "none", stroke: Anim.C.accent, "stroke-width": 2 }, parent);
                }
            }
        }
        const maxLogit = Math.max(...data.logits);
        const sorted = [...data.logits].sort((a, b) => a - b);
        const medLogit = sorted[Math.floor(sorted.length / 2)];
        function logitColour(v) {
            return mix(HOT, (v - medLogit) / (maxLogit - medLogit));
        }
        // ------------------------------------------------------------------ panel A: inside the component
        const AX = 18;
        function drawGrid(parent, x, y, cell) {
            for (let k = 0; k <= 9; k++) {
                const w = k % 3 === 0 ? 1.6 : 0.5, colour = k % 3 === 0 ? "#93a1a1" : "#41656e";
                Anim.el("line", { x1: x, y1: y + k * cell, x2: x + 9 * cell, y2: y + k * cell, stroke: colour, "stroke-width": w }, parent);
                Anim.el("line", { x1: x + k * cell, y1: y, x2: x + k * cell, y2: y + 9 * cell, stroke: colour, "stroke-width": w }, parent);
            }
        }
        function drawClues(parent, x, y, cell, size, colour = "#93a1a1") {
            [...data.grid].forEach((ch, c) => {
                if (ch !== "0") {
                    text(parent, x + (c % 9 + 0.5) * cell, y + (Math.floor(c / 9) + 0.5) * cell + size * 0.36, ch, { "text-anchor": "middle", "font-size": size, fill: colour, "font-weight": "bold" });
                }
            });
        }
        function panelTitle(parent, x, title, sub) {
            text(parent, x, 156, title, { "font-size": 16, fill: Anim.C.accent, "font-weight": "bold" });
            text(parent, x, 174, sub, { "font-size": 11.5, fill: "#93a1a1" });
        }
        function drawInput(parent) {
            panelTitle(parent, AX, "Input: the clues", `${data.tokens.length - 1} placement tokens, shuffled, then [clues_end]`);
            const cell = 28, gx = AX + 22, gy = 190;
            drawGrid(parent, gx, gy, cell);
            drawClues(parent, gx, gy, cell, 17, Anim.C.text);
            data.tokens.slice(0, -1).forEach((t, i) => {
                const c = Math.floor(t / 9);
                text(parent, gx + (c % 9) * cell + 2.5, gy + Math.floor(c / 9) * cell + 9, String(i + 1), { "font-size": 7.5, fill: Anim.C.probe });
            });
            text(parent, AX, 466, data.tokens.slice(0, 4).map(placementName).join("  ") + "  …  [clues_end]", { "font-size": 12, "font-family": "monospace", fill: Anim.C.text });
            text(parent, AX, 484, "small numbers: position of the token in the sequence", { "font-size": 11, fill: "#93a1a1" });
        }
        function drawEmbedding(parent, s) {
            panelTitle(parent, AX, "Embedding", "token embedding + position embedding");
            image(parent, stream("tok", s.tok), AX + 10, 200, 120, 120);
            text(parent, AX + 150, 266, "+", { "font-size": 26, "text-anchor": "middle" });
            image(parent, stream("pos", s.pos), AX + 170, 200, 120, 120);
            text(parent, AX + 70, 340, "token [clues_end]", { "text-anchor": "middle", "font-size": 12 });
            text(parent, AX + 230, 340, `position ${data.tokens.length}`, { "text-anchor": "middle", "font-size": 12 });
            text(parent, AX, 388, "At this position the stream only knows", { "font-size": 12.5 });
            text(parent, AX, 406, "which token it is and where it is.", { "font-size": 12.5 });
            text(parent, AX, 430, "The clues are elsewhere in the sequence:", { "font-size": 12.5 });
            text(parent, AX, 448, "only attention can bring them here.", { "font-size": 12.5 });
        }
        function drawHeads(parent, s, layer) {
            panelTitle(parent, AX, `L${layer + 1} attention`, `LayerNorm → ${data.config.heads} heads (softmax(QKᵀ) V) → W_O → add`);
            const cell = 7.8, W = 9 * cell;
            s.heads.forEach((h, k) => {
                const x = AX + 4 + (k % 4) * 84, y = 190 + Math.floor(k / 4) * 126;
                const top = Math.max(...h.cells.map((p) => p[1]), 1e-6);
                Anim.el("rect", { x, y, width: W, height: W, fill: rgb(BASE) }, parent);
                h.cells.forEach(([c, w]) => {
                    Anim.el("rect", { x: x + (c % 9) * cell, y: y + Math.floor(c / 9) * cell, width: cell, height: cell, fill: rgb(mix(HOT, w / top)) }, parent);
                });
                for (const k3 of [0, 3, 6, 9]) {
                    Anim.el("line", { x1: x, y1: y + k3 * cell, x2: x + W, y2: y + k3 * cell, stroke: "#586e75", "stroke-width": 0.7 }, parent);
                    Anim.el("line", { x1: x + k3 * cell, y1: y, x2: x + k3 * cell, y2: y + W, stroke: "#586e75", "stroke-width": 0.7 }, parent);
                }
                if (h.focus) {
                    const [fx, fy, fw, fh] = focusRect(h.focus);
                    Anim.el("rect", { x: x + fx * cell, y: y + fy * cell, width: fw * cell, height: fh * cell, fill: "none", stroke: Anim.C.accent, "stroke-width": 2 }, parent);
                }
                text(parent, x, y + W + 15, `H${k + 1}`, { "font-size": 12.5, "font-weight": "bold" });
                text(parent, x + 20, y + W + 15, h.focus ? focusShort(h.focus) : "", { "font-size": 11, fill: Anim.C.accent });
                text(parent, x, y + W + 30, `self ${pct(h.self)}`, { "font-size": 10.5, fill: "#93a1a1" });
            });
            text(parent, AX, 452, "brighter = more attention from [clues_end] to that clue", { "font-size": 11, fill: "#93a1a1" });
        }
        function drawNeurons(parent, s, layer) {
            const d = data.config.d_mlp;
            panelTitle(parent, AX, `L${layer + 1} MLP`, `LayerNorm → W_in (${data.config.d_model}→${d}) → GELU → W_out → add`);
            const cols = 72, cell = 4.4, x0 = AX + 4, y0 = 188;
            image(parent, heatImage(`n${layer}`, s.neurons, cols, (v) => mix(HOT, v / 30)), x0, y0, cols * cell, (d / cols) * cell);
            text(parent, x0, y0 + (d / cols) * cell + 14, `${d} neurons · brighter = larger activation`, { "font-size": 11, fill: "#93a1a1" });
            let y = y0 + (d / cols) * cell + 34;
            for (const n of s.top_neurons.filter((m) => m.role).slice(0, 4)) {
                const r = n.role;
                Anim.el("circle", { cx: x0 + ((n.index % cols) + 0.5) * cell, cy: y0 + (Math.floor(n.index / cols) + 0.5) * cell, r: 6, fill: "none", stroke: Anim.C.accent, "stroke-width": 1.5 }, parent);
                const what = r.kind === "cell" ? `all 9 digits of ${cellName(r.cell)}` : `all 81 placements of box ${r.box + 1}`;
                text(parent, x0, y, `n${n.index} (${n.act.toFixed(1)}) → +${r.boost.toFixed(1)} on ${what}`, { "font-size": 12 });
                y += 17;
            }
        }
        function drawUnembed(parent) {
            panelTitle(parent, AX, "Unembedding", `LayerNorm → W_U (${data.config.d_model}→734 tokens)`);
            const cell = 9, x0 = AX + 22, y0 = 188;
            image(parent, heatImage("logits", data.logits, 27, logitColour, placementPixel), x0, y0, 27 * cell, 27 * cell);
            for (const k of [0, 9, 18, 27]) {
                Anim.el("line", { x1: x0, y1: y0 + k * cell, x2: x0 + 27 * cell, y2: y0 + k * cell, stroke: "#93a1a1", "stroke-width": 1.2 }, parent);
                Anim.el("line", { x1: x0 + k * cell, y1: y0, x2: x0 + k * cell, y2: y0 + 27 * cell, stroke: "#93a1a1", "stroke-width": 1.2 }, parent);
            }
            text(parent, AX, 456, "729 placement logits, one 3×3 block per cell", { "font-size": 11.5, fill: "#93a1a1" });
            text(parent, AX, 474, "(digits 1–9 in reading order) · brighter = larger", { "font-size": 11.5, fill: "#93a1a1" });
        }
        // ------------------------------------------------------------------ panel B: the stream itself
        const BX = 375;
        function drawStream(parent, k) {
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
                text(parent, BX + 152, 418, "→ LayerNorm → W_U → softmax", { "text-anchor": "middle", "font-size": 12.5, fill: Anim.C.accent });
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
        function drawReadout(parent, k) {
            panelTitle(parent, CX0, "Reading the stream", `pencil marks from linear probes (${data.n_probe_train.toLocaleString("en")} other grids)`);
            const cell = 27, gx = CX0 + 10, gy = 188;
            const s = k < 0 ? undefined : S[Math.min(k, nStations - 1)];
            if (s) { // where the logit lens would play
                s.lens_cells.forEach((p, c) => {
                    if (p > 0.01) {
                        Anim.el("rect", { x: gx + (c % 9) * cell, y: gy + Math.floor(c / 9) * cell, width: cell, height: cell, fill: Anim.C.accent, "fill-opacity": Math.min(0.75, 0.15 + 1.2 * p) }, parent);
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
                            "font-size": 8.5, "text-anchor": "middle", fill: truth ? "#eee8d5" : Anim.C.miss, "fill-opacity": truth ? 0.12 + 0.88 * p : p,
                            "font-weight": "bold",
                        });
                    });
                });
                const nEmpty = data.true_cand.length - [...data.grid].filter((ch) => ch !== "0").length;
                text(parent, CX0, 450, `probes right on ${s.sub_ok}/243 substructure facts`, { "font-size": 12 });
                text(parent, CX0, 465, `and ${s.cand_ok}/${9 * nEmpty} candidate facts`, { "font-size": 12 });
                const moves = (k === last ? data.final_top.slice(0, 4) : s.lens_top.slice(0, 3)).map(([t, p]) => `${placementName(t)} ${pct(p)}`);
                text(parent, CX0, 482, k === last ? "model output (shaded cells):" : "logit lens (shaded cells):", { "font-size": 12, fill: Anim.C.accent });
                for (let j = 0; j < moves.length; j += 4) { // at most four moves per line
                    text(parent, CX0, 497 + (j / 4) * 15, moves.slice(j, j + 4).join(" · "), { "font-size": 11.5, "font-family": "monospace" });
                }
            }
            else {
                text(parent, CX0, 460, "nothing computed yet", { "font-size": 12, fill: "#93a1a1" });
            }
        }
        // ------------------------------------------------------------------ one step
        const draw = (i) => {
            Anim.clear(root);
            const k = i - 1; // station index: -1 for the input, `last` for the unembedding
            drawPipeline(root, k);
            Anim.el("line", { x1: 360, y1: 145, x2: 360, y2: 496, stroke: "#2c5a66" }, root);
            Anim.el("line", { x1: 690, y1: 145, x2: 690, y2: 496, stroke: "#2c5a66" }, root);
            if (k < 0) {
                drawInput(root);
            }
            else if (k === 0) {
                drawEmbedding(root, S[0]);
            }
            else if (k === last) {
                drawUnembed(root);
            }
            else if (k % 2 === 1) {
                drawHeads(root, S[k], (k - 1) / 2);
            }
            else {
                drawNeurons(root, S[k], (k - 2) / 2);
            }
            drawStream(root, k);
            drawReadout(root, k);
        };
        player = new Anim.Player(host, data.steps, draw); // the panels already name the current component
        return player;
    }
    Anim.views["residual"] = mountResidual;
})(Anim || (Anim = {}));
// Mount every animation of the page. Optional attributes of a host: data-frame (one static step),
// data-height (height of the drawing) and data-viewbox (to crop the drawing). Without data-height,
// a drawing takes the full width of the slide, and its height follows from its viewBox.
var Anim;
(function (Anim) {
    const STYLE = `
.anim { width: 100%; margin: 0 auto; }
.anim svg { display: block; width: 100%; height: auto; }
.anim-bar { display: flex; gap: 0.5em; align-items: center; justify-content: center; font-size: 0.45em; margin-top: 0.3em; }
.anim-bar button { font: inherit; color: #002b36; background: ${Anim.C.accent}; border: none; border-radius: 4px; padding: 0.15em 0.9em; cursor: pointer; }
.anim-bar button:disabled { opacity: 0.35; cursor: default; }
.anim-counter { flex: none; margin-left: 1em; color: #93a1a1; text-align: left; white-space: nowrap; font-variant-numeric: tabular-nums; }
.anim-caption { display: grid; font-size: 0.5em; line-height: 1.35; text-align: center; min-height: 2.8em; margin-top: 0.3em; color: #eee8d5; }
.anim-caption > div { grid-area: 1 / 1; visibility: hidden; }
.anim-caption > div.on { visibility: visible; }
`;
    function mountAll() {
        document.querySelectorAll(".anim[data-kind]").forEach((host) => {
            var _a, _b;
            const kind = (_a = host.dataset.kind) !== null && _a !== void 0 ? _a : "";
            const json = host.querySelector('script[type="application/json"]');
            if (host.dataset.mounted || !json || !(kind in Anim.views)) {
                return;
            }
            host.dataset.mounted = "true";
            Anim.views[kind](host, JSON.parse((_b = json.textContent) !== null && _b !== void 0 ? _b : "{}"));
            const svg = host.querySelector("svg");
            if (svg && host.dataset.viewbox) {
                svg.setAttribute("viewBox", host.dataset.viewbox);
                svg.style.width = "auto"; // follow the aspect ratio of the crop, so that nothing outside it shows
                svg.style.maxWidth = "100%";
                svg.style.margin = "0 auto";
            }
            if (svg && host.dataset.height) {
                svg.style.height = host.dataset.height;
            }
        });
    }
    const style = document.createElement("style");
    style.textContent = STYLE;
    document.head.appendChild(style);
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", mountAll);
    }
    else {
        mountAll();
    }
})(Anim || (Anim = {}));
