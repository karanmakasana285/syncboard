import { useState } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import api from '../api/client'
import CardEditModal from './CardEditModal'

export default function Card({ card, openCardId, setOpenCardId }) {
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: card._id,
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    background: 'var(--color-card-bg)',
    padding: '11px 13px',
    marginBottom: 9,
    borderRadius: 8,
    border: '0.5px solid var(--color-border)',
    boxShadow: isDragging ? 'var(--shadow-dragging)' : 'var(--shadow-resting)',
    cursor: 'grab',
    fontSize: 14,
    color: 'var(--color-ink)',
  }

  async function confirmDelete(e) {
    e.stopPropagation()
    try {
      await api.delete(`/cards/${card._id}`)
    } catch (err) {
      alert('Failed to delete card')
    }
  }

  function handleCardClick() {
    if (isDragging || confirmingDelete) return
    setOpenCardId(card._id)
  }

  const isOpen = openCardId === card._id
  const hasConflict = card.conflictHistory?.length > 0

  if (confirmingDelete) {
    return (
      <div
        style={{
          ...style,
          cursor: 'default',
          border: '1px solid var(--color-conflict)',
        }}
      >
        <p style={{ margin: '0 0 9px', color: 'var(--color-ink)' }}>Delete "{card.title}"?</p>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={confirmDelete}
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
            onClick={(e) => {
              e.stopPropagation()
              setConfirmingDelete(false)
            }}
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
    )
  }

  return (
    <>
      <div ref={setNodeRef} style={style} {...attributes} {...listeners} onClick={handleCardClick}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <span>{card.title}</span>
          <button
            onClick={(e) => {
              e.stopPropagation()
              setConfirmingDelete(true)
            }}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--color-ink-faint)',
              cursor: 'pointer',
              fontSize: 15,
              lineHeight: 1,
              padding: 0,
              marginLeft: 8,
            }}
          >
            ×
          </button>
        </div>
        {hasConflict && (
          <p style={{ color: 'var(--color-conflict)', fontSize: 11.5, margin: '7px 0 0' }}>
            &#9888; Updated while you were editing
          </p>
        )}
      </div>
      {isOpen && <CardEditModal card={card} onClose={() => setOpenCardId(null)} />}
    </>
  )
}
