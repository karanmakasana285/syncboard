import { io } from 'socket.io-client'

let socket = null

// creates the socket connection using the current JWT - called once when
// a user logs in / lands on a board, not on every render
export function connectSocket() {
  const token = localStorage.getItem('token')
  if (!token) return null

  socket = io('http://localhost:5001', {
    auth: { token }, // read by the backend's io.use() middleware during handshake
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
