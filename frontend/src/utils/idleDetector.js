// Reports whether the user is 'active' or 'idle' in this browser tab.
//
// Idle = no mouse / keyboard / touch / scroll activity for `timeoutMs`, OR
// the tab is hidden (switched away, minimized). Coming back to the tab
// counts as activity immediately.
//
// onChange fires only when the status actually CHANGES, never per mouse
// move - so the socket sees a handful of messages per session, not a stream.
export function createIdleDetector({ timeoutMs = 120000, onChange }) {
  let status = 'active'
  let timer = null

  function setStatus(next) {
    if (next === status) return
    status = next
    onChange(status)
  }

  function startTimer() {
    clearTimeout(timer)
    timer = setTimeout(() => setStatus('idle'), timeoutMs)
  }

  function onActivity() {
    // a hidden tab can still receive stray events (e.g. timers/synthetic
    // input); being hidden always wins over activity.
    if (document.hidden) return
    setStatus('active')
    startTimer()
  }

  function onVisibilityChange() {
    if (document.hidden) {
      clearTimeout(timer)
      setStatus('idle')
    } else {
      onActivity()
    }
  }

  const events = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'wheel']
  events.forEach((e) => window.addEventListener(e, onActivity, { passive: true }))
  document.addEventListener('visibilitychange', onVisibilityChange)

  // initial state: a tab opened in the background starts idle
  if (document.hidden) setStatus('idle')
  else startTimer()

  return {
    getStatus: () => status,
    stop() {
      clearTimeout(timer)
      events.forEach((e) => window.removeEventListener(e, onActivity))
      document.removeEventListener('visibilitychange', onVisibilityChange)
    },
  }
}