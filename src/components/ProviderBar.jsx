import React from 'react'

export default function ProviderBar({ value, onChange, options }) {
  return (
    <div className="pb-bar" role="tablist" aria-label="Model selector">
      {options.map(opt => (
        <button
          key={opt.key}
          role="tab"
          aria-selected={value === opt.key}
          className={`pb-pill ${value === opt.key ? 'is-active' : ''}`}
          onClick={() => onChange(opt.key)}
          title={opt.label}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

