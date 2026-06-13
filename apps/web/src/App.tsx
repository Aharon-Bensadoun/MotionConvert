import { useCallback, useEffect, useRef, useState } from "react";
import {
  ASPECT_PRESETS,
  ALLOWED_FPS,
  detectDurationFromHtml,
  durationMismatchPercent,
} from "@motionconvert/shared";
import type { AspectPresetKey } from "@motionconvert/shared";
import { createJob, getDownloadUrl, getHealth } from "./api";
import { useJobPolling } from "./useJobPolling";
import MotionEditor from "./editor/MotionEditor";

const PRESET_KEYS = Object.keys(ASPECT_PRESETS) as AspectPresetKey[];

export default function App() {
  const [view, setView] = useState<"convert" | "editor">("convert");
  const [file, setFile] = useState<File | null>(null);
  const [preset, setPreset] = useState<AspectPresetKey>("9:16");
  const [durationSec, setDurationSec] = useState(30);
  const [autoDuration, setAutoDuration] = useState(true);
  const [detectedDurationSec, setDetectedDurationSec] = useState<number | null>(null);
  const [fps, setFps] = useState<number>(30);
  const [jobId, setJobId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [converterReady, setConverterReady] = useState<boolean | null>(null);
  const [converterErrors, setConverterErrors] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const { job, error: pollError, stuckPending } = useJobPolling(jobId);

  useEffect(() => {
    getHealth()
      .then((health) => {
        setConverterReady(health.converter.ready);
        setConverterErrors(health.converter.errors);
      })
      .catch(() => {
        setConverterReady(null);
      });
  }, []);

  const detectDuration = useCallback(async (f: File) => {
    try {
      const html = await f.text();
      const detected = detectDurationFromHtml(html);
      setDetectedDurationSec(detected);
      if (detected !== null && autoDuration) {
        setDurationSec(detected);
      }
    } catch {
      setDetectedDurationSec(null);
    }
  }, [autoDuration]);

  const handleFile = useCallback(
    (f: File) => {
      if (!f.name.toLowerCase().endsWith(".html") && !f.name.toLowerCase().endsWith(".htm")) {
        setSubmitError("Please upload an .html file");
        return;
      }
      setFile(f);
      setSubmitError(null);
      setJobId(null);
      void detectDuration(f);
    },
    [detectDuration],
  );

  const handleEditedHtml = useCallback(
    (html: string, filename: string) => {
      const edited = new File([html], filename, { type: "text/html" });
      setFile(edited);
      setSubmitError(null);
      setJobId(null);
      void detectDuration(edited);
      setView("convert");
    },
    [detectDuration],
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const dropped = e.dataTransfer.files[0];
      if (dropped) handleFile(dropped);
    },
    [handleFile],
  );

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      setSubmitError("Select an HTML file first");
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      const created = await createJob(file, {
        preset,
        fps,
        durationSec,
        autoDuration,
        format: "mp4",
      });
      setJobId(created.id);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  const durationMismatch =
    !autoDuration &&
    detectedDurationSec !== null &&
    durationMismatchPercent(durationSec, detectedDurationSec) > 0.05;

  const statusLabel = job
    ? {
        pending: "Queued",
        processing: "Converting",
        completed: "Done",
        failed: "Failed",
      }[job.status]
    : null;

  if (view === "editor" && file) {
    return (
      <MotionEditor
        file={file}
        onBack={() => setView("convert")}
        onExportToConverter={handleEditedHtml}
      />
    );
  }

  return (
    <div className="min-h-screen px-4 py-10">
      <div className="mx-auto max-w-2xl">
        <header className="mb-10 text-center">
          <h1 className="text-3xl font-bold tracking-tight">MotionConvert</h1>
          <p className="mt-2 text-[var(--color-muted)]">
            Convert HTML motion designs to MP4 — fully local
          </p>
          {converterReady === false && (
            <div className="mx-auto mt-4 max-w-lg rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-left text-sm text-amber-200">
              <p className="font-medium">Converter not ready</p>
              <ul className="mt-1 list-inside list-disc text-amber-200/90">
                {converterErrors.map((msg) => (
                  <li key={msg}>{msg}</li>
                ))}
              </ul>
            </div>
          )}
        </header>

        <form onSubmit={onSubmit} className="space-y-6">
          <div
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === "Enter" && inputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            onClick={() => inputRef.current?.click()}
            className={`cursor-pointer rounded-2xl border-2 border-dashed p-10 text-center transition-colors ${
              dragOver
                ? "border-[var(--color-accent)] bg-[var(--color-accent)]/10"
                : "border-[var(--color-border)] bg-[var(--color-panel)] hover:border-[var(--color-muted)]"
            }`}
          >
            <input
              ref={inputRef}
              type="file"
              accept=".html,.htm"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
              }}
            />
            {file ? (
              <div>
                <p className="font-medium">{file.name}</p>
                <p className="mt-1 text-sm text-[var(--color-muted)]">
                  {(file.size / 1024).toFixed(1)} KB — click or drop to replace
                </p>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setView("editor");
                  }}
                  className="mt-3 inline-flex items-center gap-2 rounded-xl bg-[var(--color-accent)] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[var(--color-accent-hover)]"
                >
                  ✨ Edit motion design
                </button>
              </div>
            ) : (
              <div>
                <p className="font-medium">Drop your HTML file here</p>
                <p className="mt-1 text-sm text-[var(--color-muted)]">or click to browse</p>
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-panel)] p-6 space-y-5">
            <div>
              <label className="mb-2 block text-sm font-medium text-[var(--color-muted)]">
                Aspect ratio
              </label>
              <div className="grid grid-cols-3 gap-2">
                {PRESET_KEYS.map((key) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setPreset(key)}
                    className={`rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                      preset === key
                        ? "bg-[var(--color-accent)] text-white"
                        : "bg-[var(--color-surface)] text-[var(--color-muted)] hover:text-white"
                    }`}
                  >
                    {ASPECT_PRESETS[key].label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <label htmlFor="duration" className="text-sm font-medium text-[var(--color-muted)]">
                    Duration (seconds)
                  </label>
                  <label className="flex items-center gap-1.5 text-xs text-[var(--color-muted)]">
                    <input
                      type="checkbox"
                      checked={autoDuration}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setAutoDuration(checked);
                        if (checked && detectedDurationSec !== null) {
                          setDurationSec(detectedDurationSec);
                        }
                      }}
                      className="rounded"
                    />
                    Auto
                  </label>
                </div>
                <input
                  id="duration"
                  type="number"
                  min={1}
                  max={120}
                  value={durationSec}
                  disabled={autoDuration}
                  onChange={(e) => setDurationSec(Number(e.target.value))}
                  className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2.5 outline-none focus:border-[var(--color-accent)] disabled:opacity-60"
                />
                {detectedDurationSec !== null && (
                  <p className="mt-1.5 text-xs text-[var(--color-muted)]">
                    Detected: {detectedDurationSec}s
                    {autoDuration && " (used for export)"}
                  </p>
                )}
                {durationMismatch && (
                  <p className="mt-1.5 text-xs text-amber-300">
                    Manual duration ({durationSec}s) differs from detected ({detectedDurationSec}s)
                    by more than 5% — scenes may be cut short or loop.
                  </p>
                )}
              </div>
              <div>
                <label htmlFor="fps" className="mb-2 block text-sm font-medium text-[var(--color-muted)]">
                  FPS
                </label>
                <select
                  id="fps"
                  value={fps}
                  onChange={(e) => setFps(Number(e.target.value))}
                  className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2.5 outline-none focus:border-[var(--color-accent)]"
                >
                  {ALLOWED_FPS.map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {(submitError || pollError) && (
            <div className="rounded-xl border border-[var(--color-error)]/40 bg-[var(--color-error)]/10 px-4 py-3 text-sm text-[var(--color-error)]">
              {submitError ?? pollError}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting || !file || (job?.status === "processing")}
            className="w-full rounded-xl bg-[var(--color-accent)] py-3.5 font-semibold text-white transition-colors hover:bg-[var(--color-accent-hover)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? "Uploading…" : "Convert to MP4"}
          </button>
        </form>

        {job && (
          <section className="mt-8 rounded-2xl border border-[var(--color-border)] bg-[var(--color-panel)] p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-semibold">Conversion status</h2>
              <span
                className={`rounded-full px-3 py-1 text-xs font-medium ${
                  job.status === "completed"
                    ? "bg-[var(--color-success)]/20 text-[var(--color-success)]"
                    : job.status === "failed"
                      ? "bg-[var(--color-error)]/20 text-[var(--color-error)]"
                      : "bg-[var(--color-accent)]/20 text-[var(--color-accent-hover)]"
                }`}
              >
                {statusLabel}
              </span>
            </div>

            <div className="mb-2 h-2 overflow-hidden rounded-full bg-[var(--color-surface)]">
              <div
                className="h-full rounded-full bg-[var(--color-accent)] transition-all duration-500"
                style={{ width: `${job.progress}%` }}
              />
            </div>
            <p className="text-sm text-[var(--color-muted)]">
              {job.status === "processing"
                ? `${job.progress}% complete`
                : job.status === "pending"
                  ? "Waiting for worker…"
                  : `${job.progress}% complete`}
            </p>

            {stuckPending && job.status === "pending" && (
              <p className="mt-3 text-sm text-amber-300">
                The job is still queued. Make sure the worker is running (`pnpm dev`) and FFmpeg is
                installed on your PATH.
              </p>
            )}

            {job.status === "failed" && job.errorMessage && (
              <p className="mt-3 text-sm text-[var(--color-error)]">{job.errorMessage}</p>
            )}

            {job.status === "completed" && (
              <a
                href={getDownloadUrl(job.id)}
                download
                className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[var(--color-success)] px-5 py-2.5 text-sm font-semibold text-[#0f1117] transition-opacity hover:opacity-90"
              >
                Download MP4
              </a>
            )}
          </section>
        )}

        <footer className="mt-12 text-center text-xs text-[var(--color-muted)]">
          API localhost:3001 · Worker uses Playwright + FFmpeg on your machine
        </footer>
      </div>
    </div>
  );
}
