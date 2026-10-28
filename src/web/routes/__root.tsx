import { HeadContent, Scripts, createRootRoute } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import styles from '../styles.css?url'
import { productName } from '@/lib/brand'
import { brandAssetVersion, brandColors } from '../../core/brand.js'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' }, { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: `${productName} · Turn interviews into BPMN process diagrams` },
      { name: 'description', content: 'Free, open-source process mapping for consultants, analysts and operations teams. Use your own AI agent to turn interview transcripts into BPMN process diagrams, with every step linked back to the interview.' },
      { name: 'theme-color', content: brandColors.ink },
      { property: 'og:title', content: `${productName} · Turn interviews into BPMN process diagrams` },
      { property: 'og:description', content: 'Use your own AI agent to turn interviews into BPMN process diagrams, settle open questions, and link every step back to the interview.' },
      { property: 'og:image', content: `https://senda.hanifcarroll.com/brand/social-card.png?v=${brandAssetVersion}` },
      { property: 'og:image:width', content: '1200' }, { property: 'og:image:height', content: '630' },
      { property: 'og:image:alt', content: 'Senda · From process interviews to clear diagrams' },
      { name: 'twitter:card', content: 'summary_large_image' },
    ],
    links: [
      { rel: 'stylesheet', href: styles },
      { rel: 'icon', href: `/favicon.ico?v=${brandAssetVersion}`, sizes: 'any' },
      { rel: 'icon', href: `/favicon.svg?v=${brandAssetVersion}`, type: 'image/svg+xml' },
      { rel: 'apple-touch-icon', href: `/apple-touch-icon.png?v=${brandAssetVersion}`, sizes: '180x180' },
      { rel: 'manifest', href: '/site.webmanifest' },
    ],
  }),
  shellComponent: RootDocument,
})

function RootDocument({ children }: { children: ReactNode }) {
  return <html lang="en"><head><HeadContent /></head><body>{children}<Scripts /></body></html>
}
