// Dev-only: record uncaught errors so they can be read programmatically.
if (import.meta.env.DEV) {
  window.__errors = []
  window.addEventListener('error', (e) => {
    window.__errors.push(String(e.error?.message || e.message))
  })
  window.addEventListener('unhandledrejection', (e) => {
    window.__errors.push('promise: ' + String(e.reason?.message || e.reason))
  })
}

import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
