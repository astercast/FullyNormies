export default function Footer() {
  return (
    <footer style={{ borderTop: '1px solid var(--line)', marginTop: 'auto' }}>
      <div style={{
        maxWidth: 1080, margin: '0 auto', padding: '1rem 1.25rem 1.4rem',
        display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between',
        alignItems: 'baseline', gap: '.5rem'
      }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.35rem .8rem', alignItems: 'center' }}>
          <span style={{ fontSize: '.5rem', letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--ink-muted)' }}>CC0</span>
          <span style={{ color: 'var(--ink-muted)', fontSize: '.5rem' }}>·</span>
          <a href="https://normiesarchive.vercel.app" target="_blank" rel="noopener"
            style={{ fontSize: '.5rem', letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--ink-muted)', textDecoration: 'none' }}>
            Normies Archive ↗
          </a>
          <span style={{ color: 'var(--ink-muted)', fontSize: '.5rem' }}>·</span>
          <a href="https://normies.art" target="_blank" rel="noopener"
            style={{ fontSize: '.5rem', letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--ink-muted)', textDecoration: 'none' }}>
            normies.art ↗
          </a>
          <span style={{ color: 'var(--ink-muted)', fontSize: '.5rem' }}>·</span>
          <a href="/admin" style={{ fontSize: '.5rem', letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--ink-muted)', textDecoration: 'none' }}>admin</a>
        </div>
        <div style={{ fontSize: '.5rem', letterSpacing: '.06em', color: 'var(--ink-muted)', whiteSpace: 'nowrap' }}>
          Built by{' '}
          <a href="https://x.com/aster0x" target="_blank" rel="noopener"
            style={{ color: 'var(--ink)', fontWeight: 700, textDecoration: 'none' }}>
            @aster0x
          </a>
        </div>
      </div>
    </footer>
  )
}
