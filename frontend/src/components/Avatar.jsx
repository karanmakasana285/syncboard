export default function Avatar({ person, size = 30, onClick, selected }) {
  const initials = person?.name
    ? person.name.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase()
    : '?'

  return (
    <div
      title={person?.name}
      onClick={onClick}
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: selected === false ? 'var(--color-border)' : 'var(--color-accent)',
        color: selected === false ? 'var(--color-ink-secondary)' : 'white',
        fontSize: size * 0.42,
        fontWeight: 500,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        border: '2px solid var(--color-paper)',
        flexShrink: 0,
        cursor: onClick ? 'pointer' : 'default',
        opacity: selected === false ? 0.6 : 1,
      }}
    >
      {initials}
    </div>
  )
}
