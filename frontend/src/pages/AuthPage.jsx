import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api/client'
import { useAuth } from '../context/AuthContext'

const CYCLE_WORDS = ['real time', 'one place', 'sync', 'harmony']

function useTypewriter(words) {
  const [text, setText] = useState('')
  const [wordIndex, setWordIndex] = useState(0)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    const currentWord = words[wordIndex % words.length]
    const speed = deleting ? 40 : 80
    const pauseAtFullWord = 1200
    const pauseAtEmpty = 300

    let timeout
    if (!deleting && text === currentWord) {
      timeout = setTimeout(() => setDeleting(true), pauseAtFullWord)
    } else if (deleting && text === '') {
      timeout = setTimeout(() => {
        setDeleting(false)
        setWordIndex((i) => i + 1)
      }, pauseAtEmpty)
    } else {
      timeout = setTimeout(() => {
        setText((prev) =>
          deleting ? currentWord.slice(0, prev.length - 1) : currentWord.slice(0, prev.length + 1)
        )
      }, speed)
    }
    return () => clearTimeout(timeout)
  }, [text, deleting, wordIndex, words])

  return text
}

export default function AuthPage() {
  const [mode, setMode] = useState('login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const { login } = useAuth()
  const navigate = useNavigate()
  const typedWord = useTypewriter(CYCLE_WORDS)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    try {
      const endpoint = mode === 'login' ? '/auth/login' : '/auth/signup'
      const payload = mode === 'login' ? { email, password } : { name, email, password }
      const res = await api.post(endpoint, payload)
      login(res.data.token, res.data.user)
      navigate('/boards')
    } catch (err) {
      setError(err.response?.data?.error || 'Something went wrong')
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--color-paper)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '64px 24px',
      }}
    >
      <p
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 34,
          fontWeight: 600,
          color: 'var(--color-ink)',
          letterSpacing: '-0.4px',
          marginBottom: 48,
        }}
      >
        SyncBoard
      </p>

      <h1
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 46,
          fontWeight: 500,
          color: 'var(--color-ink)',
          textAlign: 'center',
          lineHeight: 1.25,
          marginBottom: 16,
          maxWidth: 620,
        }}
      >
        Plan together, in{' '}
        <span style={{ color: 'var(--color-accent)' }}>
          {typedWord}
          <span style={{ opacity: 0.5 }}>|</span>
        </span>
      </h1>

      <p
        style={{
          fontSize: 19,
          color: 'var(--color-ink)',
          textAlign: 'center',
          maxWidth: 500,
          marginBottom: 44,
          lineHeight: 1.65,
        }}
      >
        A Kanban board for teams working at the same moment, not one after another - live sync,
        clear conflict handling, and no lost work.
      </p>

      <div style={{ width: '100%', maxWidth: 360 }}>
        <form onSubmit={handleSubmit}>
          {mode === 'signup' && (
            <input
              placeholder="Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={inputStyle}
            />
          )}
          <input
            placeholder="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={inputStyle}
          />
          <div style={{ position: 'relative' }}>
            <input
              placeholder="Password"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={{ ...inputStyle, paddingRight: 50 }}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              style={{
                position: 'absolute',
                right: 18,
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'none',
                border: 'none',
                color: 'var(--color-ink-secondary)',
                fontSize: 13,
                fontWeight: 500,
                cursor: 'pointer',
                padding: 0,
              }}
            >
              {showPassword ? 'Hide' : 'Show'}
            </button>
          </div>
          {error && <p style={{ color: 'var(--color-conflict)', fontSize: 14, margin: '12px 0 0' }}>{error}</p>}
          <button type="submit" style={submitStyle}>
            {mode === 'login' ? 'Log in' : 'Create account'}
          </button>
        </form>
        <button onClick={() => setMode(mode === 'login' ? 'signup' : 'login')} style={toggleStyle}>
          {mode === 'login' ? "Don't have an account? Sign up" : 'Already have an account? Log in'}
        </button>
      </div>
    </div>
  )
}

const inputStyle = {
  display: 'block',
  width: '100%',
  padding: '13px 18px',
  marginBottom: 12,
  border: '1px solid var(--color-border)',
  borderRadius: 999,
  fontSize: 15,
  fontFamily: 'var(--font-body)',
  background: 'var(--color-surface)',
  boxSizing: 'border-box',
  textAlign: 'center',
}

const submitStyle = {
  width: '100%',
  padding: '13px 18px',
  border: 'none',
  borderRadius: 999,
  background: 'var(--color-accent)',
  color: 'white',
  fontSize: 15,
  fontWeight: 500,
  cursor: 'pointer',
  marginTop: 4,
}

const toggleStyle = {
  display: 'block',
  width: '100%',
  textAlign: 'center',
  marginTop: 16,
  background: 'none',
  border: 'none',
  color: 'var(--color-ink-secondary)',
  fontSize: 14,
  cursor: 'pointer',
  padding: 0,
}
