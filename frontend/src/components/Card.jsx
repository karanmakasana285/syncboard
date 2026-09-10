/* eslint-disable no-unused-vars */
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import api from '../api/client'

export default function Card({ card }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: card._id,
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    background: 'white',
    padding: 8,
    marginBottom: 8,
    borderRadius: 4,
    boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
    opacity: isDragging ? 0.5 : 1,
    cursor: 'grab',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  }

  async function handleDelete(e) {
    e.stopPropagation() // don't let this click also trigger a drag
    if (!confirm(`Delete "${card.title}"?`)) return
    try {
      await api.delete(`/cards/${card._id}`)
      // no local state update needed here - the card:deleted broadcast will
      // remove it from state, and since we're in the same room, we receive
      // our own broadcast too
    } catch (err) {
      alert('Failed to delete card')
    }
  }

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <span>{card.title}</span>
      <button onClick={handleDelete} style={{ marginLeft: 8 }}>
        ×
      </button>
    </div>
  )
}
