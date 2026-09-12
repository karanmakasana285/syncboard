import { useState } from 'react'

export default function BoardCard({ board, onClick }) {
  const [hovered, setHovered] = useState(false)
  const initial = board.name.trim()[0]?.toUpperCase() || '?'

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        textAlign: 'left',
        padding: '16px 18px',
        background: 'var(--color-surface)',
        border: hovered ? '1px solid var(--color-accent)' : '1px solid var(--color-border)',
        borderRadius: 10,
        boxShadow: hovered ? 'var(--shadow-dragging)' : 'var(--shadow-resting)',
        cursor: 'pointer',
        width: '100%',
        transition: 'border-color 0.15s, box-shadow 0.15s',
      }}
    >
      <div
        style={{
          width: 38,
          height: 38,
          borderRadius: 8,
          background: 'var(--color-accent-bg)',
          color: 'var(--color-accent)',
          fontFamily: 'var(--font-display)',
          fontSize: 17,
          fontWeight: 600,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        {initial}
      </div>
      <span style={{ fontSize: 16.5, color: 'var(--color-ink)', fontFamily: 'var(--font-display)', flex: 1 }}>
        {board.name}
      </span>
      <span style={{ color: 'var(--color-ink-faint)', fontSize: 18 }}>&rsaquo;</span>
    </button>
  )
}
