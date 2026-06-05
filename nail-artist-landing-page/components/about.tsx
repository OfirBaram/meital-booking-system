import Image from 'next/image'

export function About() {
  return (
    <section
      id="about"
      className="bg-[var(--color-card)] py-28 px-6"
      aria-labelledby="about-heading"
    >
      <div className="mx-auto grid max-w-7xl items-center gap-16 lg:grid-cols-2 lg:gap-24">

        {/* Text column */}
        <div>
          <p
            className="mb-3 text-[0.6875rem] font-medium uppercase tracking-[0.3em] text-[var(--color-muted)]"
            aria-hidden="true"
          >
            אודות הסטודיו
          </p>
          <h2
            id="about-heading"
            className="mb-8 text-[clamp(2rem,4.5vw,3.25rem)] font-light leading-snug text-[var(--color-charcoal)]"
          >
            מקצועיות, דיוק<br />ואהבה לפרטים
          </h2>
          <div className="space-y-5 text-[var(--color-muted)] leading-[1.9]">
            <p>
              מיטל שבע ברעם היא אמנית ציפורניים בוטיק עם ניסיון עשיר בעיצוב לק ג&apos;ל
              ופדיקור מקצועי. הסטודיו הממוקם ברמת גן מציע אווירה אינטימית ומטפחת,
              שבה כל לקוחה מקבלת טיפול אישי ומלא תשומת לב.
            </p>
            <p>
              אנחנו עובדות אך ורק עם חומרים מהמותגים המובילים בעולם, ומקפידות
              על תהליכי עבודה שמשמרים את בריאות הציפורן הטבעית לצד מראה
              מושלם ועמיד לאורך זמן.
            </p>
            <p>
              כי ציפורניים יפות הן לא עניין של מזל — הן תוצאה של מיומנות,
              חומרים נכונים ואהבה אמיתית למה שעושים.
            </p>
          </div>
        </div>

        {/* Image column */}
        <div className="relative aspect-[4/5] overflow-hidden">
          <Image
            src="/gallery/nail-1.png"
            alt="מיטל עובדת על עיצוב ציפורניים — לק ג'ל פרנץ' קלאסי"
            fill
            className="object-cover"
            sizes="(max-width: 1024px) 100vw, 50vw"
            priority
          />
          {/* Decorative accent border */}
          <span
            className="pointer-events-none absolute -bottom-5 -start-5 z-[-1] h-3/5 w-3/5 border-2 border-[var(--color-champagne)]"
            aria-hidden="true"
          />
        </div>

      </div>
    </section>
  )
}
