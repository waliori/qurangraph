import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import QuranGraph from './QuranGraph.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <QuranGraph />
  </StrictMode>,
)
