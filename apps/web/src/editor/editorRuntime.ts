/**
 * Script injected into the preview <iframe>. Runs in the sandboxed document and
 * talks to the editor (parent) over postMessage.
 *
 * These motion-design files are timeline-driven: a single JS clock (rAF loops,
 * setInterval/STEPS arrays, ...) reveals "scenes" over time by toggling CSS
 * classes. There is no reliable per-scene DOM node to isolate. So instead of
 * faking slides, we virtualise the clock:
 *
 *  - FREEZE_PREAMBLE replaces setTimeout/setInterval/requestAnimationFrame and
 *    performance.now/Date.now with a virtual clock, and drives the page's CSS
 *    animations from that same clock via document.getAnimations(). The whole
 *    motion can then be played, paused, or seeked to any time — paused frames
 *    stay fully rendered instead of resetting to opacity:0.
 *  - EDITOR_RUNTIME handles element picking, scene detection, live motion CSS
 *    preview, transport messages and clean export serialization.
 *
 * Editor motion previews use animation names starting with "mc_" and are kept
 * OUT of the virtual clock so the user always sees them play live, even while
 * the underlying scene is paused.
 */

export const MC_RUNTIME_SCRIPT_ID = "mc-editor-runtime";
export const MC_FREEZE_PREAMBLE_ID = "mc-freeze-preamble";
export const MC_START_FLAG_ID = "mc-start-flag";
export const MC_EDITOR_STYLE_ID = "mc-editor-style";
export const MC_PREVIEW_STYLE_ID = "mc-preview-style";
export const MC_SLIDE_ATTR = "data-mc-slide";

/**
 * Runs FIRST, at the top of <head>, before any of the page's own scripts so it
 * can wrap the timing primitives. Exposes window.__mcClock with
 * play/pause/seek/getTime.
 */
export const FREEZE_PREAMBLE = `
(function () {
  if (window.__mcClock) return;
  var W = window, perf = W.performance, doc = document;
  var realRAF = (W.requestAnimationFrame
    ? W.requestAnimationFrame.bind(W)
    : function (cb) { return W.setTimeout(function () { cb(Date.now()); }, 16); });
  var realST = W.setTimeout.bind(W);
  var realPerfNow = (perf && perf.now) ? perf.now.bind(perf) : function () { return Date.now(); };
  var realDateNow = Date.now.bind(Date);
  var perfOrigin = realPerfNow();
  var dateOrigin = realDateNow();

  var vClock = 0;                  // virtual ms since load
  var playing = false;             // start paused; the editor seeks then plays
  var seekTarget = null;           // when set, fast-forward vClock to this
  var lastReal = realPerfNow();
  var MAX_DT = 64;                 // clamp real frame delta when playing
  var SUB = 32;                    // fast-forward substep size

  function vPerf() { return perfOrigin + vClock; }
  function vDate() { return dateOrigin + vClock; }

  // ---- virtual timers + requestAnimationFrame ------------------------------
  var timers = {}, rafs = {}, nextId = 1;
  W.setTimeout = function (cb, delay) {
    if (typeof cb !== "function") return realST.apply(W, arguments);
    var id = nextId++, args = Array.prototype.slice.call(arguments, 2);
    timers[id] = { cb: cb, due: vClock + (+delay || 0), interval: 0, args: args };
    return id;
  };
  W.setInterval = function (cb, delay) {
    if (typeof cb !== "function") return realST.apply(W, arguments);
    var id = nextId++, args = Array.prototype.slice.call(arguments, 2);
    var d = (+delay || 0); if (d < 4) d = 4;
    timers[id] = { cb: cb, due: vClock + d, interval: d, args: args };
    return id;
  };
  W.clearTimeout = function (id) { delete timers[id]; };
  W.clearInterval = function (id) { delete timers[id]; };
  W.requestAnimationFrame = function (cb) { var id = nextId++; rafs[id] = cb; return id; };
  W.cancelAnimationFrame = function (id) { delete rafs[id]; };
  if (perf && perf.now) { try { perf.now = vPerf; } catch (e) {} }
  try { Date.now = vDate; } catch (e) {}

  // ---- drive the page's CSS animations off the virtual clock ---------------
  var startMap = new WeakMap();
  function syncCss() {
    var list;
    try { list = doc.getAnimations ? doc.getAnimations() : []; } catch (e) { return; }
    for (var i = 0; i < list.length; i++) {
      var a = list[i];
      // Editor motion previews (mc_*) always run live, never clock-bound.
      if (a.animationName && a.animationName.indexOf("mc_") === 0) continue;
      var startV = startMap.get(a);
      if (startV === undefined) {
        startV = vClock;            // virtual start = first time we observe it
        startMap.set(a, startV);
        try { a.pause(); } catch (e) {}
      }
      try { a.currentTime = vClock - startV; } catch (e) {}
    }
  }

  // Advance the virtual clock to a value, running every JS callback due in
  // between (timers first, then this frame's rAF callbacks).
  function step(toClock) {
    vClock = toClock;
    var ran = true, guard = 0;
    while (ran && guard++ < 10000) {
      ran = false;
      for (var id in timers) {
        var tm = timers[id];
        if (tm && vClock >= tm.due) {
          ran = true;
          try { tm.cb.apply(W, tm.args); } catch (e) {}
          if (timers[id]) {
            if (tm.interval) { tm.due += tm.interval; if (tm.due < vClock) tm.due = vClock + tm.interval; }
            else delete timers[id];
          }
        }
      }
    }
    var cbs = rafs; rafs = {};
    var ts = perfOrigin + vClock;
    for (var rid in cbs) { try { cbs[rid](ts); } catch (e) {} }
  }

  var lastPost = 0;
  function master() {
    var now = realPerfNow();
    var dt = now - lastReal;
    lastReal = now;

    if (seekTarget !== null) {
      var budget = 0;
      while (seekTarget !== null && vClock < seekTarget && budget++ < 8000) {
        step(Math.min(vClock + SUB, seekTarget));
        if (vClock >= seekTarget) { seekTarget = null; playing = false; }
      }
      syncCss();
    } else if (playing) {
      if (dt > MAX_DT) dt = MAX_DT;
      if (dt > 0) step(vClock + dt);
      syncCss();
    } else {
      syncCss();
    }

    if (now - lastPost > 100) {
      lastPost = now;
      parent.postMessage(
        { source: "mc-iframe", type: "mc:time", ms: Math.round(vClock), playing: playing && seekTarget === null },
        "*",
      );
    }
    realRAF(master);
  }
  realRAF(master);

  W.__mcClock = {
    play: function () { seekTarget = null; playing = true; },
    pause: function () { seekTarget = null; playing = false; },
    // Forward-only seek. Rewinding is done by reloading the iframe (the editor
    // handles that) because the page timelines are not generally reversible.
    seek: function (ms) {
      ms = +ms || 0;
      if (ms <= vClock) return false;
      seekTarget = ms;
      return true;
    },
    getTime: function () { return vClock; },
    isPlaying: function () { return playing && seekTarget === null; }
  };
})();
`;

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

  // ---- scene detection (informational) ------------------------------------
  function scanSlides() {
    var found = [];
    var selectors = "section,[class*=slide],[class*=scene],[class*=screen],[data-slide],[id*=slide],[id*=scene]";
    var candidates = Array.prototype.slice.call(document.body.querySelectorAll(selectors));
    if (candidates.length === 0) {
      candidates = Array.prototype.slice.call(document.body.children).filter(function (c) {
        return c.tagName !== "SCRIPT" && c.tagName !== "STYLE" && c.offsetHeight > 80;
      });
    }
    candidates = candidates.filter(function (c) {
      return !candidates.some(function (o) { return o !== c && o.contains(c); });
    });
    candidates.forEach(function (c) {
      var id = c.getAttribute(SLIDE_ATTR);
      if (!id) { id = "slide" + (++slideCounter); c.setAttribute(SLIDE_ATTR, id); }
      var label = c.getAttribute("aria-label") || c.id ||
        (c.textContent || "").trim().replace(/\\s+/g, " ").slice(0, 30) || ("Scene " + slideCounter);
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

  // ---- live motion preview -------------------------------------------------
  function applyPreview(css) {
    var s = document.getElementById("${MC_PREVIEW_STYLE_ID}");
    if (!s) {
      s = document.createElement("style");
      s.id = "${MC_PREVIEW_STYLE_ID}";
      document.documentElement.appendChild(s);
    }
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

  // ---- serialize a clean export copy --------------------------------------
  function serialize() {
    var clone = document.documentElement.cloneNode(true);
    [
      "${MC_RUNTIME_SCRIPT_ID}",
      "${MC_FREEZE_PREAMBLE_ID}",
      "${MC_START_FLAG_ID}",
      "${MC_EDITOR_STYLE_ID}",
      "${MC_PREVIEW_STYLE_ID}"
    ].forEach(function (id) {
      var n = clone.querySelector("#" + id);
      if (n) n.parentNode.removeChild(n);
    });
    Array.prototype.forEach.call(clone.querySelectorAll(".mc-hover-outline,.mc-selected-outline"), function (n) {
      n.classList.remove("mc-hover-outline");
      n.classList.remove("mc-selected-outline");
      if (n.getAttribute("class") === "") n.removeAttribute("class");
    });
    Array.prototype.forEach.call(clone.querySelectorAll("[" + SLIDE_ATTR + "]"), function (n) {
      n.removeAttribute(SLIDE_ATTR);
    });
    var html = "<!DOCTYPE html>\\n" + clone.outerHTML;
    post({ type: "mc:serialized", html: html });
  }

  // ---- message handling ----------------------------------------------------
  window.addEventListener("message", function (e) {
    var d = e.data || {};
    if (d.source === "mc-iframe") return;
    var clock = window.__mcClock;
    switch (d.type) {
      case "mc:set-mode": mode = d.mode; break;
      case "mc:play": if (clock) clock.play(); break;
      case "mc:pause": if (clock) clock.pause(); break;
      case "mc:seek": if (clock) clock.seek(d.ms); break;
      case "mc:apply": applyPreview(d.css); break;
      case "mc:replay": {
        var s = document.getElementById("${MC_PREVIEW_STYLE_ID}");
        if (s) { var css = s.textContent; s.textContent = ""; void document.body.offsetWidth; s.textContent = css; }
        break;
      }
      case "mc:highlight": highlight(d.mcId); break;
      case "mc:scan-slides": scanSlides(); break;
      case "mc:serialize": serialize(); break;
    }
  });

  scanSlides();
  post({ type: "mc:ready" });
})();
`;

/**
 * Inject the editor scripts into a raw HTML string for use as iframe srcdoc.
 * `nonce` only needs to change to force the iframe to reload (used to rewind the
 * timeline, which is not reversible in-place).
 */
export function injectEditorRuntime(html: string, nonce = 0): string {
  const head =
    `<script id="${MC_START_FLAG_ID}">window.__MC_NONCE=${JSON.stringify(String(nonce))};</script>\n` +
    `<script id="${MC_FREEZE_PREAMBLE_ID}">${FREEZE_PREAMBLE}</script>`;

  let out = html;
  if (/<head[^>]*>/i.test(out)) {
    out = out.replace(/(<head[^>]*>)/i, `$1\n${head}`);
  } else if (/<html[^>]*>/i.test(out)) {
    out = out.replace(/(<html[^>]*>)/i, `$1\n<head>${head}</head>`);
  } else {
    out = `${head}\n${out}`;
  }

  const tag = `<script id="${MC_RUNTIME_SCRIPT_ID}">${EDITOR_RUNTIME}</script>`;
  if (/<\/body>/i.test(out)) {
    out = out.replace(/<\/body>/i, `${tag}\n</body>`);
  } else {
    out = `${out}\n${tag}`;
  }
  return out;
}
