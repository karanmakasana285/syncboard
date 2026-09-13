/* eslint-disable no-unused-vars */
import { useState } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import Card from './Card'
import api from '../api/client'

export default function Column({ column, cards, onAddCard, openCardId, setOpenCardId, boardMembers }) {
  const { setNodeRef } = useDroppable({ id: column._id })
  const [isAdding, setIsAdding] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  async function confirmDeleteColumn() {
    try {
      await api.delete(`/columns/${column._id}`)
    } catch (err) {
      alert('Failed to delete column')
    }
  }

  function submitNewCard() {
    if (!newTitle.trim()) {
      setIsAdding(false)
      return
    }
    onAddCard(newTitle.trim())
    setNewTitle('')
    setIsAdding(false)
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter') submitNewCard()
    if (e.key === 'Escape') {
      setNewTitle('')
      setIsAdding(false)
    }
  }

  return (
    <div
      ref={setNodeRef}
      style={{
        background: 'var(--color-surface)',
        borderRadius: 12,
        border: '0.5px solid var(--color-border)',
        boxShadow: 'var(--shadow-resting)',
        padding: 14,
        width: 250,
        minHeight: 80,
        flexShrink: 0,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <p style={{ color: 'var(--color-ink-muted)', fontSize: 13.5, fontWeight: 500, letterSpacing: 0.2 }}>
          {column.name} <span style={{ color: 'var(--color-ink-faint)' }}>&nbsp;{cards.length}</span>
        </p>
        <button
          onClick={() => setConfirmingDelete(true)}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--color-ink-faint)',
            cursor: 'pointer',
            fontSize: 16,
            lineHeight: 1,
          }}
        >
          ×
        </button>
      </div>

      {confirmingDelete && (
        <div
          style={{
            border: '1px solid var(--color-conflict)',
            borderRadius: 8,
            padding: 10,
            marginBottom: 10,
            background: 'var(--color-conflict-bg)',
          }}
        >
          <p style={{ margin: '0 0 8px', fontSize: 13.5, color: 'var(--color-ink)' }}>
            Delete "{column.name}" and all its cards?
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={confirmDeleteColumn}
              style={{
                background: 'var(--color-conflict)',
                color: 'white',
                border: 'none',
                borderRadius: 5,
                padding: '5px 11px',
                fontSize: 13,
                cursor: 'pointer',
              }}
            >
              Delete
            </button>
            <button
              onClick={() => setConfirmingDelete(false)}
              style={{
                background: 'none',
                border: '1px solid var(--color-border)',
                borderRadius: 5,
                padding: '5px 11px',
                fontSize: 13,
                cursor: 'pointer',
                color: 'var(--color-ink-muted)',
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <SortableContext items={cards.map((c) => c._id)} strategy={verticalListSortingStrategy}>
        {cards.length === 0 && !isAdding ? (
          <div
            style={{
              border: '1px dashed var(--color-border)',
              borderRadius: 8,
              padding: 18,
              textAlign: 'center',
            }}
          >
            <p style={{ color: 'var(--color-ink-faint)', fontSize: 13 }}>No cards yet</p>
          </div>
        ) : (
          cards.map((card) => (
            <Card key={card._id} card={card} openCardId={openCardId} setOpenCardId={setOpenCardId} boardMembers={boardMembers} />
          ))
        )}
      </SortableContext>

      {isAdding ? (
        <div style={{ marginTop: 8 }}>
          <input
            autoFocus
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={submitNewCard}
            placeholder="Card title"
            style={{
              width: '100%',
              padding: '9px 11px',
              border: '1px solid var(--color-accent)',
              borderRadius: 6,
              fontSize: 14,
              fontFamily: 'var(--font-body)',
              background: 'var(--color-paper)',
              boxSizing: 'border-box',
            }}
          />
        </div>
      ) : (
        <p
          onClick={() => setIsAdding(true)}
          style={{ color: 'var(--color-ink-faint)', fontSize: 13, marginTop: 11, cursor: 'pointer' }}
        >
          + Add card
        </p>
      )}
    </div>
  )
}
