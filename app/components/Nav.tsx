'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'

export default function Nav() {
  const path = usePathname()
  const [theme, setTheme] = useState<'light'|'dark'>(() => {
    if (typeof window === 'undefined') return 'light'
    const saved = localStorage.getItem('fn_theme')
    if (saved === 'light' || saved === 'dark') return saved
    return window.matchMedia('(prefers-color-scheme:dark)').matches ? 'dark' : 'light'
  })

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('fn_theme', theme)
  }, [theme])

  function toggle() {
    const next = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
  }

  const tabs = [
    { href: '/',        label: 'Home'          },
    { href: '/engine',  label: 'Sprite Engine' },
    { href: '/gallery', label: 'Gallery'       },
  ]

  return (
    <header style={{ borderBottom: '1px solid var(--line)' }}>
      <div style={{ maxWidth: 1080, margin: '0 auto', padding: '1.2rem 1.25rem .9rem', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem' }}>
        <Link href="/" style={{ textDecoration: 'none' }}>
          <div style={{ fontSize: 'clamp(1.4rem,5vw,2.6rem)', fontWeight: 900, letterSpacing: '-.05em', lineHeight: 1, color: 'var(--ink)' }}>
            # FULLNORMIES<span style={{ opacity: .2 }}>.</span>
          </div>
          <div style={{ marginTop: '.3rem', fontSize: '.75rem', letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--ink-muted)' }}>
            40×40 Faces → Full Body Sprites
          </div>
        </Link>
        <button onClick={toggle} style={{
          flexShrink: 0, background: 'transparent', border: '1px solid var(--line)',
          color: 'var(--ink)', fontFamily: 'inherit', fontSize: '.7rem',
          letterSpacing: '.1em', textTransform: 'uppercase', padding: '.4rem .85rem',
          cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '.35rem',
          userSelect: 'none', WebkitTapHighlightColor: 'transparent'
        }}>
          <span>{theme === 'dark' ? '◑' : '◐'}</span>
          <span>{theme === 'dark' ? 'Light' : 'Dark'}</span>
        </button>
      </div>
      <div style={{ maxWidth: 1080, margin: '0 auto', padding: '0 1.25rem', display: 'flex' }}>
        {tabs.map(t => (
          <Link key={t.href} href={t.href} style={{
            background: 'transparent', border: 'none',
            borderBottom: `2px solid ${path === t.href ? 'var(--ink)' : 'transparent'}`,
            color: path === t.href ? 'var(--ink)' : 'var(--ink-muted)',
            fontFamily: 'inherit', fontSize: '.72rem', letterSpacing: '.1em',
            textTransform: 'uppercase', padding: '.65rem .85rem .55rem',
            cursor: 'pointer', textDecoration: 'none', display: 'block',
            userSelect: 'none', WebkitTapHighlightColor: 'transparent'
          }}>
            {t.label}
          </Link>
        ))}
      </div>
    </header>
  )
}
