// Kept separate so keyboard timing and cleanup can be verified without rendering.
export function listenForHold({ windowTarget, documentTarget, delay, onChange, isEditable, onPress = () => {},
  schedule = setTimeout, cancel = clearTimeout }) {
  let pressed = false, timer
  const release = () => {
    cancel(timer)
    pressed = false
    onPress(false)
    onChange(false)
  }
  const down = event => {
    if (event.key.toLowerCase() !== 'a' || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey || event.isComposing || isEditable(event.target)) return
    if (pressed || event.repeat) return
    pressed = true
    onPress(true)
    timer = schedule(() => onChange(true), delay)
  }
  const up = event => { if (event.key.toLowerCase() === 'a') release() }
  const hide = () => { if (documentTarget.hidden) release() }
  const focus = event => { if (isEditable(event.target)) release() }
  windowTarget.addEventListener('keydown', down)
  windowTarget.addEventListener('keyup', up)
  windowTarget.addEventListener('blur', release)
  documentTarget.addEventListener('visibilitychange', hide)
  documentTarget.addEventListener('focusin', focus)
  return () => {
    release()
    windowTarget.removeEventListener('keydown', down)
    windowTarget.removeEventListener('keyup', up)
    windowTarget.removeEventListener('blur', release)
    documentTarget.removeEventListener('visibilitychange', hide)
    documentTarget.removeEventListener('focusin', focus)
  }
}
