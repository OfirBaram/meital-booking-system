import { siteConfig } from '@/config/site-config'
import type { Service } from '@/config/site-config'

function ServiceCard({ service }: { service: Service }) {
  return (
    <article
      className="group border border-border bg-bg p-8 transition-all duration-300 hover:border-champagne hover:shadow-[0_8px_32px_-12px_rgba(166,124,142,0.18)]"
      aria-labelledby={`service-${service.id}`}
    >
      <span
        className="mb-3 block text-3xl font-light text-champagne"
        aria-hidden="true"
      >
        {service.num}
      </span>
      <h3
        id={`service-${service.id}`}
        className="mb-1.5 text-lg font-semibold text-charcoal"
      >
        {service.title}
      </h3>
      <p className="mb-4 text-sm text-muted">{service.duration}</p>
      <p className="text-sm leading-[1.8] text-muted">{service.description}</p>
    </article>
  )
}

export function Services() {
  return (
    <section
      id="services"
      className="bg-bg py-28 px-6"
      aria-labelledby="services-heading"
    >
      <div className="mx-auto max-w-7xl">
        <p
          className="mb-3 text-[0.6875rem] font-medium uppercase tracking-[0.3em] text-muted"
          aria-hidden="true"
        >
          שירותים
        </p>
        <h2
          id="services-heading"
          className="mb-3 text-[clamp(2rem,4.5vw,3.25rem)] font-light text-charcoal"
        >
          מה אנחנו מציעות
        </h2>
        <p className="mb-12 max-w-xl leading-[1.85] text-muted">
          מגוון שירותי עיצוב ציפורניים ברמה הגבוהה ביותר, המותאמים אישית
          לכל לקוחה — בין אם את מחפשת ג&apos;ל קלאסי נקי ועמיד ובין אם
          עיצוב אמנותי ייחודי.
        </p>

        <div
          className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4"
          role="list"
          aria-label="רשימת שירותים"
        >
          {siteConfig.services.map((s) => (
            <ServiceCard key={s.id} service={s} />
          ))}
        </div>
      </div>
    </section>
  )
}
