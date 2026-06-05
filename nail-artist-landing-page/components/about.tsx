import Image from 'next/image'
import { siteConfig } from '@/config/site-config'

export function About() {
  const { social } = siteConfig
  return (
    <section id="about" className="bg-card py-28 px-6" aria-labelledby="about-heading">
      <div className="mx-auto grid max-w-7xl items-center gap-16 lg:grid-cols-2 lg:gap-24">

        {/* Text column */}
        <div data-reveal>
          <p className="mb-3 text-[0.6875rem] font-medium uppercase tracking-[0.3em] text-muted" aria-hidden="true">
            אודות הסטודיו
          </p>
          <h2 id="about-heading" className="mb-8 text-[clamp(2rem,4.5vw,3.25rem)] font-light leading-snug text-charcoal">
            מקצועיות, דיוק<br />ואהבה לפרטים
          </h2>
          <div className="space-y-5 text-muted leading-[1.9]">
            <p>
              מיטל שבע ברעם היא אמנית ציפורניים בוטיק עם ניסיון עשיר בעיצוב לק ג&apos;ל
              ופדיקור מקצועי. הסטודיו הממוקם ברמת גן מציע אווירה אינטימית ומטפחת,
              שבה כל לקוחה מקבלת טיפול אישי ומלא תשומת לב.
            </p>
            <p>
              עובדות אך ורק עם חומרים מהמותגים המובילים בעולם — OPI, Gelish, CND —
              ומקפידות על תהליכי עבודה שמשמרים את בריאות הציפורן הטבעית לצד מראה
              מושלם ועמיד לאורך זמן.
            </p>
            <p>
              כי ציפורניים יפות הן לא עניין של מזל — הן תוצאה של מיומנות,
              חומרים נכונים ואהבה אמיתית למה שעושים.
            </p>
          </div>

          {/* Stats row */}
          <div className="mt-10 grid grid-cols-3 gap-4 border-t border-border pt-8">
            {[
              { num: '8+', label: 'שנות ניסיון' },
              { num: '500+', label: 'לקוחות שמחות' },
              { num: '100%', label: 'חומרים מקצועיים' },
            ].map(({ num, label }) => (
              <div key={label} className="text-center">
                <p className="text-2xl font-semibold text-primary">{num}</p>
                <p className="mt-0.5 text-xs text-muted">{label}</p>
              </div>
            ))}
          </div>

          <a
            href={siteConfig.social.whatsapp ?? '#contact'}
            target={siteConfig.social.whatsapp ? '_blank' : undefined}
            rel="noopener noreferrer"
            aria-label="קביעת תור עכשיו דרך וואטסאפ"
            className="mt-8 inline-flex items-center gap-2 text-sm font-medium text-primary underline-offset-4 hover:underline"
          >
            קבעי תור עכשיו ←
          </a>
        </div>

        {/* Image column */}
        <div className="relative aspect-[4/5] overflow-hidden" data-reveal="fade">
          <Image
            src="/gallery/nail-1.png"
            alt="מיטל עובדת על עיצוב ציפורניים — לק ג'ל פרנץ' קלאסי"
            fill
            className="object-cover"
            sizes="(max-width: 1024px) 100vw, 50vw"
            priority
          />
          <span
            className="pointer-events-none absolute -bottom-5 -start-5 z-[-1] h-3/5 w-3/5 border-2 border-champagne"
            aria-hidden="true"
          />
        </div>

      </div>
    </section>
  )
}
