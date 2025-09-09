import { useEffect, useMemo, useRef, useState } from 'react'
import { listRulesets, readRuleset, writeRuleset, createRuleset } from '../lib/api'

export default function RulesetEditor({ className }) {
  const [list, setList] = useState([])
  const [selected, setSelected] = useState('')
  const [text, setText] = useState('')
  const [status, setStatus] = useState('')
  const [newId, setNewId] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [autoFormat, setAutoFormat] = useState(true)
  const abortRef = useRef()

  useEffect(() => {
    listRulesets().then(setList).catch((e) => setStatus(String(e)))
  }, [])

  useEffect(() => {
    if (!selected) { setText(''); return }
    ;(async () => {
      try {
        setLoading(true)
        const content = await readRuleset(selected)
        setText(JSON.stringify(content, null, 2))
        setStatus('')
      } catch (e) { setStatus(`Load failed: ${e}`) } finally { setLoading(false) }
    })()
  }, [selected])

  const parsed = useMemo(() => {
    try { return JSON.parse(text) } catch { return null }
  }, [text])

  const format = () => {
    try { setText(JSON.stringify(JSON.parse(text), null, 2)); setStatus('Formatted') } catch { setStatus('Invalid JSON') }
  }

  const save = async () => {
    if (!selected) return
    try {
      setSaving(true); setStatus('')
      const json = parsed ?? JSON.parse(text)
      await writeRuleset(selected, json)
      setStatus('Saved')
    } catch (e) { setStatus(`Save failed: ${e}`) } finally { setSaving(false) }
  }

  const create = async () => {
    const id = (newId || '').trim()
    if (!id) return
    try {
      setSaving(true); setStatus('')
      const base = { system: 'You are a helpful assistant.' }
      await createRuleset(id, base)
      setList((ls) => [...new Set([...ls, id])])
      setSelected(id)
      setText(JSON.stringify(base, null, 2))
      setNewId('')
      setStatus('Created')
    } catch (e) { setStatus(`Create failed: ${e}`) } finally { setSaving(false) }
  }

  return (
    <section className={`settings-card ${className || ''}`}>
      <h2 className="settings-title">Rulesets</h2>
      <div className="settings-body">
        <div className="form-row">
          <label>Create new</label>
          <div className="form-actions">
            <input className="c-ask-input" placeholder="my-ruleset" value={newId} onChange={e => setNewId(e.target.value)} style={{ maxWidth: 240 }} />
            <button className="sp-logout" disabled={!newId || saving} onClick={create}>Create</button>
          </div>
        </div>
        <div className="form-row">
          <label>Pick ruleset</label>
          <select className="c-ask-input" value={selected} onChange={e => setSelected(e.target.value)}>
            <option value="">Select…</option>
            {list.map(x => <option key={x} value={x}>{x}</option>)}
          </select>
        </div>
        {selected && (
          <>
            <div className="form-row" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <label style={{ marginRight: 8 }}>Editor</label>
              <button className="sp-logout" onClick={format} title="Format JSON">Format</button>
              <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                <input type="checkbox" checked={autoFormat} onChange={(e)=>setAutoFormat(e.target.checked)} /> Auto-format on blur
              </label>
            </div>
            <textarea
              className="c-ask-input"
              style={{ minHeight: 260, width: '100%', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace' }}
              value={text}
              onChange={e => setText(e.target.value)}
              onBlur={() => { if (autoFormat) format() }}
            />
            <div className="form-actions">
              <button className="sp-logout" disabled={!parsed || saving} onClick={save}>Save ruleset</button>
              {status && <span className="hint" style={{ marginLeft: 10 }}>{status}</span>}
            </div>
          </>
        )}
        {loading && <div className="hint">Loading…</div>}
      </div>
    </section>
  )
}

