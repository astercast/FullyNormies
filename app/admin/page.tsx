"use client"
import { useState } from 'react'
import { useEffect } from 'react'
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

  const [pass, setPass] = useState('')
  const [authed, setAuthed] = useState(false)
  const [sprites, setSprites] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState('')
  const [deleting, setDeleting] = useState<string | null>(null)

  useEffect(() => {
    if (authed) {
      fetch('/api/sprites').then(r => r.json()).then(d => setSprites(d.sprites || []))
    }
  }, [authed])

  function handleAuth(e: React.FormEvent) {
    e.preventDefault()
    if (pass === 'fullynormies') setAuthed(true)
    else setResult('Wrong passcode')
  }

  async function handleDelete(url: string) {
    setDeleting(url)
    setResult('')
    const res = await fetch('/api/admin-delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, passcode: 'fullynormies' })
    })
    const data = await res.json()
    if (data.success) {
      setSprites(sprites => sprites.filter(s => s.url !== url))
      setResult('Deleted!')
    } else setResult(data.error || 'Error')
    setDeleting(null)
  }

  if (!authed) {
    return (
      <div style={{ maxWidth: 400, margin: '4rem auto', padding: 24, border: '1px solid #ccc', borderRadius: 8 }}>
        <h2>Admin Login</h2>
        <form onSubmit={handleAuth}>
          <input
            type="password"
            placeholder="Passcode"
            value={pass}
            onChange={e => setPass(e.target.value)}
            style={{ width: '100%', marginBottom: 12, padding: 8 }}
          />
          <button type="submit" style={{ width: '100%', padding: 10 }}>
            Login
          </button>
        </form>
        {result && <div style={{ marginTop: 16, color: 'red' }}>{result}</div>}
        <div style={{ marginTop: 32 }}>
          <Link href="/gallery">← Back to Gallery</Link>
        </div>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 700, margin: '4rem auto', padding: 24, border: '1px solid #ccc', borderRadius: 8 }}>
      <h2>Admin Gallery Delete</h2>
      <div style={{ marginBottom: 24 }}>
        <Link href="/gallery">← Back to Gallery</Link>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 16 }}>
        {sprites.map(s => (
          <div key={s.url} style={{ border: '1px solid #eee', borderRadius: 6, padding: 10, background: '#fafbfc' }}>
            <img src={s.url} alt={s.id ? `Normie #${s.id}` : 'Sprite'} style={{ width: '100%', aspectRatio: '1', objectFit: 'contain', marginBottom: 8 }} />
            <div style={{ fontSize: '.9em', marginBottom: 8 }}>{s.id ? `#${s.id}` : ''}</div>
            <button onClick={() => handleDelete(s.url)} disabled={deleting === s.url} style={{ width: '100%', padding: 8, background: '#f33', color: '#fff', border: 'none', borderRadius: 4 }}>
              {deleting === s.url ? 'Deleting...' : 'Delete'}
            </button>
          </div>
        ))}
      </div>
      {result && <div style={{ marginTop: 16, color: result === 'Deleted!' ? 'green' : 'red' }}>{result}</div>}
    </div>
  )
}
}
