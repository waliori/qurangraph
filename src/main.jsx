import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/theme.css'
import QuranGraph from './QuranGraph.jsx'
import { ErrorBoundary } from './components/ErrorBoundary.jsx'
import { I18nProvider } from './i18n/index.js'
import { WorkspaceProvider } from './hooks/useWorkspace.js'
import { installGlobalErrorCapture } from './errorLog.js'

// Record uncaught errors / promise rejections locally (never uploaded) so a crash
// leaves an inspectable trace instead of only a transient console.error.
installGlobalErrorCapture()

// Ask the browser to treat this origin's storage as persistent: the whole workspace
// lives in localStorage, and without this Safari evicts it after ~7 days of non-use
// and other browsers may clear it under storage pressure. Best-effort, no prompt in
// most browsers; denial just leaves the status quo.
try { navigator.storage?.persist?.().catch(() => {}) } catch { /* older browsers */ }

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <I18nProvider>
      <WorkspaceProvider>
        <ErrorBoundary>
          <QuranGraph />
        </ErrorBoundary>
      </WorkspaceProvider>
    </I18nProvider>
  </StrictMode>,
)

// Register the service worker for offline use (production only). Scope is the
// served base path so it works on a domain root or a GitHub-Pages sub-path.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  // Reload once when a freshly-deployed SW takes control, so an open tab picks up the
  // new build instead of running old assets against a new cache. Guard against the
  // first-ever install (no prior controller) and against reload loops.
  const hadController = !!navigator.serviceWorker.controller
  let refreshing = false
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (refreshing || !hadController) return
    refreshing = true
    window.location.reload()
  })
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {})
  })
}
