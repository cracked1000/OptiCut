import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { BlockchainProvider } from './hooks/useBlockchain.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BlockchainProvider>
      <App />
    </BlockchainProvider>
  </StrictMode>,
)
