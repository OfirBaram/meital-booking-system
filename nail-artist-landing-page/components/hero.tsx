import Image from 'next/image'
import { siteConfig } from '@/config/site-config'
import { WhatsAppIcon, ChevronDownIcon } from '@/components/icons/SocialIcons'

export function Hero() {
  const { identity, social } = siteConfig
  const waHref = social.whatsapp ?? '#contact'

  return (
    <section
      className="relative min-h-svh overflow-hidden pt-[4.5rem]"
      aria-labelledby="hero-heading"
    >
      {/* Gradient background */}
      <div
        className="absolute inset-0"
        style={{
          background: 'linear-gradient(135deg, #FAF5F0 0%, #f0e4d7 40%, #e8d4c0 70%, #DDC3A5 100%)',
        }}
        aria-hidden="true"
      />
      {/* Decorative dot grid */}
      <div
        className="absolute inset-0 opacity-[0.04]"
        style={{ backgroundImage: 'radial-gradient(#2d2b3d 1px, transparent 1px)', backgroundSize: '28px 28px' }}
        aria-hidden="true"
      />

      <div className="relative z-10 mx-auto flex min-h-[calc(100svh-4.5rem)] max-w-7xl flex-col items-center justify-center gap-12 px-6 py-16 lg:flex-row lg:gap-20 lg:px-8">

        {/* Text column */}
        <div className="flex-1 text-center lg:text-start">
          <p className="mb-5 text-xs font-medium uppercase tracking-[0.3em] text-muted" data-reveal="fade">
            {identity.tagline} · {identity.city}
          </p>

          <h1
            id="hero-heading"
            className="mb-6 text-[clamp(2.75rem,7vw,5.25rem)] font-light leading-[1.1] tracking-tight text-charcoal"
            data-reveal
          >
            אמנות ציפורניים<br />
            <span className="font-light italic text-primary">
              מרגע ראשון
            </span>
          </h1>

          <p className="mx-auto mb-10 max-w-md text-base leading-[1.9] text-muted lg:mx-0" data-reveal>
            לק ג&apos;ל ועיצוב ציפורניים מקצועי ויוקרתי — חוויה אישית ואינטימית
            בסטודיו הבוטיק של {identity.name}.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-4 lg:justify-start" data-reveal>
            <a
              href={waHref}
              target={waHref.startsWith('http') ? '_blank' : undefined}
              rel="noopener noreferrer"
              aria-label="פנייה לתיאום תור דרך וואטסאפ"
              className="inline-flex items-center gap-2.5 rounded-full border-2 border-charcoal bg-charcoal px-8 py-3.5 text-xs font-semibold uppercase tracking-[0.12em] text-white shadow-lg transition-all duration-200 hover:scale-105 hover:shadow-xl"
            >
              <WhatsAppIcon className="size-4 shrink-0" aria-hidden="true" />
              לתיאום תור
            </a>
            <a
              href="#gallery"
              aria-label="צפייה בגלריית העבודות"
              className="inline-flex items-center gap-2.5 rounded-full border-2 border-charcoal/30 bg-white/60 px-8 py-3.5 text-xs font-semibold uppercase tracking-[0.12em] text-charcoal backdrop-blur-sm transition-all duration-200 hover:border-charcoal hover:bg-white"
            >
              הגלריה שלנו
            </a>
          </div>

          {/* Trust badges */}
          <div className="mt-10 flex flex-wrap items-center justify-center gap-6 lg:justify-start" data-reveal="fade">
            {['100% חומרים מקצועיים', 'ניסיון +8 שנים', 'לקוחות מרוצות ✓'].map((badge) => (
              <span key={badge} className="flex items-center gap-1.5 text-xs text-muted">
                <span className="size-1.5 rounded-full bg-primary" aria-hidden="true" />
                {badge}
              </span>
            ))}
          </div>
        </div>

        {/* Image column */}
        <div className="relative w-full max-w-sm shrink-0 lg:max-w-md" data-reveal="fade">
          {/* Decorative rings */}
          <div className="absolute -inset-4 rounded-full border border-champagne/40" aria-hidden="true" />
          <div className="absolute -inset-8 rounded-full border border-champagne/20" aria-hidden="true" />

          <div className="relative aspect-[4/5] overflow-hidden rounded-3xl shadow-2xl">
            <Image
              src="/gallery/nail-1.png"
              alt="עיצוב ציפורניים — לק ג'ל מקצועי"
              fill
              className="object-cover"
              sizes="(max-width: 1024px) 90vw, 480px"
              priority
            />
            {/* Subtle overlay gradient */}
            <div
              className="absolute inset-0"
              style={{ background: 'linear-gradient(to top, rgba(45,43,61,0.15) 0%, transparent 60%)' }}
              aria-hidden="true"
            />
          </div>

          {/* Floating badge */}
          <div className="absolute -bottom-4 -end-4 rounded-2xl bg-white px-5 py-3 shadow-xl">
            <p className="text-[0.65rem] font-medium uppercase tracking-[0.15em] text-muted">בוטיק פרימיום</p>
            <p className="text-sm font-semibold text-charcoal">רמת גן</p>
          </div>
        </div>

      </div>

      {/* Scroll hint */}
      <div
        className="absolute bottom-8 left-1/2 flex -translate-x-1/2 flex-col items-center gap-1.5 text-muted"
        aria-hidden="true"
      >
        <span className="text-[0.6rem] uppercase tracking-[0.25em]">גלול</span>
        <ChevronDownIcon className="size-5 animate-bounce" />
      </div>
    </section>
  )
}
