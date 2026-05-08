import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import posthog from 'posthog-js'
import './index.css'
import App from './App.jsx'

const POSTHOG_KEY = import.meta.env.VITE_POSTHOG_KEY;
if (POSTHOG_KEY) {
  posthog.init(POSTHOG_KEY, { api_host: 'https://us.i.posthog.com', person_profiles: 'identified_only' });
}

export { posthog };

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
