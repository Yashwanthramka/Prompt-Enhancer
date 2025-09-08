import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import App from './App.jsx'
import PromptApp from './pages/Enhancer.jsx'
import Settings from './pages/Settings.jsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <BrowserRouter>
    <Routes>
      <Route path="/" element={<App />} />
      <Route path="/app" element={<PromptApp />} />
      <Route path="/settings" element={<Settings />} />
    </Routes>
  </BrowserRouter>
)

