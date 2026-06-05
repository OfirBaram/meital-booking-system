import { siteConfig } from '@/config/site-config'
import { WhatsAppIcon, ChevronDownIcon } from '@/components/icons/SocialIcons'

export function Hero() {
  const { identity, social } = siteConfig
  const waHref = social.whatsapp ?? '#'

  return (
    <section
      className="relative flex min-h-svh items-center justify-center pt-[4.5rem]"
      aria-labelledby="hero-heading"
    >
      {/* Champagne tint */}
      <div
        className="absolute inset-0 bg-champagne/25"
        aria-hidden="true"
      />

      <div className="relative z-10 mx-auto max-w-3xl px-6 text-center">
        {/* Eyebrow */}
        <p className="mb-5 text-xs font-medium uppercase tracking-[0.3em] text-muted">
          {identity.tagline} | {identity.city}
        </p>

        {/* Heading — h1 for SEO */}
        <h1
          id="hero-heading"
          className="mb-6 text-[clamp(2.5rem,7vw,5rem)] font-light leading-tight text-charcoal"
        >
          אמנות ציפורניים<br />
          <em className="font-light not-italic" style={{ fontStyle: 'italic' }}>
            מרגע ראשון
          </em>
        </h1>

        {/* Sub */}
        <p className="mx-auto mb-10 max-w-md text-base leading-[1.9] text-muted md:text-lg">
          לק ג&apos;ל ועיצוב ציפורניים מקצועי ויוקרתי, עם תשומת לב לכל פרט.
          חוויה אישית ואינטימית בסטודיו הבוטיק של {identity.name}.
        </p>

        {/* CTAs */}
        <div className="flex flex-wrap items-center justify-center gap-4">
          <a
            href={waHref}
            target={waHref === '#' ? undefined : '_blank'}
            rel="noopener noreferrer"
            aria-label="פנייה לתיאום תור דרך וואטסאפ"
            className="inline-flex items-center gap-2.5 border-2 border-charcoal bg-charcoal px-9 py-3.5 text-xs font-medium uppercase tracking-[0.12em] text-white transition-colors duration-200 hover:bg-transparent hover:text-charcoal"
          >
            <WhatsAppIcon className="size-4 shrink-0" aria-hidden="true" />
            לתיאום תור
          </a>

          <a
            href="#gallery"
            aria-label="צפייה בגלריית העבודות"
            className="inline-flex items-center gap-2.5 border-2 border-charcoal bg-transparent px-9 py-3.5 text-xs font-medium uppercase tracking-[0.12em] text-charcoal transition-colors duration-200 hover:bg-charcoal hover:text-white"
          >
            הגלריה שלנו
          </a>
        </div>
      </div>

      {/* Scroll hint */}
      <div
        className="absolute bottom-10 left-1/2 flex -translate-x-1/2 flex-col items-center gap-1.5 text-muted"
        aria-hidden="true"
      >
        <span className="text-[0.65rem] uppercase tracking-[0.2em]">גלול</span>
        <ChevronDownIcon className="size-5 animate-bounce" />
      </div>
    </section>
  )
}
