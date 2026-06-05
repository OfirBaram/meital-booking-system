import Image from 'next/image'
import { siteConfig } from '@/config/site-config'
import type { GalleryImage } from '@/config/site-config'

function GalleryTile({ image }: { image: GalleryImage }) {
  return (
    <figure
      className={[
        'group relative m-0 overflow-hidden',
        image.span2 ? '[grid-row:span_2]' : '',
      ].join(' ')}
      role="listitem"
    >
      <Image
        src={image.src}
        alt={image.alt}
        fill
        className="object-cover transition-transform duration-700 group-hover:scale-105"
        sizes="(max-width: 767px) 50vw, 33vw"
        loading="lazy"
      />
      {/* Hover overlay */}
      <figcaption className="absolute inset-0 flex items-end bg-charcoal/0 p-3 transition-colors duration-500 group-hover:bg-charcoal/20">
        <span className="text-xs font-medium tracking-wide text-white opacity-0 drop-shadow transition-opacity duration-300 group-hover:opacity-100">
          {image.alt}
        </span>
      </figcaption>
    </figure>
  )
}

export function Gallery() {
  return (
    <section
      id="gallery"
      className="bg-card py-28 px-6"
      aria-labelledby="gallery-heading"
    >
      <div className="mx-auto max-w-7xl">
        <p
          className="mb-3 text-[0.6875rem] font-medium uppercase tracking-[0.3em] text-muted"
          aria-hidden="true"
        >
          גלריה
        </p>
        <h2
          id="gallery-heading"
          className="mb-12 text-[clamp(2rem,4.5vw,3.25rem)] font-light text-charcoal"
        >
          עבודות נבחרות
        </h2>

        <div
          className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-5"
          style={{ gridAutoRows: '280px' }}
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
