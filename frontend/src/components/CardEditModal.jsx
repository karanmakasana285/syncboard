import { useState } from 'react'
import api from '../api/client'
import Avatar from './Avatar'

export default function CardEditModal({ card, onClose, boardMembers = [] }) {
  const [title, setTitle] = useState(card.title)
  const [description, setDescription] = useState(card.description || '')
  const [labels, setLabels] = useState(card.labels || [])
  const [labelInput, setLabelInput] = useState('')
  const [dueDate, setDueDate] = useState(card.dueDate ? card.dueDate.slice(0, 10) : '')
  const [assigneeIds, setAssigneeIds] = useState(
    (card.assignees || []).map((a) => (typeof a === 'string' ? a : a._id))
  )
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [expectedVersion] = useState(card.version)
  const [activityOpen, setActivityOpen] = useState(false)

  const [titleTouched, setTitleTouched] = useState(false)
  const [descriptionTouched, setDescriptionTouched] = useState(false)
  const [labelsTouched, setLabelsTouched] = useState(false)
  const [dueDateTouched, setDueDateTouched] = useState(false)
  const [assigneesTouched, setAssigneesTouched] = useState(false)

  function addLabel() {
    const value = labelInput.trim()
    if (!value || labels.includes(value)) {
      setLabelInput('')
      return
    }
    setLabels([...labels, value])
    setLabelInput('')
    setLabelsTouched(true)
  }

  function removeLabel(label) {
    setLabels(labels.filter((l) => l !== label))
    setLabelsTouched(true)
  }

  function toggleAssignee(personId) {
    setAssigneesTouched(true)
    setAssigneeIds((prev) =>
      prev.includes(personId) ? prev.filter((id) => id !== personId) : [...prev, personId]
    )
  }

  async function handleSave() {
    setSaving(true)
    setError('')
    try {
      const payload = { expectedVersion }
      if (titleTouched) payload.title = title
      if (descriptionTouched) payload.description = description
      if (labelsTouched) payload.labels = labels
      if (dueDateTouched) payload.dueDate = dueDate || null
      if (assigneesTouched) payload.assignees = assigneeIds

      const nothingTouched =
        !titleTouched && !descriptionTouched && !labelsTouched && !dueDateTouched && !assigneesTouched
      if (nothingTouched) {
        onClose()
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

  const activity = card.activityLog || []
  const hasActivity = activity.length > 0

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(43, 41, 38, 0.4)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'var(--color-surface)',
          padding: 24,
          borderRadius: 12,
          width: 420,
          maxHeight: '85vh',
          overflowY: 'auto',
          boxShadow: 'var(--shadow-dragging)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {hasActivity && (
          <div style={{ marginBottom: 16 }}>
            <p
              onClick={() => setActivityOpen((v) => !v)}
              style={{
                fontSize: 12.5,
                color: 'var(--color-ink-secondary)',
                cursor: 'pointer',
                margin: 0,
                userSelect: 'none',
              }}
            >
              {activityOpen ? '▾' : '▸'} Activity ({activity.length})
            </p>
            {activityOpen && (
              <div
                style={{
                  marginTop: 8,
                  paddingLeft: 12,
                  borderLeft: '2px solid var(--color-border)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                }}
              >
                {activity
                  .slice()
                  .reverse()
                  .map((entry, i) => (
                    <p key={i} style={{ margin: 0, fontSize: 12.5, color: 'var(--color-ink-secondary)' }}>
                      {entry.type === 'conflict' && (
                        <span style={{ color: 'var(--color-conflict)' }}>&#9888; </span>
                      )}
                      <span style={{ color: 'var(--color-ink)' }}>{entry.by?.name || 'Someone'}</span>{' '}
                      {entry.message} &middot;{' '}
                      {new Date(entry.at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                    </p>
                  ))}
              </div>
            )}
          </div>
        )}

        <input
          value={title}
          onChange={(e) => {
            setTitle(e.target.value)
            setTitleTouched(true)
          }}
          style={{
            display: 'block',
            width: '100%',
            padding: '11px 14px',
            marginBottom: 14,
            border: '1px solid var(--color-border)',
            borderRadius: 8,
            fontSize: 18,
            fontFamily: 'var(--font-display)',
            fontWeight: 500,
            color: 'var(--color-ink)',
            boxSizing: 'border-box',
          }}
        />

        <textarea
          value={description}
          onChange={(e) => {
            setDescription(e.target.value)
            setDescriptionTouched(true)
          }}
          placeholder="Description"
          rows={3}
          style={{
            display: 'block',
            width: '100%',
            padding: '11px 14px',
            marginBottom: 18,
            border: '1px solid var(--color-border)',
            borderRadius: 8,
            fontSize: 14,
            fontFamily: 'var(--font-body)',
            color: 'var(--color-ink)',
            boxSizing: 'border-box',
            resize: 'vertical',
          }}
        />

        <p style={{ fontSize: 12.5, color: 'var(--color-ink-secondary)', fontWeight: 500, marginBottom: 8 }}>
          LABELS
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
          {labels.map((label) => (
            <span
              key={label}
              style={{
                background: 'var(--color-accent-bg)',
                color: 'var(--color-accent)',
                fontSize: 12.5,
                fontWeight: 500,
                padding: '4px 10px',
                borderRadius: 999,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              {label}
              <span onClick={() => removeLabel(label)} style={{ cursor: 'pointer' }}>
                &times;
              </span>
            </span>
          ))}
        </div>
        <input
          value={labelInput}
          onChange={(e) => setLabelInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              addLabel()
            }
          }}
          onBlur={addLabel}
          placeholder="Type a label, press Enter"
          style={{
            display: 'block',
            width: '100%',
            padding: '9px 12px',
            marginBottom: 18,
            border: '1px solid var(--color-border)',
            borderRadius: 8,
            fontSize: 13.5,
            fontFamily: 'var(--font-body)',
            color: 'var(--color-ink)',
            boxSizing: 'border-box',
          }}
        />

        <p style={{ fontSize: 12.5, color: 'var(--color-ink-secondary)', fontWeight: 500, marginBottom: 8 }}>
          DUE DATE
        </p>
        <input
          type="date"
          value={dueDate}
          onChange={(e) => {
            setDueDate(e.target.value)
            setDueDateTouched(true)
          }}
          style={{
            display: 'block',
            width: '100%',
            padding: '9px 12px',
            marginBottom: 18,
            border: '1px solid var(--color-border)',
            borderRadius: 8,
            fontSize: 13.5,
            fontFamily: 'var(--font-body)',
            color: 'var(--color-ink)',
            boxSizing: 'border-box',
          }}
        />

        {boardMembers.length > 0 && (
          <>
            <p style={{ fontSize: 12.5, color: 'var(--color-ink-secondary)', fontWeight: 500, marginBottom: 8 }}>
              ASSIGNEES
            </p>
            <div style={{ display: 'flex', gap: 8, marginBottom: 18, flexWrap: 'wrap' }}>
              {boardMembers.map((person) => (
                <Avatar
                  key={person._id}
                  person={person}
                  size={32}
                  selected={assigneeIds.includes(person._id)}
                  onClick={() => toggleAssignee(person._id)}
                />
              ))}
            </div>
          </>
        )}

        {error && <p style={{ color: 'var(--color-conflict)', fontSize: 13.5, marginBottom: 12 }}>{error}</p>}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button
            onClick={onClose}
            style={{
              padding: '9px 16px',
              border: '1px solid var(--color-border)',
              borderRadius: 8,
              background: 'var(--color-surface)',
              color: 'var(--color-ink)',
              fontSize: 14,
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              padding: '9px 18px',
              border: 'none',
              borderRadius: 8,
              background: 'var(--color-accent)',
              color: 'white',
              fontSize: 14,
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
