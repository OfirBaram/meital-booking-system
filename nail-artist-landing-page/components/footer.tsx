import { siteConfig } from '@/config/site-config'
import { SocialLinks } from '@/components/SocialLink'

export function Footer() {
  const { identity, social, legal } = siteConfig
  const year = new Date().getFullYear()

  return (
    <footer
      className="bg-charcoal px-6 pt-14 pb-8"
      style={{ borderTop: '1px solid rgba(250,245,240,0.08)' }}
      role="contentinfo"
    >
      <div className="mx-auto max-w-7xl">

        <div className="mb-10 grid gap-10 sm:grid-cols-2 lg:grid-cols-4">

          <div className="lg:col-span-2">
            <a href="#" className="mb-3 block text-lg font-semibold tracking-wide text-bg no-underline"
              aria-label={identity.name + ' — חזרה לראש הדף'}>
              {identity.name}
            </a>
            <p className="mb-5 max-w-xs text-sm leading-[1.8] text-bg/55">
              סטודיו עיצוב ציפורניים בוטיק ברמת גן. חוויה אישית, חומרים מקצועיים, תוצאות מושלמות.
            </p>
            <div className="flex gap-1" aria-label="רשתות חברתיות">
              <SocialLinks
                social={social}
                linkClassName="inline-flex size-9 items-center justify-center rounded-full text-bg/45 transition-colors duration-200 hover:text-champagne hover:bg-champagne/10"
              />
            </div>
          </div>

          <div>
            <p className="mb-4 text-xs font-semibold uppercase tracking-[0.15em] text-champagne">שירותים</p>
            <ul className="space-y-2 text-sm text-bg/55 list-none p-0 m-0">
              {siteConfig.services.map((s) => (
                <li key={s.id}>
                  <a href="#services" className="no-underline transition-colors hover:text-bg/90">{s.title}</a>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="mb-4 text-xs font-semibold uppercase tracking-[0.15em] text-champagne">פרטים</p>
            <ul className="space-y-2 text-sm text-bg/55 list-none p-0 m-0">
              <li>{identity.address}, רמת גן</li>
              <li>{siteConfig.business.hours}</li>
              {identity.phone && (
                <li>
                  <a href={`tel:${identity.phone}`} className="no-underline hover:text-bg/90">{identity.phone}</a>
                </li>
              )}
            </ul>
          </div>
        </div>

        <div
          className="flex flex-wrap items-center justify-between gap-4 border-t pt-7"
          style={{ borderColor: 'rgba(250,245,240,0.08)' }}
        >
          <p className="text-xs text-bg/40">&copy; {year} {identity.name}. כל הזכויות שמורות.</p>
          <nav aria-label="קישורי מדיניות">
            <div className="flex gap-5">
              <a href={legal.terms}   className="text-xs text-bg/40 no-underline transition-colors hover:text-champagne">תקנון</a>
              <a href={legal.privacy} className="text-xs text-bg/40 no-underline transition-colors hover:text-champagne">פרטיות</a>
            </div>
          </nav>
        </div>

      </div>
    </footer>
  )
}
