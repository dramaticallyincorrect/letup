import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../api/client";
import type { Board } from "../api/types";

export function HomePage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);

  const { data: boards = [], isLoading } = useQuery({
    queryKey: ["boards"],
    queryFn: api.boards.list,
  });

  const createMutation = useMutation({
    mutationFn: (name: string) => api.boards.create(name),
    onSuccess: (board) => {
      qc.invalidateQueries({ queryKey: ["boards"] });
      setNewName("");
      setCreating(false);
      navigate({ to: "/boards/$boardId", params: { boardId: board.id } });
    },
  });

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (newName.trim()) createMutation.mutate(newName.trim());
  };

  return (
    <div className="max-w-3xl mx-auto px-6 py-10">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Boards</h1>
        <button
          onClick={() => setCreating(true)}
          className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700"
        >
          New board
        </button>
      </div>

      {creating && (
        <form onSubmit={handleCreate} className="mb-6 flex gap-2">
          <input
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Board name"
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <button
            type="submit"
            disabled={createMutation.isPending}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
          >
            Create
          </button>
          <button
            type="button"
            onClick={() => setCreating(false)}
            className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50"
          >
            Cancel
          </button>
        </form>
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
