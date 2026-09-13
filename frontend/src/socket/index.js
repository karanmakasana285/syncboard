import { io } from 'socket.io-client'

let socket = null

// VITE_SOCKET_URL is set on Vercel to the real deployed backend's root URL
// (no /api suffix - Socket.io connects at the server root, not under /api).
// Locally, falls back to our dev server.
export function connectSocket() {
  const token = localStorage.getItem('token')
  if (!token) return null

  socket = io(import.meta.env.VITE_SOCKET_URL || 'http://localhost:5001', {
    auth: { token },
  })

  return socket
}

export function getSocket() {
  return socket
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect()
    socket = null
  }
}
