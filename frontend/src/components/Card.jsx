import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

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
  }

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      {card.title}
    </div>
  )
}
