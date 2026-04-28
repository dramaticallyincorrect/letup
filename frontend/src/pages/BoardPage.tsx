import { useParams } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragOverEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useState } from "react";
import { api } from "../api/client";
import type { Column, Card, Pipeline, MissingParam } from "../api/types";
import { PipelineEditor } from "../components/PipelineEditor";
import { ParameterForm } from "../components/ParameterForm";
import { ExecutionDrawer, ExecutionStatusDot } from "../components/ExecutionDrawer";
import { BoardSetupView } from "../components/BoardSetupView";
import { BoardSettingsModal } from "../components/BoardSettingsModal";
import { CardContentRenderer } from "../components/CardRenderer";
import type { ExecutionStatus } from "../api/types";

// ─── SortableCard ─────────────────────────────────────────────────────────────

function SortableCard({
  card,
  onDelete,
  executionStatus,
  onOpenExecution,
  rendererJs,
  onUpdateMetadata,
}: {
  card: Card;
  onDelete: (id: string) => void;
  executionStatus?: ExecutionStatus;
  onOpenExecution?: () => void;
  rendererJs?: string | null;
  onUpdateMetadata: (cardId: string, patch: object) => Promise<void>;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: card.id, data: { type: "card", card } });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`bg-white rounded-lg border border-gray-200 px-3 py-2.5 shadow-sm cursor-grab active:cursor-grabbing select-none group ${
        isDragging ? "opacity-40" : ""
      }`}
      {...attributes}
      {...listeners}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          {executionStatus && (
            <button
              onPointerDown={(e) => e.stopPropagation()}
              onClick={onOpenExecution}
              title="View execution logs"
            >
              <ExecutionStatusDot status={executionStatus} />
            </button>
          )}
          <span className="text-sm font-medium text-gray-800 leading-snug truncate">
            {card.title}
          </span>
        </div>
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => onDelete(card.id)}
          className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 text-xs shrink-0 mt-0.5"
        >
          ✕
        </button>
      </div>
      {card.description && (
        <p className="text-xs text-gray-500 mt-1 line-clamp-2">{card.description}</p>
      )}
      <CardContentRenderer
        card={card}
        rendererJs={rendererJs}
        updateMetadata={(patch) => onUpdateMetadata(card.id, patch)}
      />
    </div>
  );
}

function CardGhost({ card }: { card: Card }) {
  return (
    <div className="bg-white rounded-lg border border-indigo-400 px-3 py-2.5 shadow-lg cursor-grabbing select-none opacity-90 rotate-1">
      <span className="text-sm font-medium text-gray-800">{card.title}</span>
    </div>
  );
}

// ─── ColumnView ───────────────────────────────────────────────────────────────

function ColumnView({
  column,
  cards,
  pipeline,
  onDeleteCard,
  onDeleteColumn,
  onRenameColumn,
  onAddCard,
  onOpenPipeline,
  isOver,
  cardExecutionStatuses,
  onOpenExecution,
  onUpdateMetadata,
}: {
  column: Column;
  cards: Card[];
  pipeline: Pipeline | undefined;
  onDeleteCard: (id: string) => void;
  onDeleteColumn: (id: string) => void;
  onRenameColumn: (id: string, name: string) => void;
  onAddCard: (columnId: string, title: string) => void;
  onOpenPipeline: (columnId: string) => void;
  isOver: boolean;
  cardExecutionStatuses: Record<string, { status: ExecutionStatus; executionId: string }>;
  onOpenExecution: (executionId: string) => void;
  onUpdateMetadata: (cardId: string, patch: object) => Promise<void>;
}) {
  const [addingCard, setAddingCard] = useState(false);
  const [newCardTitle, setNewCardTitle] = useState("");
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState(column.name);

  const { setNodeRef } = useSortable({
    id: column.id,
    data: { type: "column", column },
  });

  const handleAddCard = (e: React.FormEvent) => {
    e.preventDefault();
    if (newCardTitle.trim()) {
      onAddCard(column.id, newCardTitle.trim());
      setNewCardTitle("");
      setAddingCard(false);
    }
  };

  const handleRename = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (nameValue.trim() && nameValue.trim() !== column.name) {
      onRenameColumn(column.id, nameValue.trim());
    }
    setEditingName(false);
  };

  return (
    <div
      ref={setNodeRef}
      className={`flex flex-col w-72 shrink-0 rounded-xl bg-gray-100 border-2 transition-colors ${
        isOver ? "border-indigo-400 bg-indigo-50" : "border-transparent"
      }`}
    >
      <div className="flex items-center justify-between px-3 pt-3 pb-2 gap-2 group">
        {editingName ? (
          <form onSubmit={handleRename} className="flex-1">
            <input
              autoFocus
              value={nameValue}
              onChange={(e) => setNameValue(e.target.value)}
              onBlur={() => handleRename()}
              className="w-full text-sm font-semibold text-gray-700 bg-white border border-indigo-400 rounded px-2 py-0.5 focus:outline-none"
            />
          </form>
        ) : (
          <button
            onClick={() => {
              setEditingName(true);
              setNameValue(column.name);
            }}
            className="text-sm font-semibold text-gray-700 hover:text-indigo-600 text-left"
          >
            {column.name}
          </button>
        )}
        <div className="flex items-center gap-1 shrink-0">
          <span className="text-xs text-gray-400">{cards.length}</span>
          <button
            onClick={() => onOpenPipeline(column.id)}
            title={pipeline ? "Edit pipeline" : "Add pipeline"}
            className={`text-xs px-1.5 py-0.5 rounded transition-colors ${
              pipeline
                ? "text-indigo-600 bg-indigo-100 hover:bg-indigo-200"
                : "text-gray-400 hover:text-indigo-600 hover:bg-indigo-50"
            }`}
          >
            ⚡
          </button>
          <button
            onClick={() => onDeleteColumn(column.id)}
            className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 text-xs"
          >
            ✕
          </button>
        </div>
      </div>

      <SortableContext items={cards.map((c) => c.id)} strategy={verticalListSortingStrategy}>
        <div className="flex flex-col gap-2 px-2 min-h-[2rem] flex-1">
          {cards.map((card) => {
            const exec = cardExecutionStatuses[card.id];
            return (
              <SortableCard
                key={card.id}
                card={card}
                onDelete={onDeleteCard}
                executionStatus={exec?.status}
                onOpenExecution={exec ? () => onOpenExecution(exec.executionId) : undefined}
                rendererJs={pipeline?.renderer_js}
                onUpdateMetadata={onUpdateMetadata}
              />
            );
          })}
        </div>
      </SortableContext>

      <div className="px-2 pb-2 pt-1">
        {addingCard ? (
          <form onSubmit={handleAddCard} className="flex flex-col gap-1">
            <input
              autoFocus
              value={newCardTitle}
              onChange={(e) => setNewCardTitle(e.target.value)}
              placeholder="Card title"
              className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
            />
            <div className="flex gap-1">
              <button
                type="submit"
                className="px-3 py-1 bg-indigo-600 text-white text-xs rounded-md hover:bg-indigo-700"
              >
                Add
              </button>
              <button
                type="button"
                onClick={() => setAddingCard(false)}
                className="px-3 py-1 text-xs text-gray-500 hover:bg-gray-200 rounded-md"
              >
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <button
            onClick={() => setAddingCard(true)}
            className="w-full text-left text-xs text-gray-500 hover:text-indigo-600 px-2 py-1.5 rounded-md hover:bg-gray-200 transition-colors"
          >
            + Add card
          </button>
        )}
      </div>
    </div>
  );
}

// ─── BoardPage ─────────────────────────────────────────────────────────────────

export function BoardPage() {
  const { boardId } = useParams({ from: "/boards/$boardId" });
  const qc = useQueryClient();

  const { data: board } = useQuery({
    queryKey: ["board", boardId],
    queryFn: () => api.boards.get(boardId),
  });

  const { data: columns = [] } = useQuery({
    queryKey: ["columns", boardId],
    queryFn: () => api.columns.list(boardId),
  });

  const { data: allCards = [] } = useQuery({
    queryKey: ["cards", boardId],
    queryFn: () => api.cards.listByBoard(boardId),
  });

  const { data: pipelines = {} } = useQuery({
    queryKey: ["pipelines", boardId],
    queryFn: () => api.pipelines.listByBoard(boardId),
  });

  const [showSettings, setShowSettings] = useState(false);
  const [addingColumn, setAddingColumn] = useState(false);
  const [newColName, setNewColName] = useState("");
  const [activeCard, setActiveCard] = useState<Card | null>(null);
  const [overColumnId, setOverColumnId] = useState<string | null>(null);
  const [pipelineEditorColumnId, setPipelineEditorColumnId] = useState<string | null>(null);
  const [openExecutionId, setOpenExecutionId] = useState<string | null>(null);
  // cardId → { status, executionId }
  const [cardExecutionStatuses, setCardExecutionStatuses] = useState<
    Record<string, { status: ExecutionStatus; executionId: string }>
  >({});
  const [pendingTrigger, setPendingTrigger] = useState<{
    cardId: string;
    columnId: string;
    missing: MissingParam[];
  } | null>(null);
  const [paramFormSaving, setParamFormSaving] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const addColumnMutation = useMutation({
    mutationFn: (name: string) => api.columns.create(boardId, name),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["columns", boardId] }),
  });

  const deleteColumnMutation = useMutation({
    mutationFn: api.columns.delete,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["columns", boardId] });
      qc.invalidateQueries({ queryKey: ["cards", boardId] });
    },
  });

  const renameColumnMutation = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      api.columns.update(id, name),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["columns", boardId] }),
  });

  const addCardMutation = useMutation({
    mutationFn: ({ columnId, title }: { columnId: string; title: string }) =>
      api.cards.create(columnId, title),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["cards", boardId] }),
  });

  const deleteCardMutation = useMutation({
    mutationFn: api.cards.delete,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["cards", boardId] }),
  });

  const updateMetadataMutation = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: object }) =>
      api.cards.patchMetadata(id, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["cards", boardId] }),
  });

  const moveCardMutation = useMutation({
    mutationFn: ({
      id,
      columnId,
      position,
    }: {
      id: string;
      columnId: string;
      position: number;
    }) => api.cards.move(id, columnId, position),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["cards", boardId] }),
  });

  const cardsByColumn = (columnId: string) =>
    allCards
      .filter((c: Card) => c.column_id === columnId)
      .sort((a: Card, b: Card) => a.position - b.position);

  const handleDragStart = (event: DragStartEvent) => {
    if (event.active.data.current?.type === "card") {
      setActiveCard(event.active.data.current.card as Card);
    }
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event;
    if (!over || active.data.current?.type !== "card") return;
    if (over.data.current?.type === "column") {
      setOverColumnId(over.id as string);
    } else if (over.data.current?.type === "card") {
      setOverColumnId((over.data.current.card as Card).column_id);
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveCard(null);
    setOverColumnId(null);
    if (!over || active.data.current?.type !== "card") return;

    const card = active.data.current.card as Card;
    let targetColumnId: string;
    let targetPosition: number;

    if (over.data.current?.type === "column") {
      targetColumnId = over.id as string;
      targetPosition = cardsByColumn(targetColumnId).length;
    } else if (over.data.current?.type === "card") {
      const overCard = over.data.current.card as Card;
      targetColumnId = overCard.column_id;
      const siblings = cardsByColumn(targetColumnId);
      targetPosition = siblings.findIndex((c: Card) => c.id === overCard.id);
      if (targetPosition === -1) targetPosition = siblings.length;
    } else {
      return;
    }

    if (card.column_id === targetColumnId && card.position === targetPosition) return;

    moveCardMutation.mutate({ id: card.id, columnId: targetColumnId, position: targetPosition });

    if (pipelines[targetColumnId]) {
      fireTrigger(card.id, targetColumnId);
    }
  };

  const fireTrigger = (cardId: string, columnId: string) => {
    setCardExecutionStatuses((prev) => ({
      ...prev,
      [cardId]: { status: "pending", executionId: "" },
    }));
    api.executions.trigger(cardId, columnId).then((result) => {
      if ("missing" in result) {
        setCardExecutionStatuses((prev) => {
          const next = { ...prev };
          delete next[cardId];
          return next;
        });
        setPendingTrigger({ cardId, columnId, missing: result.missing });
        return;
      }

      const { executionId } = result;
      setCardExecutionStatuses((prev) => ({
        ...prev,
        [cardId]: { status: "running", executionId },
      }));
      setOpenExecutionId(executionId);

      const source = new EventSource(`/api/executions/${executionId}/logs`);
      source.addEventListener("done", (e) => {
        const { status: finalStatus } = JSON.parse(e.data) as { status: ExecutionStatus };
        setCardExecutionStatuses((prev) => ({
          ...prev,
          [cardId]: { status: finalStatus, executionId },
        }));
        source.close();
        qc.invalidateQueries({ queryKey: ["cards", boardId] });
      });
      source.onerror = () => {
        setCardExecutionStatuses((prev) => ({
          ...prev,
          [cardId]: { status: "failed", executionId },
        }));
        source.close();
      };
    }).catch(() => {
      setCardExecutionStatuses((prev) => {
        const next = { ...prev };
        delete next[cardId];
        return next;
      });
    });
  };

  const handleParamSave = async (values: Record<string, string>) => {
    if (!pendingTrigger) return;
    setParamFormSaving(true);
    try {
      await api.parameters.save("pipeline", pendingTrigger.columnId, values);
      const { cardId, columnId } = pendingTrigger;
      setPendingTrigger(null);
      fireTrigger(cardId, columnId);
    } finally {
      setParamFormSaving(false);
    }
  };

  const handleAddColumn = (e: React.FormEvent) => {
    e.preventDefault();
    if (newColName.trim()) {
      addColumnMutation.mutate(newColName.trim());
      setNewColName("");
      setAddingColumn(false);
    }
  };

  // Gate: if board has a setup pipeline and it hasn't completed, show setup view
  if (board && board.setup_pipeline_json && board.setup_status !== "success") {
    return (
      <div className="flex flex-col h-full">
        <div className="px-6 py-4 border-b border-gray-200 bg-white shrink-0 flex items-center justify-between">
          <h1 className="text-xl font-bold text-gray-900">{board.name}</h1>
        </div>
        <div className="flex-1 overflow-auto">
          <BoardSetupView
            board={board}
            onSetupComplete={() => qc.invalidateQueries({ queryKey: ["board", boardId] })}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 py-4 border-b border-gray-200 bg-white shrink-0 flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">{board?.name ?? "…"}</h1>
        {board && (
          <button
            onClick={() => setShowSettings(true)}
            title="Board settings"
            className="text-gray-400 hover:text-gray-600 text-sm px-2 py-1 rounded hover:bg-gray-100"
          >
            ⚙
          </button>
        )}
      </div>

      <div className="flex-1 overflow-x-auto p-6">
        <DndContext
          sensors={sensors}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
        >
          <div className="flex gap-4 items-start">
            <SortableContext
              items={columns.map((c: Column) => c.id)}
              strategy={verticalListSortingStrategy}
            >
              {columns.map((col: Column) => (
                <ColumnView
                  key={col.id}
                  column={col}
                  cards={cardsByColumn(col.id)}
                  pipeline={pipelines[col.id]}
                  isOver={overColumnId === col.id}
                  onDeleteCard={(id) => deleteCardMutation.mutate(id)}
                  onDeleteColumn={(id) => deleteColumnMutation.mutate(id)}
                  onRenameColumn={(id, name) => renameColumnMutation.mutate({ id, name })}
                  onAddCard={(columnId, title) => addCardMutation.mutate({ columnId, title })}
                  onOpenPipeline={(columnId) => setPipelineEditorColumnId(columnId)}
                  cardExecutionStatuses={cardExecutionStatuses}
                  onOpenExecution={(execId) => setOpenExecutionId(execId)}
                  onUpdateMetadata={(cardId, patch) =>
                    updateMetadataMutation.mutateAsync({ id: cardId, patch }).then(() => {})
                  }
                />
              ))}
            </SortableContext>

            {addingColumn ? (
              <form onSubmit={handleAddColumn} className="flex flex-col gap-2 w-72 shrink-0">
                <input
                  autoFocus
                  value={newColName}
                  onChange={(e) => setNewColName(e.target.value)}
                  placeholder="Column name"
                  className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                />
                <div className="flex gap-2">
                  <button
                    type="submit"
                    className="px-4 py-1.5 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700"
                  >
                    Add
                  </button>
                  <button
                    type="button"
                    onClick={() => setAddingColumn(false)}
                    className="px-4 py-1.5 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <button
                onClick={() => setAddingColumn(true)}
                className="w-72 shrink-0 px-4 py-3 rounded-xl border-2 border-dashed border-gray-300 text-sm text-gray-500 hover:border-indigo-400 hover:text-indigo-600 hover:bg-white/50 transition-colors text-left"
              >
                + Add column
              </button>
            )}
          </div>

          <DragOverlay>
            {activeCard ? <CardGhost card={activeCard} /> : null}
          </DragOverlay>
        </DndContext>
      </div>

      {pipelineEditorColumnId && (
        <PipelineEditor
          boardId={boardId}
          columnId={pipelineEditorColumnId}
          pipeline={pipelines[pipelineEditorColumnId]}
          onClose={() => setPipelineEditorColumnId(null)}
        />
      )}

      {pendingTrigger && (
        <ParameterForm
          missing={pendingTrigger.missing}
          saving={paramFormSaving}
          onSave={handleParamSave}
          onCancel={() => setPendingTrigger(null)}
        />
      )}

      {openExecutionId && (
        <ExecutionDrawer
          executionId={openExecutionId}
          onClose={() => setOpenExecutionId(null)}
        />
      )}

      {showSettings && board && (
        <BoardSettingsModal
          board={board}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  );
}
