const STARS = (
  <span className="flex gap-0.5 text-primary" aria-label="5 כוכבים">
    {Array.from({ length: 5 }).map((_, i) => (
      <svg key={i} viewBox="0 0 20 20" fill="currentColor" className="size-3.5" aria-hidden="true">
        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
      </svg>
    ))}
  </span>
)

const reviews = [
  {
    name: 'שירה כהן',
    service: 'ג\'ל קלאסי',
    date: 'מאי 2025',
    text: 'מיטל פשוט קסומה! הציפורניים שלי נראות מושלמות כבר שלושה שבועות. האווירה בסטודיו כל כך נעימה ואינטימית — מרגישה כמו ספא פרטי. אני ממליצה לכל אחת!',
  },
  {
    name: 'נועה לוי',
    service: 'עיצוב אמנותי',
    date: 'אפריל 2025',
    text: 'ביקשתי עיצוב לאירוע וקיבלתי הרבה מעבר לציפיות. מיטל הקשיבה בדיוק למה שרציתי ויצרה משהו ייחודי שקיבל מחמאות כל הערב. בהחלט אחזור!',
  },
  {
    name: 'מיכל אברהם',
    service: 'ג\'ל לרגליים',
    date: 'יוני 2025',
    text: 'טיפול מדהים מתחילה ועד סוף. מיטל מקצועית, סבלנית ועם עין מדויקת לפרטים. הרגליים שלי נראות נפלא ועמידות גם אחרי שבועיים. תודה רבה!',
  },
]

export function Testimonials() {
  return (
    <section className="bg-bg py-28 px-6" aria-labelledby="reviews-heading">
      <div className="mx-auto max-w-7xl">

        {/* Heading */}
        <div className="mb-14 text-center" data-reveal>
          <p className="mb-3 text-[0.6875rem] font-medium uppercase tracking-[0.3em] text-muted" aria-hidden="true">
            ביקורות
          </p>
          <h2 id="reviews-heading" className="text-[clamp(2rem,4.5vw,3.25rem)] font-light text-charcoal">
            לקוחות מספרות
          </h2>
        </div>

        {/* Cards */}
        <div className="grid gap-6 md:grid-cols-3">
          {reviews.map((r) => (
            <blockquote
              key={r.name}
              className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-8 shadow-sm transition-shadow duration-300 hover:shadow-md"
              data-reveal
            >
              {STARS}
              <p className="flex-1 text-sm leading-[1.9] text-muted">&ldquo;{r.text}&rdquo;</p>
              <footer className="border-t border-border pt-4">
                <p className="text-sm font-semibold text-charcoal">{r.name}</p>
                <p className="text-xs text-muted">{r.service} · {r.date}</p>
              </footer>
            </blockquote>
          ))}
        </div>

        {/* Trust bar */}
        <div className="mt-16 flex flex-wrap items-center justify-center gap-8 border-t border-border pt-12" data-reveal="fade">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted">עובדות עם</p>
          {['OPI', 'Gelish', 'CND Shellac', 'IBD'].map((brand) => (
            <span key={brand} className="text-sm font-semibold tracking-widest text-charcoal/40">
              {brand}
            </span>
          ))}
        </div>

      </div>
    </section>
  )
}
