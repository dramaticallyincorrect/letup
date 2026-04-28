import { useState, useEffect, useRef } from "react";
import { api } from "../api/client";
import type { Board, BoardParam } from "../api/types";

type Phase = "params" | "running" | "success" | "failed";

export function BoardSetupView({
  board,
  onSetupComplete,
}: {
  board: Board;
  onSetupComplete: () => void;
}) {
  const params: BoardParam[] = (() => {
    try { return JSON.parse(board.parameters_json || "[]"); } catch { return []; }
  })();

  const [values, setValues] = useState<Record<string, string>>(
    Object.fromEntries(params.map((p) => [p.key, ""]))
  );
  const [phase, setPhase] = useState<Phase>(
    board.setup_status === "running" ? "running" :
    board.setup_status === "failed" ? "failed" : "params"
  );
  const [logs, setLogs] = useState<{ id: number; stream: string; text: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const logRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    setTimeout(() => {
      if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
    }, 0);
  };

  // If the board was already running when we mounted, open the SSE stream
  useEffect(() => {
    if (board.setup_status !== "running") return;
    openLogStream();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function openLogStream() {
    setPhase("running");
    const source = new EventSource(`/api/boards/${board.id}/setup/logs`);

    source.addEventListener("log", (e) => {
      const log = JSON.parse(e.data) as { id: number; stream: string; text: string };
      setLogs((prev) => [...prev, log]);
      scrollToBottom();
    });

    source.addEventListener("done", (e) => {
      const { status } = JSON.parse(e.data) as { status: string };
      setPhase(status === "success" ? "success" : "failed");
      source.close();
      if (status === "success") {
        setTimeout(onSetupComplete, 800);
      }
    });

    source.onerror = () => {
      setPhase("failed");
      source.close();
    };
  }

  const handleRun = async () => {
    setSaving(true);
    setError(null);
    setLogs([]);

    try {
      // Save any filled param values first
      const filled = Object.fromEntries(
        Object.entries(values).filter(([, v]) => v.trim())
      );
      if (Object.keys(filled).length > 0) {
        await api.setup.saveParams(board.id, filled);
      }

      const result = await api.setup.runSetup(board.id) as { ok?: boolean; missing?: { key: string; label: string }[] };
      if (result.missing) {
        setError(`Missing required parameters: ${result.missing.map((m) => m.label).join(", ")}`);
        setSaving(false);
        return;
      }

      openLogStream();
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  };

  const handleRetry = async () => {
    await api.setup.reset(board.id);
    setPhase("params");
    setLogs([]);
    setError(null);
  };

  const allRequiredFilled = params
    .filter((p) => p.required)
    .every((p) => values[p.key]?.trim());

  const canRun = params.length === 0 || allRequiredFilled;

  return (
    <div className="flex flex-col items-center justify-center min-h-full px-6 py-12">
      <div className="w-full max-w-xl">
        {/* Header */}
        <div className="mb-8">
          <p className="text-xs font-medium text-indigo-600 uppercase tracking-wide mb-1">Board setup</p>
          <h1 className="text-2xl font-bold text-gray-900">{board.name}</h1>
          <p className="text-sm text-gray-500 mt-1">
            This board has a one-time setup pipeline. Fill in the parameters and run it to unlock the board.
          </p>
        </div>

        {/* Parameter form */}
        {params.length > 0 && phase !== "running" && phase !== "success" && (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 mb-5">
            <h2 className="text-sm font-semibold text-gray-800 mb-4">Board parameters</h2>
            <div className="flex flex-col gap-4">
              {params.map((param) => (
                <div key={param.key}>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    {param.label}
                    {param.required && <span className="ml-1 text-red-500">*</span>}
                    {param.type === "secret" && (
                      <span className="ml-2 text-xs font-normal text-gray-400">secret</span>
                    )}
                  </label>
                  {param.description && (
                    <p className="text-xs text-gray-400 mb-1.5">{param.description}</p>
                  )}
                  <input
                    type={param.type === "secret" ? "password" : "text"}
                    value={values[param.key] ?? ""}
                    onChange={(e) =>
                      setValues((prev) => ({ ...prev, [param.key]: e.target.value }))
                    }
                    placeholder={param.key}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Setup pipeline preview */}
        {board.setup_pipeline_json && phase === "params" && (
          <div className="bg-gray-50 rounded-lg border border-gray-200 px-4 py-3 mb-5">
            <p className="text-xs text-gray-500">
              <span className="font-medium text-gray-700">Setup pipeline: </span>
              {(() => {
                try {
                  const p = JSON.parse(board.setup_pipeline_json);
                  if (p.type === "shell") return `Shell — ${p.steps?.length ?? 0} step(s)`;
                  if (p.type === "agent") return `Agent — ${p.prompt?.slice(0, 60)}…`;
                  return p.type;
                } catch { return "invalid pipeline"; }
              })()}
            </p>
          </div>
        )}

        {/* Error */}
        {error && (
          <p className="text-sm text-red-500 mb-4">{error}</p>
        )}

        {/* Run button / status */}
        {phase === "params" || phase === "failed" ? (
          <div className="flex gap-3">
            {phase === "failed" && (
              <button
                onClick={handleRetry}
                className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Reset & retry
              </button>
            )}
            <button
              onClick={handleRun}
              disabled={saving || !canRun}
              className="flex-1 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-40"
            >
              {saving ? "Starting…" : phase === "failed" ? "Run setup again" : "Run setup"}
            </button>
          </div>
        ) : phase === "success" ? (
          <div className="flex items-center gap-2 text-green-600">
            <span className="text-lg">✓</span>
            <span className="text-sm font-medium">Setup complete — entering board…</span>
          </div>
        ) : null}

        {/* Log stream */}
        {(phase === "running" || phase === "success" || phase === "failed") && logs.length > 0 && (
          <div className="mt-6">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-medium text-gray-500">Setup output</span>
              {phase === "running" && (
                <span className="inline-block w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
              )}
              {phase === "failed" && (
                <span className="text-xs text-red-500 font-medium">Failed</span>
              )}
            </div>
            <div
              ref={logRef}
              className="bg-gray-900 rounded-lg p-4 max-h-72 overflow-auto font-mono text-xs"
            >
              {logs.map((log, i) => (
                <div
                  key={i}
                  className={
                    log.stream === "stderr"
                      ? "text-red-400"
                      : log.stream === "agent"
                      ? "text-gray-300"
                      : "text-green-300"
                  }
                >
                  {log.text}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
