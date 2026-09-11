/* eslint-disable no-unused-vars */
import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import api from '../api/client'
import {
  DndContext,
  closestCorners,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import Column from '../components/Column'
import { connectSocket, disconnectSocket } from '../socket'

export default function BoardDetailPage() {
  const { boardId } = useParams()
  const [board, setBoard] = useState(null)
  const [columns, setColumns] = useState([])
  const [cardsByColumn, setCardsByColumn] = useState({})
  const [newColumnName, setNewColumnName] = useState('')
  const [error, setError] = useState('')
  const [openCardId, setOpenCardId] = useState(null) // which card, if any, is currently open in an edit modal
  const [conflictToast, setConflictToast] = useState(null) // { cardId, newTitle } when a conflict affects the open card

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  )

  useEffect(() => {
    loadBoard()
  }, [boardId])

  useEffect(() => {
    const socket = connectSocket()
    if (!socket) return

    socket.emit('board:join', boardId)

    socket.on('board:error', (err) => {
      console.error('Socket board:error:', err)
    })

    // another client created a card - add it to that column's list, unless
    // we already have it (avoids duplicates if our own optimistic update
    // and the broadcast both add it)
    socket.on('card:created', (card) => {
      setCardsByColumn((prev) => {
        const existing = prev[card.column] || []
        if (existing.some((c) => c._id === card._id)) return prev
        return { ...prev, [card.column]: [...existing, card] }
      })
    })

    // another client updated a card - could be a title edit OR a move between
    // columns. We handle both by removing the card from EVERY column first,
    // then re-inserting it into its current column - simplest way to handle
    // "did it move columns" without extra branching logic.
    socket.on('card:updated', (card) => {
      setCardsByColumn((prev) => {
        const updated = {}
        for (const colId of Object.keys(prev)) {
          updated[colId] = prev[colId].filter((c) => c._id !== card._id)
        }
        const destColId = card.column
        updated[destColId] = [...(updated[destColId] || []), card].sort(
          (a, b) => a.order - b.order
        )
        return updated
      })
    })

    socket.on('card:deleted', ({ cardId, columnId }) => {
      setCardsByColumn((prev) => ({
        ...prev,
        [columnId]: (prev[columnId] || []).filter((c) => c._id !== cardId),
      }))
    })

    socket.on('column:created', (column) => {
      setColumns((prev) => {
        if (prev.some((c) => c._id === column._id)) return prev
        return [...prev, column]
      })
      setCardsByColumn((prev) => ({ ...prev, [column._id]: [] }))
    })

    socket.on('column:updated', (column) => {
      setColumns((prev) => prev.map((c) => (c._id === column._id ? column : c)))
    })

    socket.on('column:deleted', ({ columnId }) => {
      setColumns((prev) => prev.filter((c) => c._id !== columnId))
      setCardsByColumn((prev) => {
        const updated = { ...prev }
        delete updated[columnId]
        return updated
      })
    })

    // Option A (locked decision): broadcast reaches everyone in the room,
    // but we only show a toast if the affected card is the one THIS client
    // currently has open in its edit modal - checked via openCardId.
    socket.on('card:conflict', ({ cardId, newTitle }) => {
      setOpenCardId((currentOpenId) => {
        if (currentOpenId === cardId) {
          setConflictToast({ cardId, newTitle })
        }
        return currentOpenId
      })
    })

    return () => {
      disconnectSocket()
    }
  }, [boardId])

  async function loadBoard() {
    try {
      const boardRes = await api.get(`/boards/${boardId}`)
      setBoard(boardRes.data)

      const columnsRes = await api.get(`/columns/board/${boardId}`)
      setColumns(columnsRes.data)

      const cardsEntries = await Promise.all(
        columnsRes.data.map(async (col) => {
          const cardsRes = await api.get(`/cards/column/${col._id}`)
          return [col._id, cardsRes.data]
        })
      )
      setCardsByColumn(Object.fromEntries(cardsEntries))
    } catch (err) {
      setError('Failed to load board')
    }
  }

  async function handleCreateColumn(e) {
    e.preventDefault()
    if (!newColumnName.trim()) return
    try {
      await api.post('/columns', { name: newColumnName, boardId, order: columns.length })
      setNewColumnName('')
      loadBoard()
    } catch (err) {
      setError('Failed to create column')
    }
  }

  async function handleCreateCard(columnId) {
    const title = prompt('Card title:')
    if (!title) return
    try {
      const existingCards = cardsByColumn[columnId] || []
      await api.post('/cards', { title, columnId, order: existingCards.length })
      loadBoard()
    } catch (err) {
      setError('Failed to create card')
    }
  }

  function findColumnIdForCard(cardId) {
    return Object.keys(cardsByColumn).find((colId) =>
      cardsByColumn[colId].some((c) => c._id === cardId)
    )
  }

  async function handleDragEnd(event) {
    const { active, over } = event
    if (!over) return

    const activeCardId = active.id
    const overId = over.id
    const sourceColumnId = findColumnIdForCard(activeCardId)
    const overIsColumn = columns.some((c) => c._id === overId)
    const destColumnId = overIsColumn ? overId : findColumnIdForCard(overId)
    if (!sourceColumnId || !destColumnId) return

    // remove the card from its source column's array
    const sourceCards = [...(cardsByColumn[sourceColumnId] || [])]
    const cardIndex = sourceCards.findIndex((c) => c._id === activeCardId)
    if (cardIndex === -1) return
    const [movedCard] = sourceCards.splice(cardIndex, 1)

    // when moving within the same column, destCards IS sourceCards (same array,
    // already missing the card) - when moving across columns, it's a separate copy
    const destCards =
      sourceColumnId === destColumnId ? sourceCards : [...(cardsByColumn[destColumnId] || [])]

        // figure out exactly where to insert: compare the dragged card's vertical
    // position against the target card's midpoint, so dropping in the top half
    // inserts BEFORE it and dropping in the bottom half inserts AFTER it.
    // without this, we always insert before the target - which made "drop at
    // the very end" impossible, since the last card always intercepts the drop.
    let insertIndex = destCards.length
    if (!overIsColumn) {
      const overIndex = destCards.findIndex((c) => c._id === overId)
      if (overIndex !== -1) {
        const activeRect = active.rect.current.translated
        const overRect = over.rect
        const isAfter = activeRect && overRect && activeRect.top > overRect.top + overRect.height / 2
        insertIndex = isAfter ? overIndex + 1 : overIndex
      }
    }
    destCards.splice(insertIndex, 0, { ...movedCard, column: destColumnId })

    // THE FIX: re-sequence order values (0,1,2...) for every card in each
    // affected column, not just the one that moved - this is what prevents ties
    const reindexedSource = sourceCards.map((c, i) => ({ ...c, order: i }))
    const reindexedDest = destCards.map((c, i) => ({ ...c, order: i }))

    // optimistic UI update
    setCardsByColumn((prev) => ({
      ...prev,
      [sourceColumnId]: reindexedSource,
      [destColumnId]: reindexedDest,
    }))

    try {
      const updates = []
      if (sourceColumnId !== destColumnId) {
        // source column's remaining cards shifted down - persist their new order too
        reindexedSource.forEach((c) =>
          updates.push(api.patch(`/cards/${c._id}`, { order: c.order }))
        )
      }
      reindexedDest.forEach((c) => {
        const payload = { order: c.order }
        if (c._id === activeCardId && sourceColumnId !== destColumnId) {
          payload.columnId = destColumnId
        }
        updates.push(api.patch(`/cards/${c._id}`, payload))
      })
      await Promise.all(updates)
    } catch (err) {
      setError('Failed to move card - reloading board')
      loadBoard()
    }
  }

  if (error) return <p style={{ color: 'red', padding: 20 }}>{error}</p>
  if (!board) return <p style={{ padding: 20 }}>Loading...</p>

  return (
    <div style={{ padding: 20 }}>
      <Link to="/boards">← Back to boards</Link>
      <h1>{board.name}</h1>

      <form onSubmit={handleCreateColumn} style={{ margin: '12px 0' }}>
        <input
          placeholder="New column name"
          value={newColumnName}
          onChange={(e) => setNewColumnName(e.target.value)}
        />
        <button type="submit">Add Column</button>
      </form>

      {conflictToast && (
        <div
          style={{
            position: 'fixed',
            top: 16,
            right: 16,
            background: '#fff3cd',
            border: '1px solid #ffc107',
            padding: 12,
            borderRadius: 6,
            maxWidth: 300,
          }}
        >
          <p style={{ margin: 0 }}>
            This card changed while you had it open (current title: "
            {conflictToast.newTitle}"). Your save still went through, but double-check
            nothing important got overwritten.
          </p>
          <button onClick={() => setConflictToast(null)}>Dismiss</button>
        </div>
      )}

      <DndContext sensors={sensors} collisionDetection={closestCorners} onDragEnd={handleDragEnd}>
        <div style={{ display: 'flex', gap: 16 }}>
          {columns.map((col) => (
            <Column
              key={col._id}
              column={col}
              cards={cardsByColumn[col._id] || []}
              onAddCard={() => handleCreateCard(col._id)}
              openCardId={openCardId}
              setOpenCardId={setOpenCardId}
            />
          ))}
        </div>
      </DndContext>
    </div>
  )
}
