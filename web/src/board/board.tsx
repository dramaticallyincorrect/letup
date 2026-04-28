import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { DragDropProvider, useDraggable, useDroppable } from "@dnd-kit/react"
import { EllipsisIcon, PlusIcon } from "lucide-react"
import { useState } from "react"
import { useParams } from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"
import * as client from "@repo/data"

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

export function Board({ data }: { data: BoardData }) {
    const [columns, setColumns] = useState(data.columns)

    return (
        <DragDropProvider onDragEnd={(event) => {
            const { source, target } = event.operation
            if (!source || !target) return

            const cardId = source.id
            const targetColumnId = target.id
            setColumns(cols => {
                const sourceCol = cols.find(c => c.cards.some(card => card.id === cardId))
                if (!sourceCol || sourceCol.id === targetColumnId) return cols

                const card = sourceCol.cards.find(c => c.id === cardId)!
                return cols.map(col => {
                    if (col.id === sourceCol.id) return { ...col, cards: col.cards.filter(c => c.id !== cardId) }
                    if (col.id === targetColumnId) return { ...col, cards: [...col.cards, card] }
                    return col
                })
            })
        }}>
            <div className="flex flex-col h-screen">
                <div className="flex flex-row gap-3 p-3 overflow-x-auto items-start flex-1 min-h-0">
                    {columns.map((col) => (
                        <ColumnView key={col.id} column={col} />
                    ))}

                    <div className="pl-3 pr-2 py-2.5">
                        <Button variant='ghost'>
                            <PlusIcon className="w-4 h-4" />
                            Add column
                        </Button>
                    </div>
                </div>
            </div>
        </DragDropProvider>
    )
}

function ColumnView({ column }: { column: BoardColumn }) {
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
                <div className={`flex flex-col gap-2 p-2 pb-2 overflow-y-auto rounded-xl transition-colors bg-muted ${isDropTarget ? 'ring-2 ring-primary/30' : ''}`} hidden={column.cards.length == 0}>
                    {column.cards.map((card) => (
                        <Card key={card.title} card={card} />
                    ))}
                </div>
            </div>

            <AddCardDialog open={open} onOpenChange={setOpen} columnName={column.name} />
        </>
    )
}

function AddCardDialog({ open, onOpenChange, columnName }: { open: boolean, onOpenChange: (open: boolean) => void, columnName: string }) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Add card to {columnName}</DialogTitle>
                </DialogHeader>
                <div className="flex flex-col gap-5 py-2">
                    <div className="flex flex-col gap-2">
                        <Label htmlFor="card-title">Title</Label>
                        <Input id="card-title" placeholder="Enter a title…" />
                    </div>
                    <div className="flex flex-col gap-2">
                        <Label htmlFor="card-description">Description</Label>
                        <Textarea
                            id="card-description"
                            placeholder="Add a more detailed description…"
                            className="min-h-36 resize-none"
                        />
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                    <Button>Add card</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
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
        <Board data={{
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
