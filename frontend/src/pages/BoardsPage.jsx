/* eslint-disable no-unused-vars */
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api/client'
import { useAuth } from '../context/AuthContext'
import BoardCard from '../components/BoardCard'
import { connectSocket, disconnectSocket } from '../socket'

export default function BoardsPage() {
  const [boards, setBoards] = useState([])
  const [invites, setInvites] = useState([])
  const [loading, setLoading] = useState(true)
  const [newBoardName, setNewBoardName] = useState('')
  const [error, setError] = useState('')
  const [respondingTo, setRespondingTo] = useState(null)
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    fetchBoards()
    fetchInvites()
  }, [])

  // Live invite notifications: unlike board detail, there's no boardId to
  // join a room for here - this page just needs to hear about invites
  // addressed to this user specifically (see socket/index.js's per-user
  // room). Without this, a newly sent invite would only show up the next
  // time this page happens to load/refetch.
  useEffect(() => {
    const socket = connectSocket()
    if (!socket) return

    // re-fetch on (re)connect too, so an invite sent while this page was
    // open through a dropped connection isn't silently missed - same
    // reconnect-resync approach used on the board detail page.
    socket.on('connect', () => {
      fetchInvites()
    })

    socket.on('invite:received', (board) => {
      setInvites((prev) => {
        if (prev.some((b) => b._id === board._id)) return prev
        return [...prev, board]
      })
    })

    return () => {
      disconnectSocket()
    }
  }, [])

  async function fetchBoards() {
    try {
      const res = await api.get('/boards')
      setBoards(res.data)
    } catch (err) {
      setError('Failed to load boards')
    } finally {
      setLoading(false)
    }
  }

  async function fetchInvites() {
    try {
      const res = await api.get('/boards/invites')
      setInvites(res.data)
    } catch (err) {
      // non-fatal - the boards list itself still works without this
      console.error('Failed to load invites:', err.message)
    }
  }

  async function respondToInvite(boardId, action) {
    setRespondingTo(boardId)
    try {
      await api.post(`/boards/${boardId}/invites/${action}`)
      setInvites((prev) => prev.filter((b) => b._id !== boardId))
      if (action === 'accept') fetchBoards()
    } catch (err) {
      setError(`Failed to ${action} invite`)
    } finally {
      setRespondingTo(null)
    }
  }

  async function handleCreateBoard(e) {
    e.preventDefault()
    if (!newBoardName.trim()) return
    try {
      await api.post('/boards', { name: newBoardName })
      setNewBoardName('')
      fetchBoards()
    } catch (err) {
      setError('Failed to create board')
    }
  }

  const initials = user?.name
    ? user.name.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase()
    : '?'

  return (
    <div style={{ maxWidth: 780, margin: '0 auto', padding: '28px 24px 48px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 20 }}>
        <p
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 26,
            fontWeight: 600,
            color: 'var(--color-ink)',
            margin: 0,
            letterSpacing: '-0.3px',
          }}
        >
          SyncBoard
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: '50%',
              background: 'var(--color-accent)',
              color: 'white',
              fontSize: 13,
              fontWeight: 500,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {initials}
          </div>
          <button
            onClick={logout}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--color-ink-secondary)',
              fontSize: 14.5,
              cursor: 'pointer',
            }}
          >
            Log out
          </button>
        </div>
      </div>

      <div style={{ borderBottom: '1px solid var(--color-border)', marginBottom: 32 }} />

      {invites.length > 0 && (
        <div style={{ marginBottom: 32 }}>
          <h2
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 19,
              fontWeight: 500,
              color: 'var(--color-ink)',
              marginBottom: 12,
            }}
          >
            Invites waiting on you
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {invites.map((board) => (
              <div
                key={board._id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  border: '1px solid var(--color-border)',
                  borderRadius: 10,
                  padding: '14px 18px',
                  background: 'var(--color-surface)',
                }}
              >
                <p style={{ margin: 0, fontSize: 15, color: 'var(--color-ink)' }}>
                  <strong>{board.owner?.name || 'Someone'}</strong> invited you to{' '}
                  <strong>{board.name}</strong>
                </p>
                <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                  <button
                    onClick={() => respondToInvite(board._id, 'accept')}
                    disabled={respondingTo === board._id}
                    style={{
                      padding: '7px 14px',
                      border: 'none',
                      borderRadius: 7,
                      background: 'var(--color-accent)',
                      color: 'white',
                      fontSize: 13.5,
                      fontWeight: 500,
                      cursor: 'pointer',
                    }}
                  >
                    Accept
                  </button>
                  <button
                    onClick={() => respondToInvite(board._id, 'decline')}
                    disabled={respondingTo === board._id}
                    style={{
                      padding: '7px 14px',
                      border: '1px solid var(--color-border)',
                      borderRadius: 7,
                      background: 'var(--color-surface)',
                      color: 'var(--color-ink-secondary)',
                      fontSize: 13.5,
                      cursor: 'pointer',
                    }}
                  >
                    Decline
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <h1
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 32,
          fontWeight: 500,
          color: 'var(--color-ink)',
          marginBottom: 8,
        }}
      >
        Your boards
      </h1>
      <p style={{ color: 'var(--color-ink-secondary)', fontSize: 15.5, marginBottom: 30 }}>
        Boards you own or collaborate on.
      </p>

      <form onSubmit={handleCreateBoard} style={{ display: 'flex', gap: 8, marginBottom: 36 }}>
        <input
          placeholder="New board name"
          value={newBoardName}
          onChange={(e) => setNewBoardName(e.target.value)}
          style={{
            flex: 1,
            padding: '12px 16px',
            border: '1px solid var(--color-border)',
            borderRadius: 8,
            fontSize: 15,
            fontFamily: 'var(--font-body)',
            background: 'var(--color-surface)',
          }}
        />
        <button
          type="submit"
          style={{
            padding: '12px 20px',
            border: 'none',
            borderRadius: 8,
            background: 'var(--color-accent)',
            color: 'white',
            fontSize: 15,
            fontWeight: 500,
            cursor: 'pointer',
          }}
        >
          Create board
        </button>
      </form>

      {error && <p style={{ color: 'var(--color-conflict)', fontSize: 15 }}>{error}</p>}

      {loading ? (
        <p style={{ color: 'var(--color-ink-secondary)', fontSize: 15 }}>Loading your boards...</p>
      ) : boards.length === 0 && !error ? (
        <div
          style={{
            border: '1px dashed var(--color-border)',
            borderRadius: 10,
            padding: 40,
            textAlign: 'center',
          }}
        >
          <p style={{ color: 'var(--color-ink)', fontSize: 16, fontFamily: 'var(--font-display)', marginBottom: 4 }}>
            Start your first board
          </p>
          <p style={{ color: 'var(--color-ink-secondary)', fontSize: 14 }}>
            Create a board above to begin planning with your team.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {boards.map((board) => (
            <BoardCard key={board._id} board={board} onClick={() => navigate(`/boards/${board._id}`)} />
          ))}
        </div>
      )}
    </div>
  )
}