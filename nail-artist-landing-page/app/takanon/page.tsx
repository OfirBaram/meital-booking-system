import type { Metadata } from 'next'
import { siteConfig } from '@/config/site-config'
import Link from 'next/link'

export const metadata: Metadata = {
  title:       'תקנון ותנאי שימוש — ' + siteConfig.identity.name,
  description: 'תקנון ותנאי שימוש של סטודיו ' + siteConfig.identity.name,
}

export default function TakanonPage() {
  return (
    <main className="min-h-screen bg-bg px-6 py-20" dir="rtl">
      <div className="mx-auto max-w-2xl">
        <Link
          href="/"
          className="mb-8 inline-block text-sm text-muted no-underline hover:text-charcoal"
        >
          ← חזרה לדף הבית
        </Link>
        <h1 className="mb-6 text-3xl font-light text-charcoal">
          תקנון ותנאי שימוש
        </h1>
        <p className="leading-[1.9] text-muted">
          עמוד זה יעודכן בקרוב עם תנאי השימוש המלאים של הסטודיו.
        </p>
      </div>
    </main>
  )
}
