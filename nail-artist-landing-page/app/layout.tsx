import type { Metadata, Viewport } from 'next'
import { Assistant } from 'next/font/google'
import { siteConfig } from '@/config/site-config'
import './globals.css'

/* ── Hebrew + Latin subsets ── */
const assistant = Assistant({
  subsets:  ['hebrew', 'latin'],
  weight:   ['300', '400', '500', '600', '700'],
  variable: '--font-assistant',
  display:  'swap',
})

/* ── SEO metadata ── */
export const metadata: Metadata = {
  title:       siteConfig.seo.title,
  description: siteConfig.seo.description,
  keywords:    siteConfig.seo.keywords,
  authors:     [{ name: siteConfig.identity.name }],
  metadataBase: new URL(siteConfig.seo.siteUrl),
  alternates:  { canonical: '/' },
  openGraph: {
    type:        'website',
    locale:      'he_IL',
    title:       siteConfig.seo.title,
    description: siteConfig.seo.description,
    images:      [{ url: siteConfig.seo.ogImage, width: 1200, height: 630 }],
    siteName:    siteConfig.identity.studio,
  },
  twitter: {
    card:        'summary_large_image',
    title:       siteConfig.seo.title,
    description: siteConfig.seo.description,
    images:      [siteConfig.seo.ogImage],
  },
  other: {
    // Security headers that must also be set at the CDN/server level
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy':        'strict-origin-when-cross-origin',
  },
}

export const viewport: Viewport = {
  width:        'device-width',
  initialScale: 1,
  themeColor:   '#FAF5F0',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // dir="rtl" + lang="he" → enables Tailwind rtl: variant & correct BiDi
    <html lang="he" dir="rtl" className={assistant.variable}>
      <head>
        {/* JSON-LD structured data */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type':    'BeautySalon',
            name:        siteConfig.identity.name,
            description: siteConfig.seo.description,
            address: {
              '@type':         'PostalAddress',
              streetAddress:   siteConfig.identity.address,
              addressLocality: siteConfig.identity.city,
              addressCountry:  'IL',
            },
            url:          siteConfig.seo.siteUrl,
            priceRange:   siteConfig.business.priceRange,
            openingHours: 'Tu-Sa 10:00-19:00',
          })}}
        />
      </head>
      <body>
        {/* WCAG 2.4.1 skip link */}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:right-4 focus:z-[9999] focus:rounded focus:bg-[var(--color-charcoal)] focus:px-4 focus:py-2 focus:text-sm focus:text-white"
        >
          דלג לתוכן הראשי
        </a>
        {children}
      </body>
    </html>
  )
}
