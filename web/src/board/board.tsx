import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { DragDropProvider, useDraggable, useDroppable } from "@dnd-kit/react"
import { EllipsisIcon, LoaderCircle, PlusIcon } from "lucide-react"
import { useState } from "react"
import { flushSync } from "react-dom"
import { useParams } from "@tanstack/react-router"
import { useMutation, useQuery } from "@tanstack/react-query"
import * as client from "@repo/data"

const apiBaseUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:3000'



type BoardData = {
    name: string,
    columns: BoardColumn[]
}

type BoardColumn = {
    id: string,
    name: string,
    pipeline?: PipelineKind,
    cards: BoardCard[]
}

type BoardCard = {
    id: string,
    title: string,
    description: string,
    data: string | null,
}

type PipelineKind = 'shell' | 'agent'

export function Board({ boardId: boardId, data }: { boardId: string, data: BoardData }) {
    const [columns, setColumns] = useState(data.columns)

    async function handleAddColumn(name: string, prompt: string): Promise<void> {
        const res = await fetch(`${apiBaseUrl}/boards/${boardId}/columns`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, prompt }),
        })
        if (!res.ok || !res.body) throw new Error(`Failed to add column: ${res.status}`)

        const reader = res.body.getReader()

        return new Promise<void>((resolve, reject) => {
            async function process() {
                for await (const { event, data } of client.parseSSE(reader)) {
                    if (event === 'column') {
                        setColumns(cols => [...cols, { ...data, cards: [] }])
                        resolve()
                    } else if (event === 'error') {
                        reject(new Error(data.message ?? 'Agent error'))
                    }
                }
            }
            process().catch(err => reject(err))
        })
    }

    function handleCardAdded(columnId: string, card: BoardCard) {
        setColumns(cols => cols.map(col =>
            col.id === columnId ? { ...col, cards: [...col.cards, card] } : col
        ))
    }

    function handleCardMoved(cardId: string, destinationColumnId: string) {
        let previous: BoardColumn[] = []
        flushSync(() => {
            setColumns(cols => {
                previous = cols
                const sourceCol = cols.find(c => c.cards.some(card => card.id === cardId))
                if (!sourceCol || sourceCol.id === destinationColumnId) return cols
                const card = sourceCol.cards.find(c => c.id === cardId)!
                return cols.map(col => {
                    if (col.id === sourceCol.id) return { ...col, cards: col.cards.filter(c => c.id !== cardId) }
                    if (col.id === destinationColumnId) return { ...col, cards: [...col.cards, card] }
                    return col
                })
            })
        })
        client.moveCardToColumn(cardId, destinationColumnId).catch(() => setColumns(previous))
    }

    return (
        <DragDropProvider onDragEnd={(event) => {
            const { source, target } = event.operation
            if (!source || !target) return
            handleCardMoved(source.id as string, target.id as string)
        }}>
            <div className="flex flex-col h-screen">
                <div className="flex flex-row gap-3 p-3 overflow-x-auto items-start flex-1 min-h-0">
                    {columns.map((col) => (
                        <ColumnView key={col.id} column={col} onCardAdded={handleCardAdded} />
                    ))}

                    <AddColumnDialog onSubmit={handleAddColumn} />
                </div>
            </div>
        </DragDropProvider>
    )
}

function ColumnView({ column, onCardAdded }: {
    column: BoardColumn
    onCardAdded: (columnId: string, card: BoardCard) => void
}) {
    const [open, setOpen] = useState(false)

    const { ref, isDropTarget } = useDroppable({
        id: column.id
    });

    return (
        <>
            <div ref={ref} className="flex flex-col w-64 shrink-0 rounded-xl max-h-full">
                <div className="flex items-center justify-between pl-3 pr-2 py-2.5 bg-muted mb-2 rounded-2xl">
                    <span className="font-semibold text-sm">{column.name}</span>
                    <div className="flex items-center gap-0.5">
                        <Button className="p-1.5 hover:bg-accent" size='icon-sm' variant='ghost'>
                            <EllipsisIcon />
                        </Button>
                        <Button className="p-1.5 hover:bg-accent" size='icon-sm' variant='ghost' onClick={() => setOpen(true)}>
                            <PlusIcon />
                        </Button>
                    </div>
                </div>
                <div className={`flex flex-col gap-2 p-2 pb-2 overflow-y-auto rounded-xl transition-colors bg-muted ${isDropTarget ? 'ring-2 ring-primary/30' : ''} ${column.cards.length === 0 ? 'min-h-24' : ''}`}>
                    {column.cards.map((card) => (
                        <Card key={card.id} card={card} />
                    ))}
                </div>
            </div>

            <AddCardDialog
                open={open}
                onOpenChange={setOpen}
                columnId={column.id}
                columnName={column.name}
                onCardAdded={(card) => onCardAdded(column.id, card)}
            />
        </>
    )
}

function AddCardDialog({ open, onOpenChange, columnId, columnName, onCardAdded }: {
    open: boolean
    onOpenChange: (open: boolean) => void
    columnId: string
    columnName: string
    onCardAdded: (card: BoardCard) => void
}) {
    const [title, setTitle] = useState('')
    const [description, setDescription] = useState('')

    const mutation = useMutation({
        mutationFn: () => client.addCardToBoard(columnId, { title, description }),
        onSuccess: (card) => {
            onCardAdded(card as unknown as BoardCard)
            setTitle('')
            setDescription('')
            onOpenChange(false)
        },
    })

    function handleSubmit() {
        if (!title.trim()) return
        mutation.mutate()
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Add card to {columnName}</DialogTitle>
                </DialogHeader>
                <div className="flex flex-col gap-5 py-2">
                    <div className="flex flex-col gap-2">
                        <Label htmlFor="card-title">Title</Label>
                        <Input
                            id="card-title"
                            placeholder="Enter a title…"
                            value={title}
                            onChange={e => setTitle(e.target.value)}
                        />
                    </div>
                    <div className="flex flex-col gap-2">
                        <Label htmlFor="card-description">Description</Label>
                        <Textarea
                            id="card-description"
                            placeholder="Add a more detailed description…"
                            className="min-h-36 resize-none"
                            value={description}
                            onChange={e => setDescription(e.target.value)}
                        />
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                    <Button onClick={handleSubmit} disabled={!title.trim() || mutation.isPending}>
                        {mutation.isPending ? 'Adding…' : 'Add card'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

function AddColumnDialog({ onSubmit }: {
    onSubmit: (name: string, prompt: string) => Promise<void>
}) {
    const [open, setOpen] = useState(false)
    const [name, setName] = useState('')
    const [prompt, setPrompt] = useState('')
    const [isAdding, setIsAdding] = useState(false)

    async function handleSubmit() {
        if (!name.trim() || isAdding) return
        setIsAdding(true)
        try {
            await onSubmit(name, prompt)
            setName('')
            setPrompt('')
            setOpen(false)
        } finally {
            setIsAdding(false)
        }
    }

    return (
        <>
            <div className="pl-3 pr-2 py-2.5 shrink-0">
                <Button variant='ghost' onClick={() => setOpen(true)}>
                    <PlusIcon className="w-4 h-4" />
                    Add column
                </Button>
            </div>

            <Dialog open={open} onOpenChange={(o) => { if (!isAdding) setOpen(o) }}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Add column</DialogTitle>
                    </DialogHeader>
                    <div className="flex flex-col gap-5 py-2">
                        <div className="flex flex-col gap-2">
                            <Label htmlFor="col-name">Name</Label>
                            <Input
                                id="col-name"
                                placeholder="Column name…"
                                value={name}
                                onChange={e => setName(e.target.value)}
                                disabled={isAdding}
                            />
                        </div>
                        <div className="flex flex-col gap-2">
                            <Label htmlFor="col-prompt">Prompt</Label>
                            <Textarea
                                id="col-prompt"
                                placeholder="Instructions for the agent…"
                                className="min-h-28 resize-none"
                                value={prompt}
                                onChange={e => setPrompt(e.target.value)}
                                disabled={isAdding}
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setOpen(false)} disabled={isAdding}>Cancel</Button>
                        <Button onClick={handleSubmit} disabled={!name.trim() || isAdding} className="min-w-26">
                            {isAdding ? <LoaderCircle className="animate-spin" /> : 'Add column'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    )
}

function Card({ card }: { card: BoardCard }) {
    const { ref } = useDraggable({
        id: card.id
    })

    return (
        <div ref={ref} className="rounded-xl bg-background shadow-sm cursor-pointer hover:shadow-md transition-shadow">
            <div className="p-3">
                <p className="text-sm font-medium text-foreground leading-snug">{card.title}</p>
                {card.description && (
                    <p className="mt-1 text-xs text-muted-foreground leading-relaxed line-clamp-2">
                        {card.description}
                    </p>
                )}
            </div>
        </div>
    )
}

export function BoardPage() {
    const { boardId } = useParams({ from: '/boards/$boardId' })
    const { data, isPending, isError } = useQuery({
        queryKey: ['board', boardId],
        queryFn: () => client.getBoard(boardId),
    })

    if (isPending) return <p className="p-6 text-muted-foreground">Loading board...</p>
    if (isError) return <p className="p-6 text-destructive">Failed to load board.</p>

    return (
        <Board boardId={boardId} data={{
            name: data.name,
            columns: data.columns.map(col => ({
                id: col.id,
                name: col.name,
                pipeline: col.pipelineKind,
                cards: col.cards.map(card => ({
                    id: card.id,
                    title: card.title,
                    description: card.description,
                    data: card.data as string | null,
                })),
            })),
        }} />
    )
}
