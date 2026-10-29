// Shared pieces of the watermarking animations (deck 10): the text being generated, the line that shows
// what the key is hashed with, bars, and the detection panel. Drawn in HTML rather than SVG, so that the
// text wraps and the bars move with CSS transitions.

namespace Anim {
  export const WM = { green: "#66bb6a", red: "#ef5350" };

  const WM_STYLE = `
.wa { position: relative; padding-top: 0.6em; font-size: 0.5em; text-align: left; color: #eee8d5; }
.wa-tally { position: absolute; top: 0.6em; right: 1.2em; transform: translateY(-50%); padding: 0 0.5em; background: #002b36;
  color: #93a1a1; font-size: 0.85em; line-height: 1.3; white-space: nowrap; font-variant-numeric: tabular-nums; }
.wa-tally:empty { display: none; }
.wa-tally b { color: #eee8d5; font-weight: normal; }
.wa-text { font-family: monospace; font-size: 0.95em; line-height: 1.9; white-space: pre-wrap; min-height: 5.7em;
  padding: 0.15em 0.6em; border: 1px solid rgba(255, 255, 255, 0.12); border-radius: 6px; background: rgba(0, 0, 0, 0.15); }
.wa-text .tk { border-radius: 3px; }
.wa-text .ctx { outline: 2px solid ${C.accent}; outline-offset: 1px; border-radius: 3px; }
.wa-text .new { animation: wa-pop 0.7s ease-out; }
.wa-slot { color: ${C.accent}; border: 1.5px dashed ${C.accent}; border-radius: 3px; padding: 0 0.3em; margin-left: 0.4em; }
@keyframes wa-pop { from { box-shadow: 0 0 0 5px rgba(255, 255, 255, 0.8); } to { box-shadow: 0 0 0 0 rgba(255, 255, 255, 0); } }
.wa-seed { text-align: center; color: #93a1a1; font-size: 0.9em; margin: 0.45em 0 0.35em; min-height: 1.4em; }
.wa-seed .key { font-family: monospace; color: ${C.accent}; }
.wa-seed .ctx-ref { font-family: monospace; color: #eee8d5; white-space: pre; outline: 2px solid ${C.accent};
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
  padding: 0.6em 1.4em; border: 1px solid ${C.accent}; border-radius: 8px; background: rgba(0, 43, 54, 0.9); }
.wa-detect-grid .label { color: #93a1a1; }
.wa-detect-grid .value { font-family: monospace; }
`;

  export function addStyle(id: string, css: string): void {
    if (!document.getElementById(id)) {
      const style = document.createElement("style");
      style.id = id;
      style.textContent = css;
      document.head.appendChild(style);
    }
  }

  export function div(cls: string, parent: HTMLElement, text?: string): HTMLDivElement {
    const node = document.createElement("div");
    node.className = cls;
    if (text !== undefined) {
      node.textContent = text;
    }
    parent.appendChild(node);
    return node;
  }

  export function span(parent: HTMLElement, text: string, cls = ""): HTMLSpanElement {
    const node = document.createElement("span");
    node.className = cls;
    node.textContent = text;
    parent.appendChild(node);
    return node;
  }

  export function prob(p: number): string {
    return p >= 0.0005 ? p.toFixed(3) : "<0.001";
  }

  export function pValue(p: number): string {
    return p >= 0.001 ? p.toPrecision(2) : p.toExponential(1);
  }

  // The context window as shown in the line of the hash
  export function tidy(context: string): string {
    return context.replace(/\n/g, "↵").trim();
  }

  export interface WmFrame {
    root: HTMLDivElement;
    text: HTMLDivElement;
    tally: HTMLDivElement; // the running count of the detector, on the top border of the text
    seed: HTMLDivElement;
    body: HTMLDivElement; // the part of the view that the detection panel covers
  }

  export function wmFrame(host: HTMLElement): WmFrame {
    addStyle("wa-style", WM_STYLE);
    const root = div("wa", host);
    const text = div("wa-text", root);
    const tally = div("wa-tally", root);
    return { root, text, tally, seed: div("wa-seed", root), body: div("wa-body", root) };
  }

  // The tally as label / value pairs, for instance [["green tokens", "5 / 8"], ["z", "1.9"]]
  export function drawTally(box: HTMLElement, items: [string, string][]): void {
    clear(box);
    items.forEach(([label, value], k) => {
      span(box, (k ? ", " : "") + label + ": ");
      box.appendChild(document.createElement("b")).textContent = value;
    });
  }

  export interface Word {
    text: string;
    bg?: string; // background of a generated token
  }

  // The text so far: the tokens of the context window [from, to) are outlined, the token at index `fresh`
  // flashes, and a slot stands for the next token when `slot` is true
  export function drawText(box: HTMLElement, words: Word[], ctx: [number, number] | null, fresh: number, slot: boolean): void {
    clear(box);
    let target: HTMLElement = box;
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

  // For instance: green list = hash(key, [small])
  export function drawSeed(box: HTMLElement, pre: string, ctx: string, close: string, post: string): void {
    clear(box);
    span(box, pre);
    span(box, "hash(key, ", "key");
    span(box, tidy(ctx), "ctx-ref");
    span(box, close, "key");
    span(box, post);
  }

  export function drawNote(box: HTMLElement, text: string): void {
    clear(box);
    span(box, text);
  }

  export function detectPanel(parent: HTMLElement, rows: [string, string][]): HTMLDivElement {
    const panel = div("wa-detect", parent);
    const grid = div("wa-detect-grid", panel);
    for (const [label, value] of rows) {
      div("label", grid, label);
      div("value", grid, value);
    }
    return panel;
  }

  export interface Bar {
    track: HTMLDivElement;
    ghost: HTMLDivElement; // dashed outline: a former value
    fill: HTMLDivElement;
  }

  export function bar(parent: HTMLElement, colour?: string): Bar {
    const track = div("wa-track", parent);
    if (colour) {
      track.style.setProperty("--c", colour);
    }
    return { track, ghost: div("wa-ghost", track), fill: div("wa-fill", track) };
  }

  export function setWidth(node: HTMLElement, fraction: number): void {
    node.style.width = `${100 * Math.max(0, Math.min(1, fraction))}%`;
  }
}
