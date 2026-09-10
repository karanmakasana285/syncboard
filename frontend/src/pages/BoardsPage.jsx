/* eslint-disable no-unused-vars */
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api/client'
import { useAuth } from '../context/AuthContext'

export default function BoardsPage() {
  const [boards, setBoards] = useState([])
  const [newBoardName, setNewBoardName] = useState('')
  const [error, setError] = useState('')
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    fetchBoards()
  }, [])

  async function fetchBoards() {
    try {
      const res = await api.get('/boards')
      setBoards(res.data)
    } catch (err) {
      setError('Failed to load boards')
    }
  }

  async function handleCreateBoard(e) {
    e.preventDefault()
    if (!newBoardName.trim()) return
    try {
      await api.post('/boards', { name: newBoardName })
      setNewBoardName('')
      fetchBoards() // refetch - simplest way to keep list in sync, fine at this scale
    } catch (err) {
      setError('Failed to create board')
    }
  }

  return (
    <div style={{ padding: 20, maxWidth: 600, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <h1>Welcome, {user?.name}</h1>
        <button onClick={logout}>Log out</button>
      </div>

      <form onSubmit={handleCreateBoard} style={{ margin: '20px 0' }}>
        <input
          placeholder="New board name"
          value={newBoardName}
          onChange={(e) => setNewBoardName(e.target.value)}
        />
        <button type="submit">Create Board</button>
      </form>

      {error && <p style={{ color: 'red' }}>{error}</p>}

      <ul style={{ listStyle: 'none', padding: 0 }}>
        {boards.map((board) => (
          <li key={board._id} style={{ marginBottom: 8 }}>
            <button onClick={() => navigate(`/boards/${board._id}`)}>
              {board.name}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
