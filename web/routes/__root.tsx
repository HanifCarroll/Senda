import { HeadContent, Scripts, createRootRoute } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import styles from '../styles.css?url'
import { productName } from '@/lib/brand'
import { brandColors } from '../../src/brand.js'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' }, { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: `${productName} · From process interviews to clear diagrams` },
      { name: 'description', content: 'Use your own agent to turn transcripts into process diagrams, clarify missing details, and keep revisions grounded in what people said.' },
      { name: 'theme-color', content: brandColors.ink },
      { property: 'og:title', content: `${productName} · From process interviews to clear diagrams` },
      { property: 'og:description', content: 'Create and revise process diagrams from transcripts, with evidence and clarification.' },
      { property: 'og:image', content: 'https://senda.hanifcarroll.com/brand/social-card.png' },
      { property: 'og:image:width', content: '1200' }, { property: 'og:image:height', content: '630' },
      { property: 'og:image:alt', content: 'Senda · From process interviews to clear diagrams' },
      { name: 'twitter:card', content: 'summary_large_image' },
    ],
    links: [
      { rel: 'stylesheet', href: styles },
      { rel: 'icon', href: '/favicon.ico?v=ink-teal-1', sizes: 'any' },
      { rel: 'icon', href: '/favicon.svg?v=ink-teal-1', type: 'image/svg+xml' },
      { rel: 'apple-touch-icon', href: '/apple-touch-icon.png?v=ink-teal-1', sizes: '180x180' },
      { rel: 'manifest', href: '/site.webmanifest' },
    ],
  }),
  shellComponent: RootDocument,
})

function RootDocument({ children }: { children: ReactNode }) {
  return <html lang="en"><head><HeadContent /></head><body>{children}<Scripts /></body></html>
}
