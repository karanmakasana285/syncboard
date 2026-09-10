import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';

export default function AuthPage() {
  const [mode, setMode] = useState('login'); // 'login' or 'signup'
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const { login } = useAuth();
  const navigate = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    try {
      const endpoint = mode === 'login' ? '/auth/login' : '/auth/signup';
      const payload = mode === 'login' ? { email, password } : { name, email, password };
      const res = await api.post(endpoint, payload);
      login(res.data.token, res.data.user);
      navigate('/boards');
    } catch (err) {
      setError(err.response?.data?.error || 'Something went wrong');
    }
  }

  return (
    <div style={{ maxWidth: 320, margin: '80px auto' }}>
      <h2>{mode === 'login' ? 'Log In' : 'Sign Up'}</h2>
      <form onSubmit={handleSubmit}>
        {mode === 'signup' && (
          <input
            placeholder="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={{ display: 'block', width: '100%', marginBottom: 8 }}
          />
        )}
        <input
          placeholder="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={{ display: 'block', width: '100%', marginBottom: 8 }}
        />
        <input
          placeholder="Password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={{ display: 'block', width: '100%', marginBottom: 8 }}
        />
        {error && <p style={{ color: 'red' }}>{error}</p>}
        <button type="submit">{mode === 'login' ? 'Log In' : 'Sign Up'}</button>
      </form>
      <button onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}>
        {mode === 'login' ? 'Need an account? Sign up' : 'Have an account? Log in'}
      </button>
    </div>
  );
}
