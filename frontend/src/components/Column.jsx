import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import Card from './Card'

export default function Column({ column, cards, onAddCard }) {
  // making the column itself droppable lets you drop a card into an EMPTY column -
  // without this, an empty column has nothing for dnd-kit to detect a drop onto
  const { setNodeRef } = useDroppable({ id: column._id })

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
      <h3>{column.name}</h3>
      <SortableContext items={cards.map((c) => c._id)} strategy={verticalListSortingStrategy}>
        {cards.map((card) => (
          <Card key={card._id} card={card} />
        ))}
      </SortableContext>
      <button onClick={onAddCard}>+ Add card</button>
    </div>
  )
}
