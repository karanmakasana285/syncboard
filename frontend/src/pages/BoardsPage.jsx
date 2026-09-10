import { useAuth } from '../context/AuthContext'

export default function BoardsPage() {
  const { user, logout } = useAuth()

  return (
    <div style={{ padding: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <h1>Welcome, {user?.name}</h1>
        <button onClick={logout}>Log out</button>
      </div>
      <p>Boards will render here — next step.</p>
    </div>
  )
}
