import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import QuranGraph from './QuranGraph.jsx'
import { ErrorBoundary } from './components/ErrorBoundary.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <QuranGraph />
    </ErrorBoundary>
  </StrictMode>,
)
