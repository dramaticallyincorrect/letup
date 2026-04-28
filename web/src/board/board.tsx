import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { EllipsisIcon, PlusIcon } from "lucide-react"
import { useState } from "react"

type BoardData = {
    name: string,
    columns: BoardColumn[]
}

type BoardColumn = {
    name: string,
    pipeline: PipelineStep[],
    cards: BoardCard[]
}

type BoardCard = {
    title: string,
    description: string,
    data: string | null,
}

type PipelineKind = 'shell' | 'agent'

type PipelineStep = {
    kind: PipelineKind
}

export function Board({ data }: { data: BoardData }) {
    return (
        <div className="flex flex-col h-screen">
            <div className="flex flex-row gap-3 p-3 overflow-x-auto items-start flex-1 min-h-0">
                {data.columns.map((col) => (
                    <ColumnView key={col.name} column={col} />
                ))}

                <div className="pl-3 pr-2 py-2.5">
                    <Button variant='ghost'>
                        <PlusIcon className="w-4 h-4" />
                        Add column
                    </Button>
                </div>
            </div>
        </div>
    )
}

function ColumnView({ column }: { column: BoardColumn }) {
    const [open, setOpen] = useState(false)

    return (
        <>
            <div className="flex flex-col w-64 shrink-0 rounded-xl max-h-full">
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
                <div className="flex flex-col gap-2 p-2 pb-2 overflow-y-auto bg-muted rounded-xl">
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
    return (
        <div className="rounded-xl bg-background shadow-sm cursor-pointer hover:shadow-md transition-shadow">
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
