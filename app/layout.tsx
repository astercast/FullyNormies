import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'FULLNORMIES — Sprite Engine',
  description: 'Full-body pixel art sprites for every Normie NFT. Live server API — one URL, four poses, zero setup.',
  openGraph: {
    title: 'FULLNORMIES',
    description: 'Turn any Normie NFT into a full-body pixel art game sprite.',
    url: 'https://fullnormies.vercel.app',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="light" suppressHydrationWarning>
      <head>
        <meta name="color-scheme" content="light only" />
        <script dangerouslySetInnerHTML={{
          __html: `
            (function(){
              var s = localStorage.getItem('fn_theme');
              var d = window.matchMedia('(prefers-color-scheme:dark)').matches;
              var t = s || (d ? 'dark' : 'light');
              document.documentElement.setAttribute('data-theme', t);
            })();
          `
        }} />
      </head>
      <body>{children}</body>
    </html>
  )
}
