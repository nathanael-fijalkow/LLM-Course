// Shared pieces: SVG helpers, colours, and a step player with Previous / Next / Reset.
// Each animation receives a list of steps computed in Python, and only draws them.

namespace Anim {
  export const SVG_NS = "http://www.w3.org/2000/svg";

  // Solarized accents on the "moon" theme, plus the accent colour of src/custom.css
  export const C = {
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
  export const PALETTE = ["#4fc3f7", "#ffb74d", "#81c784", "#e57373", "#ba68c8", "#fff176", "#4db6ac", "#f06292"];

  export interface Step {
    text: string;
    delay?: number; // unused since the player has no Play button
  }

  type Attrs = Record<string, string | number>;

  export function el<K extends keyof SVGElementTagNameMap>(
    tag: K, attrs: Attrs = {}, parent?: Element, text?: string,
  ): SVGElementTagNameMap[K] {
    const node = document.createElementNS(SVG_NS, tag);
    for (const [key, value] of Object.entries(attrs)) {
      node.setAttribute(key, String(value));
    }
    if (text !== undefined) {
      node.textContent = text;
    }
    parent?.appendChild(node);
    return node;
  }

  export function clear(node: Element): void {
    while (node.firstChild) {
      node.removeChild(node.firstChild);
    }
  }

  // A five-pointed star centred at (x, y), used for queries
  export function star(x: number, y: number, r: number): string {
    const corners: string[] = [];
    for (let i = 0; i < 10; i++) {
      const radius = i % 2 === 0 ? r : r * 0.45;
      const angle = -Math.PI / 2 + (i * Math.PI) / 5;
      corners.push(`${(x + radius * Math.cos(angle)).toFixed(1)},${(y + radius * Math.sin(angle)).toFixed(1)}`);
    }
    return corners.join(" ");
  }

  export class Player {
    readonly root: HTMLElement;
    private index = 0;
    private readonly caption: HTMLDivElement;
    private readonly lines: HTMLDivElement[]; // one caption per step
    private counter?: HTMLSpanElement;
    private previousButton?: HTMLButtonElement;
    private nextButton?: HTMLButtonElement;

    // The presenter moves through the steps with Previous / Next / Reset. A host with a data-frame
    // attribute shows that single step, without controls (a static figure).
    // The bar only holds the buttons and "Step X / Y", in a box of fixed width, so that it never moves;
    // whatever else a view wants to report at each step goes in its drawing.
    constructor(
      host: HTMLElement,
      private readonly steps: Step[],
      private readonly draw: (step: number) => void,
    ) {
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

    previous(): void {
      if (this.index > 0) {
        this.show(this.index - 1);
      }
    }

    next(): void {
      if (this.index < this.steps.length - 1) {
        this.show(this.index + 1);
      }
    }

    reset(): void {
      this.show(0);
    }

    // Jump to a step (a view can call it when the presenter clicks on its drawing)
    goto(i: number): void {
      this.show(Math.max(0, Math.min(this.steps.length - 1, i)));
    }

    private show(i: number): void {
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

    private button(bar: HTMLElement, label: string, action: () => void): HTMLButtonElement {
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

  // Each animation kind registers a function that mounts it in a host element
  export const views: Record<string, (host: HTMLElement, data: unknown) => Player> = {};
}
