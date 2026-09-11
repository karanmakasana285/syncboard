/* eslint-disable no-unused-vars */
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import api from '../api/client'
import CardEditModal from './CardEditModal'

export default function Card({ card, openCardId, setOpenCardId }) {
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
    e.stopPropagation()
    if (!confirm(`Delete "${card.title}"?`)) return
    try {
      await api.delete(`/cards/${card._id}`)
    } catch (err) {
      alert('Failed to delete card')
    }
  }

  function handleCardClick() {
    if (isDragging) return
    setOpenCardId(card._id) // this card is now the "open" one, visible to the conflict listener
  }

  const isOpen = openCardId === card._id

  return (
    <>
      <div ref={setNodeRef} style={style} {...attributes} {...listeners} onClick={handleCardClick}>
        <span>
          {card.title}
          {card.conflictHistory?.length > 0 && (
            <span title="This card has a conflict history" style={{ marginLeft: 6 }}>
              ⚠️
            </span>
          )}
        </span>
        <button onClick={handleDelete} style={{ marginLeft: 8 }}>
          ×
        </button>
      </div>
      {isOpen && (
        <CardEditModal card={card} onClose={() => setOpenCardId(null)} />
      )}
    </>
  )
}
