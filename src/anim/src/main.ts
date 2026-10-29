// Mount every animation of the page. Optional attributes of a host: data-frame (one static step),
// data-height (height of the drawing) and data-viewbox (to crop the drawing). Without data-height,
// a drawing takes the full width of the slide, and its height follows from its viewBox.

namespace Anim {
  const STYLE = `
.anim { width: 100%; margin: 0 auto; }
.anim svg { display: block; width: 100%; height: auto; }
.anim-bar { display: flex; gap: 0.5em; align-items: center; justify-content: center; font-size: 0.45em; margin-top: 0.3em; }
.anim-bar button { font: inherit; color: #002b36; background: ${C.accent}; border: none; border-radius: 4px; padding: 0.15em 0.9em; cursor: pointer; }
.anim-bar button:disabled { opacity: 0.35; cursor: default; }
.anim-counter { flex: none; margin-left: 1em; color: #93a1a1; text-align: left; white-space: nowrap; font-variant-numeric: tabular-nums; }
.anim-caption { display: grid; font-size: 0.5em; line-height: 1.35; text-align: center; min-height: 2.8em; margin-top: 0.3em; color: #eee8d5; }
.anim-caption > div { grid-area: 1 / 1; visibility: hidden; }
.anim-caption > div.on { visibility: visible; }
`;

  function mountAll(): void {
    document.querySelectorAll<HTMLElement>(".anim[data-kind]").forEach((host) => {
      const kind = host.dataset.kind ?? "";
      const json = host.querySelector('script[type="application/json"]');
      if (host.dataset.mounted || !json || !(kind in views)) {
        return;
      }
      host.dataset.mounted = "true";
      views[kind](host, JSON.parse(json.textContent ?? "{}"));
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
  } else {
    mountAll();
  }
}
