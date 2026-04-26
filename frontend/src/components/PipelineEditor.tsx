import { useState } from "react";
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
  const [value, setValue] = useState(
    pipeline ? JSON.stringify(JSON.parse(pipeline.definition_json), null, 2) : SHELL_PLACEHOLDER
  );
  const [error, setError] = useState<string | null>(null);

  const saveMutation = useMutation({
    mutationFn: (json: string) => api.pipelines.save(columnId, JSON.parse(json)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pipelines", boardId] });
      onClose();
    },
    onError: (err) => setError(String(err)),
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.pipelines.delete(columnId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pipelines", boardId] });
      onClose();
    },
  });

  const handleSave = () => {
    setError(null);
    try {
      JSON.parse(value);
    } catch {
      setError("Invalid JSON");
      return;
    }
    saveMutation.mutate(value);
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-2xl w-[600px] max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <h2 className="text-sm font-semibold text-gray-800">Column Pipeline</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-lg leading-none"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-auto p-4">
          <textarea
            value={value}
            onChange={(e) => setValue(e.target.value)}
            spellCheck={false}
            className="w-full h-72 font-mono text-xs border border-gray-300 rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none bg-gray-50"
          />
          {error && <p className="mt-2 text-xs text-red-500">{error}</p>}
          {saveMutation.error && (
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
              onClick={handleSave}
              disabled={saveMutation.isPending}
              className="px-4 py-1.5 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
            >
              {saveMutation.isPending ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
