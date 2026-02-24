import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './fonts.css'
import QuranNetwork from '../quran_network_v8.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <QuranNetwork />
  </StrictMode>,
)
