import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useRef } from "react";
import { api } from "../api/client";
import type { Board } from "../api/types";

type CreateMode = null | "blank" | "ai";
type AIBuildState = "idle" | "streaming" | "done" | "error";

export function HomePage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [createMode, setCreateMode] = useState<CreateMode>(null);

  // Blank board state
  const [newName, setNewName] = useState("");

  // AI builder state
  const [aiPrompt, setAIPrompt] = useState("");
  const [aiBuildState, setAIBuildState] = useState<AIBuildState>("idle");
  const [aiLog, setAILog] = useState("");
  const [aiError, setAIError] = useState<string | null>(null);
  const logRef = useRef<HTMLPreElement>(null);

  const { data: boards = [], isLoading } = useQuery({
    queryKey: ["boards"],
    queryFn: api.boards.list,
  });

  const createBlankMutation = useMutation({
    mutationFn: (name: string) => api.boards.create(name),
    onSuccess: (board) => {
      qc.invalidateQueries({ queryKey: ["boards"] });
      navigate({ to: "/boards/$boardId", params: { boardId: board.id } });
    },
  });

  const handleBlankCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (newName.trim()) createBlankMutation.mutate(newName.trim());
  };

  const handleAIBuild = async () => {
    if (!aiPrompt.trim()) return;
    setAIBuildState("streaming");
    setAILog("");
    setAIError(null);

    try {
      const board = await api.boards.buildFromPrompt(aiPrompt, (text) => {
        setAILog((prev) => {
          const next = prev + text;
          setTimeout(() => {
            if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
          }, 0);
          return next;
        });
      });
      setAIBuildState("done");
      qc.invalidateQueries({ queryKey: ["boards"] });
      navigate({ to: "/boards/$boardId", params: { boardId: board.id } });
    } catch (err) {
      setAIError(String(err));
      setAIBuildState("error");
    }
  };

  const resetCreateMode = () => {
    setCreateMode(null);
    setNewName("");
    setAIPrompt("");
    setAILog("");
    setAIError(null);
    setAIBuildState("idle");
  };

  return (
    <div className="max-w-3xl mx-auto px-6 py-10">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Boards</h1>
        {createMode === null && (
          <button
            onClick={() => setCreateMode("blank")}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700"
          >
            New board
          </button>
        )}
      </div>

      {/* Mode picker */}
      {createMode !== null && (
        <div className="mb-6 border border-gray-200 rounded-xl overflow-hidden">
          {/* Tab bar */}
          <div className="flex border-b border-gray-200">
            <button
              onClick={() => setCreateMode("blank")}
              className={`px-5 py-3 text-sm font-medium ${
                createMode === "blank"
                  ? "text-indigo-600 border-b-2 border-indigo-600 -mb-px bg-white"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              Start blank
            </button>
            <button
              onClick={() => setCreateMode("ai")}
              className={`px-5 py-3 text-sm font-medium ${
                createMode === "ai"
                  ? "text-indigo-600 border-b-2 border-indigo-600 -mb-px bg-white"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              Describe with AI
            </button>
            <button
              onClick={resetCreateMode}
              className="ml-auto px-4 text-gray-400 hover:text-gray-600 text-lg"
              aria-label="Close"
            >
              ✕
            </button>
          </div>

          {/* Blank board form */}
          {createMode === "blank" && (
            <form onSubmit={handleBlankCreate} className="flex gap-2 p-4">
              <input
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Board name"
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <button
                type="submit"
                disabled={createBlankMutation.isPending || !newName.trim()}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
              >
                {createBlankMutation.isPending ? "Creating…" : "Create"}
              </button>
            </form>
          )}

          {/* AI builder */}
          {createMode === "ai" && (
            <div className="p-4 flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <label className="text-xs font-medium text-gray-700">
                  Describe the workflow you want to build
                </label>
                <textarea
                  autoFocus
                  value={aiPrompt}
                  onChange={(e) => setAIPrompt(e.target.value)}
                  placeholder='e.g. "A code review board — Needs Review, In Review where an agent reviews PRs and posts comments, Approved, Merged"'
                  rows={3}
                  disabled={aiBuildState === "streaming"}
                  className="w-full text-sm border border-gray-300 rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                />
                {(aiBuildState === "idle" || aiBuildState === "error") && (
                  <button
                    onClick={handleAIBuild}
                    disabled={!aiPrompt.trim()}
                    className="self-end px-4 py-1.5 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-40"
                  >
                    Build board
                  </button>
                )}
              </div>

              {(aiBuildState === "streaming" || (aiBuildState === "error" && aiLog)) && (
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-gray-500">
                      {aiBuildState === "streaming" ? "Designing your board…" : "Agent output"}
                    </span>
                    {aiBuildState === "streaming" && (
                      <span className="inline-block w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
                    )}
                  </div>
                  <pre
                    ref={logRef}
                    className="text-xs text-gray-700 bg-gray-50 border border-gray-200 rounded-lg p-3 max-h-56 overflow-auto whitespace-pre-wrap font-mono"
                  >
                    {aiLog}
                  </pre>
                </div>
              )}

              {aiBuildState === "error" && aiError && (
                <div className="flex flex-col gap-2">
                  <p className="text-xs text-red-500">{aiError}</p>
                  <button
                    onClick={() => {
                      setAIBuildState("idle");
                      setAILog("");
                      setAIError(null);
                    }}
                    className="self-start text-xs text-indigo-600 hover:underline"
                  >
                    Try again
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {isLoading ? (
        <p className="text-gray-500 text-sm">Loading…</p>
      ) : boards.length === 0 ? (
        <p className="text-gray-500 text-sm">No boards yet. Create one to get started.</p>
      ) : (
        <ul className="space-y-2">
          {boards.map((board: Board) => (
            <li key={board.id}>
              <Link
                to="/boards/$boardId"
                params={{ boardId: board.id }}
                className="block px-4 py-3 bg-white border border-gray-200 rounded-lg hover:border-indigo-400 hover:shadow-sm transition-all"
              >
                <span className="font-medium">{board.name}</span>
                <span className="text-xs text-gray-400 ml-3">
                  {new Date(board.created_at).toLocaleDateString()}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
