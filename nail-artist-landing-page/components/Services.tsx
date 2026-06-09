import { siteConfig } from '@/config/site-config'
import type { Service } from '@/config/site-config'

function ServiceCard({ service, waHref }: { service: Service; waHref: string }) {
  return (
    <article
      className="group relative border border-border bg-bg p-8 transition-all duration-300 hover:border-primary/40 hover:shadow-[0_12px_40px_-12px_rgba(166,124,142,0.25)]"
      aria-labelledby={`service-${service.id}`}
      data-reveal
    >
      <span className="mb-3 block text-3xl font-light text-champagne" aria-hidden="true">
        {service.num}
      </span>
      <h3 id={`service-${service.id}`} className="mb-1.5 text-lg font-semibold text-charcoal">
        {service.title}
      </h3>
      <div className="mb-4 flex items-center gap-3">
        <p className="text-sm font-medium text-primary">{service.duration}</p>
        {service.price && (
          <span className="rounded-full bg-champagne/30 px-2.5 py-0.5 text-xs font-semibold text-charcoal">
            {service.price}
          </span>
        )}
      </div>
      <p className="mb-6 text-sm leading-[1.8] text-muted">{service.description}</p>
      <a
        href={waHref}
        target={waHref.startsWith('http') ? '_blank' : undefined}
        rel="noopener noreferrer"
        aria-label={`לתיאום תור ל${service.title}`}
        className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.1em] text-charcoal opacity-0 transition-opacity duration-300 group-hover:opacity-100"
      >
        לתיאום תור ←
      </a>
    </article>
  )
}

export function Services() {
  const waHref = siteConfig.social.whatsapp ?? '#contact'
  return (
    <section id="services" className="bg-bg py-28 px-6" aria-labelledby="services-heading">
      <div className="mx-auto max-w-7xl">
        <div data-reveal>
          <p className="mb-3 text-[0.6875rem] font-medium uppercase tracking-[0.3em] text-muted" aria-hidden="true">
            שירותים
          </p>
          <h2 id="services-heading" className="mb-3 text-[clamp(2rem,4.5vw,3.25rem)] font-light text-charcoal">
            מה אנחנו מציעות
          </h2>
          <p className="mb-12 max-w-xl leading-[1.85] text-muted">
            מגוון שירותי עיצוב ציפורניים ברמה הגבוהה ביותר, המותאמים אישית לכל לקוחה.
          </p>
        </div>

        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4" role="list" aria-label="רשימת שירותים">
          {siteConfig.services.map((s) => (
            <ServiceCard key={s.id} service={s} waHref={waHref} />
          ))}
        </div>
      </div>
    </section>
  )
}
