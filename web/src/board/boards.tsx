import { useQuery } from '@tanstack/react-query'
import * as client from '@repo/data'
import { Link } from '@tanstack/react-router'

export function Boards() {
  const { data: boards, isPending, isError } = useQuery({
    queryKey: ['boards'],
    queryFn: client.getBoards,
  })

  if (isPending) return <p className="p-6 text-muted-foreground">Loading boards...</p>
  if (isError) return <p className="p-6 text-destructive">Failed to load boards.</p>

  return (
    <div className='flex flex-row gap-2 m-8'>
      {
        boards!.map((board) => <Link to='/boards/$boardId' params={{
          boardId: board.id
        }}>
          <div
            key={board.id}
            className="rounded-lg border bg-card p-4 hover:border-primary cursor-pointer transition-colors"
          >
            <p className="font-medium">{board.name}</p>
          </div>
        </Link>)
      }
    </div>
  )
}
