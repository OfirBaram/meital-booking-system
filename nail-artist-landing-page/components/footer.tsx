import { siteConfig } from '@/config/site-config'
import { SocialLinks } from '@/components/SocialLink'

export function Footer() {
  const { identity, social, legal } = siteConfig
  const year = new Date().getFullYear()

  return (
    <footer
      className="bg-[var(--color-charcoal)] px-6 py-7"
      style={{ borderTop: '1px solid rgba(250,245,240,0.08)' }}
      role="contentinfo"
    >
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4">

        {/* Logo */}
        <a
          href="#"
          className="text-base font-semibold tracking-wide no-underline"
          style={{ color: '#FAF5F0' }}
          aria-label={identity.name + ' — חזרה לראש הדף'}
        >
          {identity.name}
        </a>

        {/* Copyright */}
        <p
          className="text-xs tracking-wide"
          style={{ color: 'rgba(250,245,240,0.45)' }}
        >
          &copy; {year} {identity.name}. כל הזכויות שמורות.
        </p>

        {/* Legal links */}
        <nav aria-label="קישורי מדיניות">
          <div className="flex gap-5">
            <a
              href={legal.terms}
              className="text-xs no-underline transition-colors duration-200 text-[rgba(250,245,240,0.45)] hover:text-[var(--color-champagne)]"
            >
              תקנון ותנאי שימוש
            </a>
            <a
              href={legal.privacy}
              className="text-xs no-underline transition-colors duration-200 text-[rgba(250,245,240,0.45)] hover:text-[var(--color-champagne)]"
            >
              מדיניות פרטיות
            </a>
          </div>
        </nav>

        {/* Social */}
        <div aria-label="רשתות חברתיות" className="flex gap-1">
          <SocialLinks
            social={social}
            linkClassName="inline-flex size-8 items-center justify-center rounded-full text-[rgba(250,245,240,0.45)] transition-colors duration-200 hover:text-[var(--color-champagne)] hover:bg-[var(--color-champagne)]/10"
          />
        </div>

      </div>
    </footer>
  )
}
