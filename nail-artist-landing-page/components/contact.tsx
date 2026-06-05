import { siteConfig } from '@/config/site-config'
import { SocialLinks } from '@/components/SocialLink'
import { WhatsAppIcon } from '@/components/icons/SocialIcons'

function MapPinIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="size-5 shrink-0" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
    </svg>
  )
}
function ClockIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="size-5 shrink-0" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  )
}
function PhoneIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="size-5 shrink-0" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" />
    </svg>
  )
}

export function Contact() {
  const { identity, social, business } = siteConfig
  const waHref = social.whatsapp ?? '#contact'

  return (
    <section id="contact" className="bg-charcoal py-28 px-6 text-center" aria-labelledby="contact-heading">
      <div className="mx-auto max-w-3xl">
        <p className="mb-4 text-[0.6875rem] font-medium uppercase tracking-[0.3em] text-champagne" aria-hidden="true" data-reveal="fade">
          יצירת קשר
        </p>
        <h2 id="contact-heading" className="mb-5 text-[clamp(2rem,4.5vw,3.25rem)] font-light leading-snug text-bg" data-reveal>
          בואי ניצור משהו יפה יחד
        </h2>
        <p className="mx-auto mb-10 max-w-md text-base leading-[1.9] text-bg/70" data-reveal>
          לתיאום תור, שאלות או ייעוץ מקצועי — כתבי לנו בווטסאפ ונשמח לעזור.
        </p>

        <a
          href={waHref}
          target={waHref.startsWith('http') ? '_blank' : undefined}
          rel="noopener noreferrer"
          aria-label="שליחת הודעה בווטסאפ לתיאום תור"
          className="inline-flex items-center gap-3 rounded-full border-2 border-champagne bg-champagne px-10 py-4 text-sm font-semibold uppercase tracking-[0.12em] text-charcoal transition-all duration-200 hover:scale-105 hover:shadow-lg"
          data-reveal
        >
          <WhatsAppIcon className="size-5 shrink-0" aria-hidden="true" />
          שלחי הודעה בווטסאפ
        </a>

        <div className="mt-16 grid gap-4 sm:grid-cols-3" data-reveal>

          <div className="rounded-2xl bg-bg/5 p-6 text-start transition-colors hover:bg-bg/10">
            <div className="mb-3 flex items-center gap-2 text-champagne">
              <MapPinIcon />
              <span className="text-xs font-semibold uppercase tracking-[0.15em]">כתובת</span>
            </div>
            <p className="mb-3 text-sm text-bg/70">{identity.address}, רמת גן</p>
            {social.waze && (
              <a href={social.waze} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-champagne underline-offset-4 hover:underline">
                נווטי בוויז ←
              </a>
            )}
          </div>

          <div className="rounded-2xl bg-bg/5 p-6 text-start">
            <div className="mb-3 flex items-center gap-2 text-champagne">
              <ClockIcon />
              <span className="text-xs font-semibold uppercase tracking-[0.15em]">שעות</span>
            </div>
            <p className="text-sm text-bg/70">{business.hours}</p>
          </div>

          <div className="rounded-2xl bg-bg/5 p-6 text-start">
            <div className="mb-3 flex items-center gap-2 text-champagne">
              <PhoneIcon />
              <span className="text-xs font-semibold uppercase tracking-[0.15em]">צרי קשר</span>
            </div>
            {identity.phone && (
              <a href={`tel:${identity.phone}`} className="mb-3 block text-sm text-bg/70 hover:text-champagne">
                {identity.phone}
              </a>
            )}
            <div className="flex gap-1">
              <SocialLinks
                social={social}
                linkClassName="inline-flex size-9 items-center justify-center rounded-full text-bg/50 transition-colors duration-200 hover:text-champagne hover:bg-champagne/10"
              />
            </div>
          </div>

        </div>
      </div>
    </section>
  )
}
