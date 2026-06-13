/**
 * Script injected into the preview <iframe>. Runs in the sandboxed document and
 * talks to the editor (parent) over postMessage.
 *
 * Responsibilities:
 *  - hover highlight + click-to-select element picking
 *  - stamp stable data-mc-id / data-mc-slide attributes
 *  - detect "slides" (top-level scenes) for per-slide editing
 *  - live-apply preview CSS sent by the parent
 *  - serialize a clean copy of the document for export
 *
 * Everything below the marker runs as plain JS inside the iframe.
 */

export const MC_RUNTIME_SCRIPT_ID = "mc-editor-runtime";
export const MC_EDITOR_STYLE_ID = "mc-editor-style";
export const MC_PREVIEW_STYLE_ID = "mc-preview-style";
export const MC_SLIDE_ATTR = "data-mc-slide";

export const EDITOR_RUNTIME = `
(function () {
  if (window.__mcEditorLoaded) return;
  window.__mcEditorLoaded = true;

  var DATA_ID = "data-mc-id";
  var SLIDE_ATTR = "${MC_SLIDE_ATTR}";
  var idCounter = 0;
  var slideCounter = 0;
  var mode = "select";
  var selectedEl = null;

  // ---- editor-only styles (stripped on export) ----------------------------
  var style = document.createElement("style");
  style.id = "${MC_EDITOR_STYLE_ID}";
  style.textContent =
    ".mc-hover-outline{outline:2px dashed #6c5ce7 !important;outline-offset:2px !important;cursor:pointer !important;}" +
    ".mc-selected-outline{outline:3px solid #00cec9 !important;outline-offset:2px !important;}";
  document.documentElement.appendChild(style);

  function post(msg) {
    parent.postMessage(Object.assign({ source: "mc-iframe" }, msg), "*");
  }

  function ensureId(el) {
    var id = el.getAttribute(DATA_ID);
    if (!id) {
      id = "el" + (++idCounter) + "_" + Math.random().toString(36).slice(2, 7);
      el.setAttribute(DATA_ID, id);
    }
    return id;
  }

  function labelFor(el) {
    var tag = el.tagName.toLowerCase();
    var text = (el.textContent || "").trim().replace(/\\s+/g, " ").slice(0, 28);
    var cls = el.className && typeof el.className === "string"
      ? "." + el.className.trim().split(/\\s+/).slice(0, 2).join(".")
      : "";
    return tag + cls + (text ? ' "' + text + '"' : "");
  }

  function slideOf(el) {
    var s = el.closest("[" + SLIDE_ATTR + "]");
    return s ? s.getAttribute(SLIDE_ATTR) : null;
  }

  // ---- slide detection -----------------------------------------------------
  function scanSlides() {
    var found = [];
    var selectors = "section,[class*=slide],[class*=scene],[data-slide],[id*=slide],[id*=scene]";
    var candidates = Array.prototype.slice.call(document.body.querySelectorAll(selectors));

    // Fallback: direct body children that are reasonably large blocks.
    if (candidates.length === 0) {
      candidates = Array.prototype.slice.call(document.body.children).filter(function (c) {
        return c.tagName !== "SCRIPT" && c.tagName !== "STYLE" && c.offsetHeight > 80;
      });
    }
    // De-dupe nested candidates: keep outermost only.
    candidates = candidates.filter(function (c) {
      return !candidates.some(function (o) { return o !== c && o.contains(c); });
    });

    candidates.forEach(function (c) {
      var id = c.getAttribute(SLIDE_ATTR);
      if (!id) {
        id = "slide" + (++slideCounter);
        c.setAttribute(SLIDE_ATTR, id);
      }
      var label = c.getAttribute("aria-label") || c.id ||
        (c.textContent || "").trim().replace(/\\s+/g, " ").slice(0, 30) || ("Slide " + slideCounter);
      found.push({ id: id, label: label });
    });
    post({ type: "mc:slides", slides: found });
  }

  // ---- hover + click selection --------------------------------------------
  var hovered = null;
  document.addEventListener("mouseover", function (e) {
    if (mode !== "select") return;
    if (hovered) hovered.classList.remove("mc-hover-outline");
    var el = e.target;
    if (el && el !== document.body && el !== document.documentElement) {
      el.classList.add("mc-hover-outline");
      hovered = el;
    }
  }, true);

  document.addEventListener("mouseout", function () {
    if (hovered) { hovered.classList.remove("mc-hover-outline"); hovered = null; }
  }, true);

  document.addEventListener("click", function (e) {
    if (mode !== "select") return;
    e.preventDefault();
    e.stopPropagation();
    var el = e.target;
    if (!el || el === document.body || el === document.documentElement) return;
    if (selectedEl) selectedEl.classList.remove("mc-selected-outline");
    selectedEl = el;
    el.classList.remove("mc-hover-outline");
    el.classList.add("mc-selected-outline");
    var id = ensureId(el);
    post({ type: "mc:selected", mcId: id, label: labelFor(el), slideId: slideOf(el) });
  }, true);

  // ---- live preview --------------------------------------------------------
  function applyPreview(css) {
    var s = document.getElementById("${MC_PREVIEW_STYLE_ID}");
    if (!s) {
      s = document.createElement("style");
      s.id = "${MC_PREVIEW_STYLE_ID}";
      document.documentElement.appendChild(s);
    }
    // Force a reflow-based restart so the animation replays on each apply.
    s.textContent = "";
    void document.body.offsetWidth;
    s.textContent = css;
  }

  function highlight(mcId) {
    if (selectedEl) selectedEl.classList.remove("mc-selected-outline");
    var el = document.querySelector('[' + DATA_ID + '="' + mcId + '"]');
    if (el) {
      el.classList.add("mc-selected-outline");
      selectedEl = el;
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }

  function gotoSlide(slideId) {
    var el = document.querySelector('[' + SLIDE_ATTR + '="' + slideId + '"]');
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // ---- serialize a clean export copy --------------------------------------
  function serialize() {
    var clone = document.documentElement.cloneNode(true);
    // Drop editor-only artifacts.
    ["${MC_RUNTIME_SCRIPT_ID}", "${MC_EDITOR_STYLE_ID}", "${MC_PREVIEW_STYLE_ID}"].forEach(function (id) {
      var n = clone.querySelector("#" + id);
      if (n) n.parentNode.removeChild(n);
    });
    Array.prototype.forEach.call(clone.querySelectorAll(".mc-hover-outline,.mc-selected-outline"), function (n) {
      n.classList.remove("mc-hover-outline");
      n.classList.remove("mc-selected-outline");
      if (n.getAttribute("class") === "") n.removeAttribute("class");
    });
    var html = "<!DOCTYPE html>\\n" + clone.outerHTML;
    post({ type: "mc:serialized", html: html });
  }

  // ---- message handling ----------------------------------------------------
  window.addEventListener("message", function (e) {
    var d = e.data || {};
    if (d.source === "mc-iframe") return;
    switch (d.type) {
      case "mc:set-mode": mode = d.mode; break;
      case "mc:apply": applyPreview(d.css); break;
      case "mc:replay": {
        var s = document.getElementById("${MC_PREVIEW_STYLE_ID}");
        if (s) { var css = s.textContent; s.textContent = ""; void document.body.offsetWidth; s.textContent = css; }
        break;
      }
      case "mc:highlight": highlight(d.mcId); break;
      case "mc:goto-slide": gotoSlide(d.slideId); break;
      case "mc:scan-slides": scanSlides(); break;
      case "mc:serialize": serialize(); break;
    }
  });

  scanSlides();
  post({ type: "mc:ready" });
})();
`;

/** Inject the editor runtime into a raw HTML string for use as iframe srcdoc. */
export function injectEditorRuntime(html: string): string {
  const tag = `<script id="${MC_RUNTIME_SCRIPT_ID}">${EDITOR_RUNTIME}</script>`;
  if (/<\/body>/i.test(html)) {
    return html.replace(/<\/body>/i, `${tag}\n</body>`);
  }
  return `${html}\n${tag}`;
}
