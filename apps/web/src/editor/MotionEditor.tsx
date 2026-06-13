import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ASPECT_PRESETS, detectDurationFromHtml } from "@motionconvert/shared";
import type { AspectPresetKey } from "@motionconvert/shared";
import {
  EASINGS,
  MOTION_CATEGORIES,
  MOTION_TEMPLATES,
  getTemplate,
  type EasingKey,
  type MotionCategory,
} from "./motionTemplates";
import {
  buildMotionCss,
  injectMotionStyles,
  type MotionAssignment,
} from "./motionCss";
import { injectEditorRuntime } from "./editorRuntime";

interface SelectedEl {
  mcId: string;
  label: string;
  slideId: string | null;
}

interface MotionEditorProps {
  file: File;
  preset: AspectPresetKey;
  onBack: () => void;
  onExportToConverter: (html: string, filename: string) => void;
}

const EASING_KEYS = Object.keys(EASINGS) as EasingKey[];
const PRESET_KEYS = Object.keys(ASPECT_PRESETS) as AspectPresetKey[];

let keySeq = 0;
const nextKey = () => `a${++keySeq}_${Math.random().toString(36).slice(2, 6)}`;

function fmtTime(ms: number): string {
  const s = ms / 1000;
  return `${s.toFixed(1)}s`;
}

export default function MotionEditor({ file, preset, onBack, onExportToConverter }: MotionEditorProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [fileHtml, setFileHtml] = useState<string | null>(null);
  // Bumping this reloads the iframe from scratch — used to rewind the timeline.
  const [reloadNonce, setReloadNonce] = useState(0);
  const [ready, setReady] = useState(false);
  const [sceneCount, setSceneCount] = useState(0);
  const [selected, setSelected] = useState<SelectedEl | null>(null);
  const [assignments, setAssignments] = useState<MotionAssignment[]>([]);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [category, setCategory] = useState<MotionCategory | "All">("All");
  const [pickMode, setPickMode] = useState(true);
  const [scale, setScale] = useState(0.3);
  // Aspect ratio of the preview stage. Defaults to the converter's choice but
  // can be switched here without leaving the editor.
  const [viewPreset, setViewPreset] = useState<AspectPresetKey>(preset);

  // ---- transport (timeline) state ----
  const [timeMs, setTimeMs] = useState(0);
  const [playing, setPlaying] = useState(false);
  const draggingRef = useRef(false);
  const pendingSeekRef = useRef<number | null>(null);
  // The iframe's actual virtual-clock time, used to decide forward vs rewind
  // (state `timeMs` is optimistic and updates while dragging).
  const reportedTimeRef = useRef(0);
  const exportResolver = useRef<((html: string) => void) | null>(null);

  const { width: stageW, height: stageH } = ASPECT_PRESETS[viewPreset];

  // Total timeline length (seconds → ms), used to size the scrubber.
  const durationMs = useMemo(() => {
    if (fileHtml === null) return 20000;
    const detected = detectDurationFromHtml(fileHtml);
    return Math.max(1000, Math.round((detected ?? 20) * 1000));
  }, [fileHtml]);

  // A non-empty first frame to land on when (re)loading, so the editor never
  // shows a blank pre-animation state.
  const initialFrameMs = useMemo(() => Math.min(2000, durationMs), [durationMs]);

  // Load raw file contents once.
  useEffect(() => {
    file.text().then(setFileHtml);
  }, [file]);

  // Build the iframe document. nonce changes force a reload (rewind).
  const rawHtml = useMemo(
    () => (fileHtml === null ? null : injectEditorRuntime(fileHtml, reloadNonce)),
    [fileHtml, reloadNonce],
  );

  // Each new document means the runtime must re-announce itself.
  useEffect(() => {
    setReady(false);
  }, [rawHtml]);

  const postToIframe = useCallback((msg: Record<string, unknown>) => {
    iframeRef.current?.contentWindow?.postMessage(msg, "*");
  }, []);

  // Fit the fixed-resolution stage into the available preview area.
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const compute = () => {
      const pad = 32;
      const cw = el.clientWidth - pad;
      const ch = el.clientHeight - pad;
      if (cw > 0 && ch > 0) setScale(Math.min(cw / stageW, ch / stageH));
    };
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(el);
    return () => ro.disconnect();
  }, [stageW, stageH]);

  // Listen to messages from the iframe runtime.
  useEffect(() => {
    function onMessage(e: MessageEvent) {
      const d = e.data;
      if (!d || d.source !== "mc-iframe") return;
      switch (d.type) {
        case "mc:ready":
          setReady(true);
          break;
        case "mc:slides":
          setSceneCount(d.slides.length);
          break;
        case "mc:selected":
          setSelected({ mcId: d.mcId, label: d.label, slideId: d.slideId });
          break;
        case "mc:time":
          reportedTimeRef.current = d.ms;
          if (!draggingRef.current) {
            setTimeMs(d.ms);
            setPlaying(d.playing);
          }
          break;
        case "mc:serialized":
          exportResolver.current?.(d.html);
          exportResolver.current = null;
          break;
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  // Keep the iframe in the right pick mode.
  useEffect(() => {
    if (ready) postToIframe({ type: "mc:set-mode", mode: pickMode ? "select" : "idle" });
  }, [ready, pickMode, postToIframe]);

  // On (re)load: push current motion CSS and seek to the desired frame.
  useEffect(() => {
    if (!ready) return;
    postToIframe({ type: "mc:apply", css: buildMotionCss(assignments) });
    const target = pendingSeekRef.current ?? initialFrameMs;
    pendingSeekRef.current = null;
    postToIframe({ type: "mc:seek", ms: target });
    reportedTimeRef.current = target;
    setTimeMs(target);
    setPlaying(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  // Live-preview: rebuild CSS whenever assignments change and push to iframe.
  useEffect(() => {
    if (!ready) return;
    postToIframe({ type: "mc:apply", css: buildMotionCss(assignments) });
  }, [assignments, ready, postToIframe]);

  // ---- transport controls ----
  const play = useCallback(() => {
    postToIframe({ type: "mc:play" });
    setPlaying(true);
  }, [postToIframe]);

  const pause = useCallback(() => {
    postToIframe({ type: "mc:pause" });
    setPlaying(false);
  }, [postToIframe]);

  const seekTo = useCallback(
    (ms: number) => {
      const clamped = Math.max(0, Math.min(ms, durationMs));
      setTimeMs(clamped);
      setPlaying(false);
      if (clamped >= reportedTimeRef.current) {
        // Forward seek is cheap: the virtual clock fast-forwards in place.
        postToIframe({ type: "mc:seek", ms: clamped });
        reportedTimeRef.current = clamped;
      } else {
        // Rewind: reload the iframe and seek forward from zero.
        pendingSeekRef.current = clamped;
        setReloadNonce((n) => n + 1);
      }
    },
    [durationMs, postToIframe],
  );

  const restart = useCallback(() => {
    pendingSeekRef.current = initialFrameMs;
    setReloadNonce((n) => n + 1);
    setPlaying(false);
  }, [initialFrameMs]);

  const onScrubChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    draggingRef.current = true;
    setTimeMs(Number(e.target.value));
  }, []);

  const commitScrub = useCallback(() => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    seekTo(timeMs);
  }, [seekTo, timeMs]);

  const activeAssignment = useMemo(
    () => assignments.find((a) => a.key === activeKey) ?? null,
    [assignments, activeKey],
  );

  const elementAssignments = useMemo(
    () => (selected ? assignments.filter((a) => a.mcId === selected.mcId) : []),
    [assignments, selected],
  );

  const visibleTemplates = useMemo(
    () =>
      category === "All"
        ? MOTION_TEMPLATES
        : MOTION_TEMPLATES.filter((t) => t.category === category),
    [category],
  );

  const addMotion = useCallback(
    (templateId: string) => {
      if (!selected) return;
      const tpl = getTemplate(templateId);
      if (!tpl) return;
      const assignment: MotionAssignment = {
        key: nextKey(),
        mcId: selected.mcId,
        templateId,
        slideId: selected.slideId,
        label: selected.label,
        durationMs: tpl.defaults.durationMs,
        delayMs: tpl.defaults.delayMs,
        easing: tpl.defaults.easing,
        iterations: tpl.defaults.iterations,
      };
      setAssignments((prev) => [...prev, assignment]);
      setActiveKey(assignment.key);
    },
    [selected],
  );

  const updateActive = useCallback(
    (patch: Partial<MotionAssignment>) => {
      if (!activeKey) return;
      setAssignments((prev) =>
        prev.map((a) => (a.key === activeKey ? { ...a, ...patch } : a)),
      );
    },
    [activeKey],
  );

  const removeAssignment = useCallback((key: string) => {
    setAssignments((prev) => prev.filter((a) => a.key !== key));
    setActiveKey((cur) => (cur === key ? null : cur));
  }, []);

  const focusAssignment = useCallback(
    (a: MotionAssignment) => {
      setActiveKey(a.key);
      postToIframe({ type: "mc:highlight", mcId: a.mcId });
      setSelected({ mcId: a.mcId, label: a.label, slideId: a.slideId ?? null });
    },
    [postToIframe],
  );

  const replay = useCallback(() => postToIframe({ type: "mc:replay" }), [postToIframe]);

  // Ask the iframe for a clean serialization, then inject final motion CSS.
  const buildExportHtml = useCallback((): Promise<string> => {
    return new Promise((resolve) => {
      exportResolver.current = (clean: string) =>
        resolve(injectMotionStyles(clean, assignments));
      postToIframe({ type: "mc:serialize" });
    });
  }, [assignments, postToIframe]);

  const exportFilename = useMemo(
    () => file.name.replace(/\.html?$/i, "") + ".motion.html",
    [file.name],
  );

  const handleDownload = useCallback(async () => {
    const html = await buildExportHtml();
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = exportFilename;
    a.click();
    URL.revokeObjectURL(url);
  }, [buildExportHtml, exportFilename]);

  const handleSendToConverter = useCallback(async () => {
    const html = await buildExportHtml();
    onExportToConverter(html, exportFilename);
  }, [buildExportHtml, exportFilename, onExportToConverter]);

  return (
    <div className="flex h-screen flex-col bg-[var(--color-surface)]">
      {/* Top bar */}
      <header className="flex items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-panel)] px-4 py-3">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-sm text-[var(--color-muted)] hover:text-white"
          >
            ← Back
          </button>
          <div>
            <h1 className="text-sm font-semibold">Motion Editor</h1>
            <p className="text-xs text-[var(--color-muted)]">{file.name}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-0.5 rounded-lg bg-[var(--color-surface)] p-0.5" title="Preview aspect ratio">
            {PRESET_KEYS.map((key) => (
              <button
                key={key}
                onClick={() => setViewPreset(key)}
                className={`rounded-md px-2.5 py-1 text-xs font-medium ${
                  viewPreset === key
                    ? "bg-[var(--color-accent)] text-white"
                    : "text-[var(--color-muted)] hover:text-white"
                }`}
              >
                {key}
              </button>
            ))}
          </div>
          <button
            onClick={() => setPickMode((p) => !p)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
              pickMode
                ? "bg-[var(--color-accent)] text-white"
                : "bg-[var(--color-surface)] text-[var(--color-muted)]"
            }`}
            title="Toggle element picking"
          >
            {pickMode ? "🎯 Picking" : "🔒 Locked"}
          </button>
          <button
            onClick={replay}
            className="rounded-lg bg-[var(--color-surface)] px-3 py-1.5 text-sm text-white hover:bg-[var(--color-border)]"
          >
            ↻ Replay motions
          </button>
          <button
            onClick={handleDownload}
            className="rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-sm font-medium text-white hover:border-[var(--color-muted)]"
          >
            ⬇ Export HTML
          </button>
          <button
            onClick={handleSendToConverter}
            className="rounded-lg bg-[var(--color-success)] px-3 py-1.5 text-sm font-semibold text-[#0f1117] hover:opacity-90"
          >
            🎬 Convert to MP4
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* Left: applied motions */}
        <aside className="flex w-64 flex-col border-r border-[var(--color-border)] bg-[var(--color-panel)]">
          <div className="border-b border-[var(--color-border)] p-3 text-xs text-[var(--color-muted)]">
            <p className="font-semibold uppercase tracking-wide">Timeline</p>
            <p className="mt-1">
              {sceneCount} scene(s) detected · {fmtTime(durationMs)} total
            </p>
            <p className="mt-1 leading-relaxed">
              Use the player below the preview to pause on the moment you want to edit.
            </p>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-muted)]">
              Applied motions ({assignments.length})
            </h2>
            <div className="space-y-1.5">
              {assignments.map((a) => {
                const tpl = getTemplate(a.templateId);
                return (
                  <div
                    key={a.key}
                    onClick={() => focusAssignment(a)}
                    className={`cursor-pointer rounded-lg border px-2.5 py-2 text-xs ${
                      activeKey === a.key
                        ? "border-[var(--color-accent)] bg-[var(--color-accent)]/10"
                        : "border-[var(--color-border)] bg-[var(--color-surface)]"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-white">
                        {tpl?.icon} {tpl?.name}
                      </span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          removeAssignment(a.key);
                        }}
                        className="text-[var(--color-muted)] hover:text-[var(--color-error)]"
                      >
                        ✕
                      </button>
                    </div>
                    <p className="mt-0.5 truncate text-[var(--color-muted)]">{a.label}</p>
                  </div>
                );
              })}
              {assignments.length === 0 && (
                <p className="text-xs text-[var(--color-muted)]">
                  Click an element in the preview, then pick a template.
                </p>
              )}
            </div>
          </div>
        </aside>

        {/* Center: live preview + transport */}
        <main className="flex min-w-0 flex-1 flex-col bg-[#0a0c12]">
          <div className="flex items-center gap-2 border-b border-[var(--color-border)] px-4 py-2 text-xs text-[var(--color-muted)]">
            {selected ? (
              <>
                <span className="rounded bg-[var(--color-accent)]/20 px-2 py-0.5 text-[var(--color-accent-hover)]">
                  Selected
                </span>
                <span className="truncate">{selected.label}</span>
              </>
            ) : (
              <span>Pause the player, then hover and click any element to select it.</span>
            )}
          </div>

          <div
            ref={stageRef}
            className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden p-4"
          >
            {rawHtml ? (
              <div
                className="relative shrink-0 overflow-hidden rounded-lg border border-[var(--color-border)] bg-white shadow-xl"
                style={{ width: stageW * scale, height: stageH * scale }}
              >
                <iframe
                  ref={iframeRef}
                  title="preview"
                  srcDoc={rawHtml}
                  style={{
                    width: stageW,
                    height: stageH,
                    transform: `scale(${scale})`,
                    transformOrigin: "top left",
                  }}
                  className="absolute left-0 top-0 border-0 bg-white"
                  sandbox="allow-scripts allow-same-origin"
                />
              </div>
            ) : (
              <div className="flex h-full items-center justify-center text-[var(--color-muted)]">
                Loading…
              </div>
            )}
            <div className="pointer-events-none absolute bottom-2 right-3 rounded bg-black/50 px-2 py-0.5 text-[10px] text-white/80">
              {stageW}×{stageH} · {Math.round(scale * 100)}%
            </div>
          </div>

          {/* Transport bar */}
          <div className="flex items-center gap-3 border-t border-[var(--color-border)] bg-[var(--color-panel)] px-4 py-2.5">
            <button
              onClick={restart}
              title="Restart from the beginning"
              className="rounded-lg bg-[var(--color-surface)] px-2.5 py-1.5 text-sm text-white hover:bg-[var(--color-border)]"
            >
              ⏮
            </button>
            <button
              onClick={() => seekTo(timeMs - 1000)}
              title="Back 1s"
              className="rounded-lg bg-[var(--color-surface)] px-2.5 py-1.5 text-sm text-white hover:bg-[var(--color-border)]"
            >
              ⏪
            </button>
            <button
              onClick={playing ? pause : play}
              className="rounded-lg bg-[var(--color-accent)] px-4 py-1.5 text-sm font-semibold text-white hover:bg-[var(--color-accent-hover)]"
            >
              {playing ? "⏸ Pause" : "▶ Play"}
            </button>
            <button
              onClick={() => seekTo(timeMs + 1000)}
              title="Forward 1s"
              className="rounded-lg bg-[var(--color-surface)] px-2.5 py-1.5 text-sm text-white hover:bg-[var(--color-border)]"
            >
              ⏩
            </button>
            <input
              type="range"
              min={0}
              max={durationMs}
              step={50}
              value={Math.min(timeMs, durationMs)}
              onChange={onScrubChange}
              onPointerUp={commitScrub}
              onMouseUp={commitScrub}
              onTouchEnd={commitScrub}
              className="flex-1 accent-[var(--color-accent)]"
            />
            <span className="w-24 text-right font-mono text-xs text-[var(--color-muted)]">
              {fmtTime(timeMs)} / {fmtTime(durationMs)}
            </span>
          </div>
        </main>

        {/* Right: template library + properties */}
        <aside className="flex w-80 flex-col border-l border-[var(--color-border)] bg-[var(--color-panel)]">
          {/* Properties of active motion */}
          {activeAssignment && (
            <div className="border-b border-[var(--color-border)] p-4">
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-[var(--color-muted)]">
                {getTemplate(activeAssignment.templateId)?.name} — timing
              </h2>
              <div className="space-y-3">
                <Range
                  label="Duration"
                  value={activeAssignment.durationMs}
                  min={100}
                  max={15000}
                  step={100}
                  suffix="ms"
                  onChange={(v) => updateActive({ durationMs: v })}
                />
                <Range
                  label="Delay"
                  value={activeAssignment.delayMs}
                  min={0}
                  max={20000}
                  step={100}
                  suffix="ms"
                  onChange={(v) => updateActive({ delayMs: v })}
                />
                <div>
                  <label className="mb-1 block text-xs text-[var(--color-muted)]">Easing</label>
                  <select
                    value={activeAssignment.easing}
                    onChange={(e) => updateActive({ easing: e.target.value as EasingKey })}
                    className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1.5 text-sm outline-none focus:border-[var(--color-accent)]"
                  >
                    {EASING_KEYS.map((k) => (
                      <option key={k} value={k}>
                        {k}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs text-[var(--color-muted)]">
                    Repeat ({activeAssignment.iterations === 0 ? "infinite" : activeAssignment.iterations})
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={0}
                      max={50}
                      value={activeAssignment.iterations}
                      onChange={(e) => updateActive({ iterations: Number(e.target.value) })}
                      className="w-20 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1.5 text-sm outline-none focus:border-[var(--color-accent)]"
                    />
                    <button
                      onClick={() => updateActive({ iterations: 0 })}
                      className="rounded-lg bg-[var(--color-surface)] px-2.5 py-1.5 text-xs text-[var(--color-muted)] hover:text-white"
                    >
                      ∞ Loop
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Element's motions quick list */}
          {selected && (
            <div className="border-b border-[var(--color-border)] px-4 py-2 text-xs text-[var(--color-muted)]">
              {elementAssignments.length} motion(s) on this element
            </div>
          )}

          {/* Template library */}
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex flex-wrap gap-1 border-b border-[var(--color-border)] p-3">
              {(["All", ...MOTION_CATEGORIES] as const).map((c) => (
                <button
                  key={c}
                  onClick={() => setCategory(c)}
                  className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                    category === c
                      ? "bg-[var(--color-accent)] text-white"
                      : "bg-[var(--color-surface)] text-[var(--color-muted)] hover:text-white"
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              <div className="grid grid-cols-2 gap-2">
                {visibleTemplates.map((t) => (
                  <button
                    key={t.id}
                    disabled={!selected}
                    onClick={() => addMotion(t.id)}
                    title={t.description}
                    className="flex flex-col items-start rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-2.5 text-left transition-colors hover:border-[var(--color-accent)] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <span className="text-lg">{t.icon}</span>
                    <span className="mt-1 text-xs font-medium text-white">{t.name}</span>
                    <span className="text-[10px] text-[var(--color-muted)]">{t.category}</span>
                  </button>
                ))}
              </div>
              {!selected && (
                <p className="mt-3 text-center text-xs text-[var(--color-muted)]">
                  Select an element first to enable templates.
                </p>
              )}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

function Range({
  label,
  value,
  min,
  max,
  step,
  suffix,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  suffix: string;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs text-[var(--color-muted)]">
        <span>{label}</span>
        <span className="text-white">
          {value}
          {suffix}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-[var(--color-accent)]"
      />
    </div>
  );
}
