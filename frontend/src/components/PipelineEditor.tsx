import { useState, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import type { Pipeline } from "../api/types";

const SHELL_PLACEHOLDER = JSON.stringify(
  {
    type: "shell",
    steps: [{ label: "List files", command: "ls -la" }],
    parameters: [],
  },
  null,
  2
);

type Mode = "ai" | "manual";
type BuildState = "idle" | "streaming" | "preview" | "error";

export function PipelineEditor({
  boardId,
  columnId,
  pipeline,
  onClose,
}: {
  boardId: string;
  columnId: string;
  pipeline: Pipeline | undefined;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [mode, setMode] = useState<Mode>(pipeline ? "manual" : "ai");

  // AI builder state
  const [prompt, setPrompt] = useState("");
  const [buildState, setBuildState] = useState<BuildState>("idle");
  const [logText, setLogText] = useState("");
  const [previewJson, setPreviewJson] = useState("");
  const [buildError, setBuildError] = useState<string | null>(null);
  const logRef = useRef<HTMLPreElement>(null);

  // Manual editor state
  const [manualValue, setManualValue] = useState(
    pipeline ? JSON.stringify(JSON.parse(pipeline.definition_json), null, 2) : SHELL_PLACEHOLDER
  );
  const [manualError, setManualError] = useState<string | null>(null);

  const saveMutation = useMutation({
    mutationFn: (json: string) => api.pipelines.save(columnId, JSON.parse(json)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pipelines", boardId] });
      onClose();
    },
    onError: (err) => setManualError(String(err)),
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.pipelines.delete(columnId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pipelines", boardId] });
      onClose();
    },
  });

  const handleBuild = async () => {
    if (!prompt.trim()) return;
    setBuildState("streaming");
    setLogText("");
    setPreviewJson("");
    setBuildError(null);

    try {
      const definition = await api.pipelines.buildFromPrompt(columnId, prompt, (text) => {
        setLogText((prev) => {
          const next = prev + text;
          // scroll log to bottom
          setTimeout(() => {
            if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
          }, 0);
          return next;
        });
      });

      setPreviewJson(JSON.stringify(definition, null, 2));
      setBuildState("preview");
    } catch (err) {
      setBuildError(String(err));
      setBuildState("error");
    }
  };

  const handleSavePreview = () => {
    saveMutation.mutate(previewJson);
  };

  const handleRegenerate = () => {
    setBuildState("idle");
    setLogText("");
    setPreviewJson("");
    setBuildError(null);
  };

  const handleManualSave = () => {
    setManualError(null);
    try {
      JSON.parse(manualValue);
    } catch {
      setManualError("Invalid JSON");
      return;
    }
    saveMutation.mutate(manualValue);
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-2xl w-[640px] max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-semibold text-gray-800">Column Pipeline</h2>
            <div className="flex rounded-md border border-gray-200 overflow-hidden text-xs">
              <button
                onClick={() => setMode("ai")}
                className={`px-3 py-1 ${mode === "ai" ? "bg-indigo-600 text-white" : "text-gray-600 hover:bg-gray-50"}`}
              >
                Build with AI
              </button>
              <button
                onClick={() => setMode("manual")}
                className={`px-3 py-1 ${mode === "manual" ? "bg-indigo-600 text-white" : "text-gray-600 hover:bg-gray-50"}`}
              >
                Edit JSON
              </button>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-lg leading-none"
          >
            ✕
          </button>
        </div>

        {/* AI Builder */}
        {mode === "ai" && (
          <div className="flex-1 overflow-auto p-5 flex flex-col gap-4">
            {/* Prompt input — always visible */}
            <div className="flex flex-col gap-2">
              <label className="text-xs font-medium text-gray-700">
                Describe what this column should do when a card is dragged in
              </label>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder='e.g. "Run pytest and fail if any tests fail"'
                rows={3}
                className="w-full text-sm border border-gray-300 rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                disabled={buildState === "streaming"}
              />
              {buildState === "idle" || buildState === "error" ? (
                <button
                  onClick={handleBuild}
                  disabled={!prompt.trim()}
                  className="self-end px-4 py-1.5 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-40"
                >
                  Generate pipeline
                </button>
              ) : null}
            </div>

            {/* Streaming log */}
            {(buildState === "streaming" || (buildState === "preview" && logText)) && (
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-gray-500">
                    {buildState === "streaming" ? "Thinking…" : "Agent output"}
                  </span>
                  {buildState === "streaming" && (
                    <span className="inline-block w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
                  )}
                </div>
                <pre
                  ref={logRef}
                  className="text-xs text-gray-700 bg-gray-50 border border-gray-200 rounded-lg p-3 max-h-48 overflow-auto whitespace-pre-wrap font-mono"
                >
                  {logText}
                </pre>
              </div>
            )}

            {/* Error */}
            {buildState === "error" && buildError && (
              <p className="text-xs text-red-500">{buildError}</p>
            )}

            {/* Preview */}
            {buildState === "preview" && (
              <div className="flex flex-col gap-2">
                <span className="text-xs font-medium text-gray-700">Generated pipeline</span>
                <pre className="text-xs font-mono bg-gray-50 border border-gray-200 rounded-lg p-3 max-h-48 overflow-auto whitespace-pre-wrap">
                  {previewJson}
                </pre>
                {saveMutation.isError && (
                  <p className="text-xs text-red-500">{String(saveMutation.error)}</p>
                )}
                <div className="flex gap-2 self-end">
                  <button
                    onClick={handleRegenerate}
                    className="px-4 py-1.5 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
                  >
                    Regenerate
                  </button>
                  <button
                    onClick={handleSavePreview}
                    disabled={saveMutation.isPending}
                    className="px-4 py-1.5 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                  >
                    {saveMutation.isPending ? "Saving…" : "Save pipeline"}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Manual JSON editor */}
        {mode === "manual" && (
          <>
            <div className="flex-1 overflow-auto p-4">
              <textarea
                value={manualValue}
                onChange={(e) => setManualValue(e.target.value)}
                spellCheck={false}
                className="w-full h-72 font-mono text-xs border border-gray-300 rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none bg-gray-50"
              />
              {manualError && <p className="mt-2 text-xs text-red-500">{manualError}</p>}
              {saveMutation.isError && (
                <p className="mt-2 text-xs text-red-500">{String(saveMutation.error)}</p>
              )}
            </div>
            <div className="flex items-center justify-between px-5 py-3 border-t border-gray-200">
              <div>
                {pipeline && (
                  <button
                    onClick={() => deleteMutation.mutate()}
                    disabled={deleteMutation.isPending}
                    className="text-xs text-red-500 hover:text-red-700"
                  >
                    Remove pipeline
                  </button>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={onClose}
                  className="px-4 py-1.5 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleManualSave}
                  disabled={saveMutation.isPending}
                  className="px-4 py-1.5 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                >
                  {saveMutation.isPending ? "Saving…" : "Save"}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
