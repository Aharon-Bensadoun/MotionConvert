import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

interface SlideInfo {
  id: string;
  label: string;
}

interface SelectedEl {
  mcId: string;
  label: string;
  slideId: string | null;
}

interface MotionEditorProps {
  file: File;
  onBack: () => void;
  onExportToConverter: (html: string, filename: string) => void;
}

const EASING_KEYS = Object.keys(EASINGS) as EasingKey[];

let keySeq = 0;
const nextKey = () => `a${++keySeq}_${Math.random().toString(36).slice(2, 6)}`;

export default function MotionEditor({ file, onBack, onExportToConverter }: MotionEditorProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [rawHtml, setRawHtml] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [slides, setSlides] = useState<SlideInfo[]>([]);
  const [currentSlide, setCurrentSlide] = useState<string | null>(null);
  const [selected, setSelected] = useState<SelectedEl | null>(null);
  const [assignments, setAssignments] = useState<MotionAssignment[]>([]);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [category, setCategory] = useState<MotionCategory | "All">("All");
  const [pickMode, setPickMode] = useState(true);
  const exportResolver = useRef<((html: string) => void) | null>(null);

  // Load file contents and inject the editor runtime for the iframe.
  useEffect(() => {
    file.text().then((html) => setRawHtml(injectEditorRuntime(html)));
  }, [file]);

  const postToIframe = useCallback((msg: Record<string, unknown>) => {
    iframeRef.current?.contentWindow?.postMessage(msg, "*");
  }, []);

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
          setSlides(d.slides);
          setCurrentSlide((cur) => cur ?? (d.slides[0]?.id ?? null));
          break;
        case "mc:selected":
          setSelected({ mcId: d.mcId, label: d.label, slideId: d.slideId });
          if (d.slideId) setCurrentSlide(d.slideId);
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

  // Live-preview: rebuild CSS whenever assignments change and push to iframe.
  useEffect(() => {
    if (!ready) return;
    postToIframe({ type: "mc:apply", css: buildMotionCss(assignments) });
  }, [assignments, ready, postToIframe]);

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

  const gotoSlide = useCallback(
    (slideId: string) => {
      setCurrentSlide(slideId);
      postToIframe({ type: "mc:goto-slide", slideId });
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
            ▶ Replay
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
        {/* Left: slides + applied motions */}
        <aside className="flex w-64 flex-col border-r border-[var(--color-border)] bg-[var(--color-panel)]">
          <div className="border-b border-[var(--color-border)] p-3">
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-muted)]">
              Slides ({slides.length})
            </h2>
            <div className="space-y-1">
              {slides.map((s, i) => (
                <button
                  key={s.id}
                  onClick={() => gotoSlide(s.id)}
                  className={`block w-full truncate rounded-lg px-2.5 py-1.5 text-left text-sm ${
                    currentSlide === s.id
                      ? "bg-[var(--color-accent)]/20 text-white"
                      : "text-[var(--color-muted)] hover:bg-[var(--color-surface)]"
                  }`}
                  title={s.label}
                >
                  <span className="mr-1.5 text-[var(--color-muted)]">{i + 1}.</span>
                  {s.label || `Slide ${i + 1}`}
                  {assignments.some((a) => a.slideId === s.id) && (
                    <span className="ml-1 text-[var(--color-accent)]">●</span>
                  )}
                </button>
              ))}
              {slides.length === 0 && (
                <p className="text-xs text-[var(--color-muted)]">No slides detected.</p>
              )}
            </div>
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

        {/* Center: live preview */}
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
              <span>Hover and click any element in the preview to select it.</span>
            )}
          </div>
          <div className="min-h-0 flex-1 overflow-auto p-4">
            {rawHtml ? (
              <iframe
                ref={iframeRef}
                title="preview"
                srcDoc={rawHtml}
                className="mx-auto h-full w-full rounded-lg border border-[var(--color-border)] bg-white"
                sandbox="allow-scripts allow-same-origin"
              />
            ) : (
              <div className="flex h-full items-center justify-center text-[var(--color-muted)]">
                Loading…
              </div>
            )}
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
