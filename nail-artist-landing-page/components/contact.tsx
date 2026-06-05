import { siteConfig } from '@/config/site-config'
import { SocialLinks } from '@/components/SocialLink'
import { WhatsAppIcon } from '@/components/icons/SocialIcons'

export function Contact() {
  const { identity, social, business } = siteConfig
  const waHref = social.whatsapp ?? '#'

  return (
    <section
      id="contact"
      className="bg-[var(--color-charcoal)] py-28 px-6 text-center"
      aria-labelledby="contact-heading"
      style={{ color: '#FAF5F0' }}
    >
      <div className="mx-auto max-w-2xl">
        <p
          className="mb-4 text-[0.6875rem] font-medium uppercase tracking-[0.3em] text-[var(--color-champagne)]"
          aria-hidden="true"
        >
          יצירת קשר
        </p>
        <h2
          id="contact-heading"
          className="mb-5 text-[clamp(2rem,4.5vw,3.25rem)] font-light leading-snug"
          style={{ color: '#FAF5F0' }}
        >
          בואי ניצור משהו יפה יחד
        </h2>
        <p
          className="mx-auto mb-10 max-w-md text-base leading-[1.9]"
          style={{ color: 'rgba(250,245,240,0.70)' }}
        >
          לתיאום תור, שאלות או ייעוץ מקצועי — כתבי לנו בווטסאפ
          ונשמח לעזור.
        </p>

        {/* WhatsApp CTA */}
        <a
          href={waHref}
          target={waHref === '#' ? undefined : '_blank'}
          rel="noopener noreferrer"
          aria-label="שליחת הודעה בווטסאפ לתיאום תור"
          className="inline-flex items-center gap-3 border-2 border-[var(--color-champagne)] bg-[var(--color-champagne)] px-10 py-4 text-sm font-medium uppercase tracking-[0.12em] text-[var(--color-charcoal)] transition-opacity duration-200 hover:opacity-85"
        >
          <WhatsAppIcon className="size-5 shrink-0" aria-hidden="true" />
          שלחי הודעה בווטסאפ
        </a>

        {/* Info grid */}
        <div
          className="mt-20 grid gap-8 border-t pt-12 text-sm md:grid-cols-3"
          style={{ borderColor: 'rgba(250,245,240,0.10)' }}
        >
          <div>
            <span
              className="mb-2 block text-xs font-medium uppercase tracking-[0.2em] text-[var(--color-champagne)]"
            >
              כתובת
            </span>
            <p style={{ color: 'rgba(250,245,240,0.70)' }}>{identity.address}</p>
          </div>
          <div>
            <span
              className="mb-2 block text-xs font-medium uppercase tracking-[0.2em] text-[var(--color-champagne)]"
            >
              שעות פעילות
            </span>
            <p style={{ color: 'rgba(250,245,240,0.70)' }}>{business.hours}</p>
          </div>
          <div>
            <span
              className="mb-2 block text-xs font-medium uppercase tracking-[0.2em] text-[var(--color-champagne)]"
            >
              עקבי אחרינו
            </span>
            <div className="flex justify-center gap-1 pt-1">
              <SocialLinks
                social={social}
                linkClassName="inline-flex size-8 items-center justify-center rounded-full text-[rgba(250,245,240,0.50)] transition-colors duration-200 hover:text-[var(--color-champagne)] hover:bg-[var(--color-champagne)]/10"
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
