const faqs = [
  {
    q: "כמה זמן מחזיק לק ג'ל?",
    a: "לק ג'ל איכותי מחזיק בין 3 ל-4 שבועות ללא שבירה, עם ברק מושלם לאורך כל התקופה. אנחנו עובדות עם מותגים מובילים כמו Gelish, OPI ו-CND לתוצאות הארוכות ביותר.",
  },
  {
    q: "האם ההסרה פוגעת בציפורן?",
    a: "הסרה מקצועית נכונה לא פוגעת בציפורן. בסטודיו מיטל מבצעים הסרה עדינה תוך 30 דקות בלבד — ללא שיוף מוגזם וללא נזק לציפורן הטבעית.",
  },
  {
    q: "כמה עולה לק ג'ל ברמת גן?",
    a: "מחיר לק ג'ל קלאסי מתחיל מ-₪160, ג'ל לרגליים מ-₪200, והסרת ג'ל מ-₪80. ניתן לתאם ולברר מחיר מדויק לפי הטיפול בווטסאפ.",
  },
  {
    q: "האם צריך לקבוע תור מראש?",
    a: "כן, הסטודיו עובד בתיאום מראש בלבד כדי להבטיח לכל לקוחה את מלוא תשומת הלב. ניתן לקבוע תור בווטסאפ — בדרך כלל ניתן לקבל מקום תוך 2–3 ימים.",
  },
  {
    q: "איפה הסטודיו ממוקם?",
    a: "הסטודיו ממוקם ברמת גן, נגיש בנסיעה מתל אביב, גבעתיים ופתח תקווה. לפרטי הגעה מדויקים ניתן לנווט דרך Waze.",
  },
]

export function FAQ() {
  return (
    <section id="faq" className="bg-card py-28 px-6" aria-labelledby="faq-heading">
      <div className="mx-auto max-w-3xl">

        <div className="mb-14 text-center" data-reveal>
          <p className="mb-3 text-[0.6875rem] font-medium uppercase tracking-[0.3em] text-muted" aria-hidden="true">
            שאלות נפוצות
          </p>
          <h2 id="faq-heading" className="text-[clamp(2rem,4.5vw,3.25rem)] font-light text-charcoal">
            מה שרצית לדעת
          </h2>
        </div>

        <div className="space-y-3" role="list">
          {faqs.map((item, i) => (
            <details
              key={i}
              className="group rounded-2xl border border-border bg-bg transition-colors duration-200 open:border-primary/30 open:bg-white"
              role="listitem"
              data-reveal
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-6 py-5 text-sm font-semibold text-charcoal hover:text-primary [&::-webkit-details-marker]:hidden">
                {item.q}
                {/* Chevron icon rotates when open */}
                <span
                  className="shrink-0 text-primary transition-transform duration-300 group-open:rotate-180"
                  aria-hidden="true"
                >
                  <svg viewBox="0 0 20 20" fill="currentColor" className="size-5">
                    <path fillRule="evenodd" d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
                  </svg>
                </span>
              </summary>
              <p className="px-6 pb-5 text-sm leading-[1.9] text-muted">
                {item.a}
              </p>
            </details>
          ))}
        </div>

      </div>
    </section>
  )
}
