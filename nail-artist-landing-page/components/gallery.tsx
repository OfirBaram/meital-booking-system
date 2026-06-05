import Image from 'next/image'
import { siteConfig } from '@/config/site-config'
import type { GalleryImage } from '@/config/site-config'

function GalleryTile({ image }: { image: GalleryImage }) {
  return (
    <figure
      className={[
        'group relative m-0 overflow-hidden rounded-xl',
        image.span2 ? '[grid-row:span_2]' : '',
      ].join(' ')}
      role="listitem"
      data-reveal="fade"
    >
      <Image
        src={image.src}
        alt={image.alt}
        fill
        className="object-cover transition-transform duration-700 group-hover:scale-105"
        sizes="(max-width: 767px) 50vw, 33vw"
        loading="lazy"
      />
      <figcaption className="absolute inset-0 flex items-end rounded-xl bg-charcoal/0 p-4 transition-colors duration-500 group-hover:bg-charcoal/30">
        <span className="translate-y-2 text-xs font-medium tracking-wide text-white opacity-0 drop-shadow transition-all duration-300 group-hover:translate-y-0 group-hover:opacity-100">
          {image.alt}
        </span>
      </figcaption>
    </figure>
  )
}

export function Gallery() {
  return (
    <section id="gallery" className="bg-card py-28 px-6" aria-labelledby="gallery-heading">
      <div className="mx-auto max-w-7xl">
        <div data-reveal>
          <p className="mb-3 text-[0.6875rem] font-medium uppercase tracking-[0.3em] text-muted" aria-hidden="true">
            גלריה
          </p>
          <h2 id="gallery-heading" className="mb-3 text-[clamp(2rem,4.5vw,3.25rem)] font-light text-charcoal">
            עבודות נבחרות
          </h2>
          <p className="mb-12 max-w-lg text-sm leading-[1.9] text-muted">
            כל עיצוב הוא עולם בפני עצמו — מפרנץ&apos; קלאסי ועד אמנות ייחודית.
          </p>
        </div>

        <div
          className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-5"
          style={{ gridAutoRows: 'clamp(180px, 25vw, 320px)' }}
          role="list"
          aria-label="גלריית ציפורניים"
        >
          {siteConfig.gallery.map((img) => (
            <GalleryTile key={img.src} image={img} />
          ))}
        </div>
      </div>
    </section>
  )
}
