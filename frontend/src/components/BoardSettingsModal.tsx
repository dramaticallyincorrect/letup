import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import type { Board, BoardParam } from "../api/types";

const PARAMS_PLACEHOLDER = JSON.stringify(
  [{ key: "GITHUB_TOKEN", label: "GitHub Token", description: "Personal access token with repo scope", type: "secret", required: true }],
  null,
  2
);

const SETUP_PLACEHOLDER = JSON.stringify(
  { type: "shell", steps: [{ label: "Init workspace", command: "git init" }], parameters: [] },
  null,
  2
);

export function BoardSettingsModal({
  board,
  onClose,
}: {
  board: Board;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const params: BoardParam[] = (() => {
    try { return JSON.parse(board.parameters_json || "[]"); } catch { return []; }
  })();

  const [tab, setTab] = useState<"params" | "advanced">("params");

  // Params tab — fill values
  const [paramValues, setParamValues] = useState<Record<string, string>>(
    Object.fromEntries(params.map((p) => [p.key, ""]))
  );
  const [paramsSaved, setParamsSaved] = useState(false);

  // Advanced tab — raw JSON editors
  const [paramsJson, setParamsJson] = useState(
    params.length > 0
      ? JSON.stringify(params, null, 2)
      : PARAMS_PLACEHOLDER
  );
  const [setupJson, setSetupJson] = useState(
    board.setup_pipeline_json
      ? JSON.stringify(JSON.parse(board.setup_pipeline_json), null, 2)
      : SETUP_PLACEHOLDER
  );
  const [advancedError, setAdvancedError] = useState<string | null>(null);

  const saveParamsMutation = useMutation({
    mutationFn: () => {
      const filled = Object.fromEntries(
        Object.entries(paramValues).filter(([, v]) => v.trim())
      );
      return api.setup.saveParams(board.id, filled);
    },
    onSuccess: () => {
      setParamsSaved(true);
      setTimeout(() => setParamsSaved(false), 2000);
    },
  });

  const saveAdvancedMutation = useMutation({
    mutationFn: () => {
      setAdvancedError(null);
      let parsedParams: unknown, parsedSetup: unknown | null = null;
      try { parsedParams = JSON.parse(paramsJson); } catch { throw new Error("parameters_json is not valid JSON"); }
      if (setupJson.trim()) {
        try { parsedSetup = JSON.parse(setupJson); } catch { throw new Error("setup_pipeline_json is not valid JSON"); }
      }
      return api.boards.update(board.id, {
        parameters_json: JSON.stringify(parsedParams),
        setup_pipeline_json: parsedSetup ? JSON.stringify(parsedSetup) : null,
      });
    },
    onSuccess: (updated) => {
      qc.setQueryData(["board", board.id], updated);
      qc.invalidateQueries({ queryKey: ["board", board.id] });
      onClose();
    },
    onError: (err) => setAdvancedError(String(err)),
  });

  const resetMutation = useMutation({
    mutationFn: () => api.setup.reset(board.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["board", board.id] });
      onClose();
    },
  });

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-2xl w-[580px] max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-semibold text-gray-800">Board settings</h2>
            <div className="flex rounded-md border border-gray-200 overflow-hidden text-xs">
              <button
                onClick={() => setTab("params")}
                className={`px-3 py-1 ${tab === "params" ? "bg-indigo-600 text-white" : "text-gray-600 hover:bg-gray-50"}`}
              >
                Parameters
              </button>
              <button
                onClick={() => setTab("advanced")}
                className={`px-3 py-1 ${tab === "advanced" ? "bg-indigo-600 text-white" : "text-gray-600 hover:bg-gray-50"}`}
              >
                Advanced
              </button>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg">✕</button>
        </div>

        {/* Parameters tab */}
        {tab === "params" && (
          <div className="flex-1 overflow-auto p-5">
            {params.length === 0 ? (
              <p className="text-sm text-gray-500">
                No board parameters defined. Add them in the Advanced tab.
              </p>
            ) : (
              <div className="flex flex-col gap-4">
                <p className="text-xs text-gray-500">
                  These values are encrypted and stored securely. Leave fields blank to keep existing values.
                </p>
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
                      value={paramValues[param.key] ?? ""}
                      onChange={(e) =>
                        setParamValues((prev) => ({ ...prev, [param.key]: e.target.value }))
                      }
                      placeholder={param.type === "secret" ? "••••••••" : param.key}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                ))}
                <div className="flex items-center gap-3 mt-2">
                  <button
                    onClick={() => saveParamsMutation.mutate()}
                    disabled={saveParamsMutation.isPending}
                    className="px-4 py-1.5 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                  >
                    {saveParamsMutation.isPending ? "Saving…" : paramsSaved ? "Saved ✓" : "Save parameters"}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Advanced tab */}
        {tab === "advanced" && (
          <div className="flex-1 overflow-auto p-5 flex flex-col gap-5">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Board parameters definition
                <span className="ml-2 font-normal text-gray-400">JSON array of parameter definitions</span>
              </label>
              <textarea
                value={paramsJson}
                onChange={(e) => setParamsJson(e.target.value)}
                spellCheck={false}
                rows={6}
                className="w-full font-mono text-xs border border-gray-300 rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none bg-gray-50"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Setup pipeline
                <span className="ml-2 font-normal text-gray-400">JSON pipeline definition (leave empty for none)</span>
              </label>
              <textarea
                value={setupJson}
                onChange={(e) => setSetupJson(e.target.value)}
                spellCheck={false}
                rows={8}
                className="w-full font-mono text-xs border border-gray-300 rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none bg-gray-50"
              />
            </div>

            {advancedError && <p className="text-xs text-red-500">{advancedError}</p>}

            {board.setup_pipeline_json && (
              <div className="border-t border-gray-200 pt-4">
                <p className="text-xs text-gray-500 mb-2">
                  Setup status: <span className="font-medium">{board.setup_status}</span>
                </p>
                {(board.setup_status === "success" || board.setup_status === "failed") && (
                  <button
                    onClick={() => resetMutation.mutate()}
                    disabled={resetMutation.isPending}
                    className="text-xs text-red-500 hover:text-red-700"
                  >
                    Reset setup (allows re-running)
                  </button>
                )}
              </div>
            )}

            <div className="flex gap-2 justify-end">
              <button
                onClick={onClose}
                className="px-4 py-1.5 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => saveAdvancedMutation.mutate()}
                disabled={saveAdvancedMutation.isPending}
                className="px-4 py-1.5 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
              >
                {saveAdvancedMutation.isPending ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
