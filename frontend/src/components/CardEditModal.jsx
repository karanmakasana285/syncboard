import { useState } from 'react'
import api from '../api/client'

export default function CardEditModal({ card, onClose }) {
  const [title, setTitle] = useState(card.title)
  const [description, setDescription] = useState(card.description || '')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [expectedVersion] = useState(card.version)

  // track which fields the user actually touched - only these get sent on
  // save, so an untouched-but-stale field (e.g. title, if only description
  // was edited) can't silently overwrite someone else's real change to it
  const [titleTouched, setTitleTouched] = useState(false)
  const [descriptionTouched, setDescriptionTouched] = useState(false)

  async function handleSave() {
    setSaving(true)
    setError('')
    try {
      const payload = { expectedVersion }
      if (titleTouched) payload.title = title
      if (descriptionTouched) payload.description = description

      if (!titleTouched && !descriptionTouched) {
        onClose() // nothing changed, don't even make the request
        return
      }

      await api.patch(`/cards/${card._id}`, payload)
      onClose()
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const hasConflicts = card.conflictHistory?.length > 0

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0,0,0,0.4)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      onClick={onClose}
    >
      <div
        style={{ background: 'white', padding: 20, borderRadius: 8, width: 360 }}
        onClick={(e) => e.stopPropagation()}
      >
        {hasConflicts && (
          <div style={{ background: '#fff3cd', padding: 8, borderRadius: 4, marginBottom: 8, fontSize: 13 }}>
            <strong>⚠️ This card had a simultaneous edit</strong>
            <ul style={{ margin: '4px 0 0 16px', padding: 0 }}>
              {card.conflictHistory.map((c, i) => (
                <li key={i}>
                  On {new Date(c.overwrittenAt).toLocaleString()}, two people saved changes to this
                  card around the same time (title at that moment was: "{c.previousTitle}") — worth a
                  quick check that nothing important was lost.
                </li>
              ))}
            </ul>
          </div>
        )}
        <input
          value={title}
          onChange={(e) => {
            setTitle(e.target.value)
            setTitleTouched(true)
          }}
          style={{ display: 'block', width: '100%', marginBottom: 8, fontSize: 16 }}
        />
        <textarea
          value={description}
          onChange={(e) => {
            setDescription(e.target.value)
            setDescriptionTouched(true)
          }}
          placeholder="Description"
          rows={4}
          style={{ display: 'block', width: '100%', marginBottom: 8 }}
        />
        {error && <p style={{ color: 'red' }}>{error}</p>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={onClose}>Cancel</button>
          <button onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
