/* eslint-disable no-unused-vars */
import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import Card from './Card'
import api from '../api/client'

export default function Column({ column, cards, onAddCard }) {
  const { setNodeRef } = useDroppable({ id: column._id })

  async function handleDeleteColumn() {
    if (!confirm(`Delete column "${column.name}" and all its cards?`)) return
    try {
      await api.delete(`/columns/${column._id}`)
      // no local state update - the column:deleted broadcast (received by
      // our own socket too) handles removal, same pattern as card delete
    } catch (err) {
      alert('Failed to delete column')
    }
  }

  return (
    <div
      ref={setNodeRef}
      style={{
        background: '#f4f4f4',
        padding: 12,
        width: 220,
        minHeight: 100,
        borderRadius: 6,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3>{column.name}</h3>
        <button onClick={handleDeleteColumn}>×</button>
      </div>
      <SortableContext items={cards.map((c) => c._id)} strategy={verticalListSortingStrategy}>
        {cards.map((card) => (
          <Card key={card._id} card={card} />
        ))}
      </SortableContext>
      <button onClick={onAddCard}>+ Add card</button>
    </div>
  )
}

