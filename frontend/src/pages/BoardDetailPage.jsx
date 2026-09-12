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

function AddColumnCard({ onAdd }) {
  const [isAdding, setIsAdding] = useState(false)
  const [name, setName] = useState('')

  function submit() {
    if (!name.trim()) {
      setIsAdding(false)
      return
    }
    onAdd(name.trim())
    setName('')
    setIsAdding(false)
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter') submit()
    if (e.key === 'Escape') {
      setName('')
      setIsAdding(false)
    }
  }

  if (isAdding) {
    return (
      <div
        style={{
          border: '1px solid var(--color-accent)',
          borderRadius: 12,
          padding: 14,
          width: 250,
          flexShrink: 0,
          background: 'var(--color-surface)',
        }}
      >
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={submit}
          placeholder="Column name"
          style={{
            width: '100%',
            padding: '9px 11px',
            border: '1px solid var(--color-border)',
            borderRadius: 6,
            fontSize: 14,
            fontFamily: 'var(--font-body)',
            background: 'var(--color-paper)',
            boxSizing: 'border-box',
          }}
        />
      </div>
    )
  }

  return (
    <div
      onClick={() => setIsAdding(true)}
      style={{
        border: '1px dashed var(--color-border)',
        borderRadius: 12,
        padding: 14,
        width: 210,
        minHeight: 64,
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
      }}
    >
      <p style={{ color: 'var(--color-ink-faint)', fontSize: 14, margin: 0 }}>+ Add column</p>
    </div>
  )
}

export default function BoardDetailPage() {
  const { boardId } = useParams()
  const [board, setBoard] = useState(null)
  const [columns, setColumns] = useState([])
  const [cardsByColumn, setCardsByColumn] = useState({})
  const [error, setError] = useState('')
  const [openCardId, setOpenCardId] = useState(null)
  const [conflictToast, setConflictToast] = useState(null)

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

    socket.on('card:created', (card) => {
      setCardsByColumn((prev) => {
        const existing = prev[card.column] || []
        if (existing.some((c) => c._id === card._id)) return prev
        return { ...prev, [card.column]: [...existing, card] }
      })
    })

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

  async function handleCreateColumn(name) {
    try {
      await api.post('/columns', { name, boardId, order: columns.length })
      loadBoard()
    } catch (err) {
      setError('Failed to create column')
    }
  }

  async function handleCreateCard(columnId, title) {
    if (!title || !title.trim()) return
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

    const sourceCards = [...(cardsByColumn[sourceColumnId] || [])]
    const cardIndex = sourceCards.findIndex((c) => c._id === activeCardId)
    if (cardIndex === -1) return
    const [movedCard] = sourceCards.splice(cardIndex, 1)

    const destCards =
      sourceColumnId === destColumnId ? sourceCards : [...(cardsByColumn[destColumnId] || [])]

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

    const reindexedSource = sourceCards.map((c, i) => ({ ...c, order: i }))
    const reindexedDest = destCards.map((c, i) => ({ ...c, order: i }))

    setCardsByColumn((prev) => ({
      ...prev,
      [sourceColumnId]: reindexedSource,
      [destColumnId]: reindexedDest,
    }))

    try {
      const updates = []
      if (sourceColumnId !== destColumnId) {
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

  if (error) {
    return (
      <div style={{ padding: 48, textAlign: 'center' }}>
        <p style={{ color: 'var(--color-conflict)', fontSize: 14 }}>{error}</p>
      </div>
    )
  }

  if (!board) {
    return (
      <div style={{ padding: 48, textAlign: 'center' }}>
        <p style={{ color: 'var(--color-ink-faint)', fontSize: 14 }}>Loading board...</p>
      </div>
    )
  }

  return (
    <div style={{ padding: '32px 32px 48px', maxWidth: 1200, margin: '0 auto' }}>
      <Link
        to="/boards"
        style={{ color: 'var(--color-accent)', fontSize: 14.5, fontWeight: 500, textDecoration: 'none' }}
      >
        &larr; All boards
      </Link>
      <h1
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 28,
          fontWeight: 500,
          color: 'var(--color-ink)',
          margin: '4px 0 16px',
        }}
      >
        {board.name}
      </h1>

      <div style={{ borderBottom: '1px solid var(--color-border)', marginBottom: 24 }} />

      {conflictToast && (
        <div
          style={{
            position: 'fixed',
            top: 20,
            right: 20,
            background: 'var(--color-conflict-bg)',
            border: '1px solid var(--color-conflict)',
            padding: 14,
            borderRadius: 8,
            maxWidth: 300,
            boxShadow: 'var(--shadow-dragging)',
          }}
        >
          <p style={{ margin: 0, fontSize: 14, color: 'var(--color-ink)' }}>
            This card changed while you had it open (current title: "{conflictToast.newTitle}").
            Your save still went through, but double-check nothing important got overwritten.
          </p>
          <button
            onClick={() => setConflictToast(null)}
            style={{
              marginTop: 8,
              background: 'none',
              border: 'none',
              color: 'var(--color-conflict)',
              fontSize: 13,
              cursor: 'pointer',
              padding: 0,
            }}
          >
            Dismiss
          </button>
        </div>
      )}

      <DndContext sensors={sensors} collisionDetection={closestCorners} onDragEnd={handleDragEnd}>
        <div style={{ display: 'flex', gap: 20, overflowX: 'auto', paddingBottom: 8, alignItems: 'flex-start' }}>
          {columns.map((col) => (
            <Column
              key={col._id}
              column={col}
              cards={cardsByColumn[col._id] || []}
              onAddCard={(title) => handleCreateCard(col._id, title)}
              openCardId={openCardId}
              setOpenCardId={setOpenCardId}
            />
          ))}
          <AddColumnCard onAdd={handleCreateColumn} />
        </div>
      </DndContext>
    </div>
  )
}
