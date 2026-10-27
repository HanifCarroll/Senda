import { HeadContent, Scripts, createRootRoute } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import styles from '../styles.css?url'
import { productName } from '@/lib/brand'

export const Route = createRootRoute({
  head: () => ({ meta: [{ charSet: 'utf-8' }, { name: 'viewport', content: 'width=device-width, initial-scale=1' }, { title: `${productName} · From process interviews to clear diagrams` }, { name: 'description', content: 'Use your own agent to turn transcripts into process diagrams, clarify missing details, and keep revisions grounded in what people said.' }], links: [{ rel: 'stylesheet', href: styles }, { rel: 'icon', href: '/favicon.svg', type: 'image/svg+xml' }] }),
  shellComponent: RootDocument,
})

function RootDocument({ children }: { children: ReactNode }) {
  return <html lang="en"><head><HeadContent /></head><body>{children}<Scripts /></body></html>
}
