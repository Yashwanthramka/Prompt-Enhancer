import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import App from './App.jsx'            // landing page (unchanged)
import PromptApp from './pages/Enhancer.jsx' // our “app” page (see below)
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <BrowserRouter>
    <Routes>
      <Route path="/" element={<App />} />
      <Route path="/app" element={<PromptApp />} />
    </Routes>
  </BrowserRouter>
)

