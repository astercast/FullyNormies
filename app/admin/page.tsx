"use client"
import { useState } from 'react'
import Link from 'next/link'

export default function AdminPage() {
  const [input, setInput] = useState('')
  const [pass, setPass] = useState('')
  const [result, setResult] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleDelete() {
    setLoading(true)
    setResult('')
    const res = await fetch('/api/admin-delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: input, passcode: pass })
    })
    const data = await res.json()
    if (data.success) setResult('Deleted!')
    else setResult(data.error || 'Error')
    setLoading(false)
  }

  return (
    <div style={{ maxWidth: 400, margin: '4rem auto', padding: 24, border: '1px solid #ccc', borderRadius: 8 }}>
      <h2>Admin Gallery Delete</h2>
      <input
        type="text"
        placeholder="Paste sprite image URL here"
        value={input}
        onChange={e => setInput(e.target.value)}
        style={{ width: '100%', marginBottom: 12, padding: 8 }}
      />
      <input
        type="password"
        placeholder="Passcode"
        value={pass}
        onChange={e => setPass(e.target.value)}
        style={{ width: '100%', marginBottom: 12, padding: 8 }}
      />
      <button onClick={handleDelete} disabled={loading || !input || !pass} style={{ width: '100%', padding: 10 }}>
        {loading ? 'Deleting...' : 'Delete'}
      </button>
      {result && <div style={{ marginTop: 16, color: result === 'Deleted!' ? 'green' : 'red' }}>{result}</div>}
      <div style={{ marginTop: 32 }}>
        <Link href="/gallery">← Back to Gallery</Link>
      </div>
    </div>
  )
}
