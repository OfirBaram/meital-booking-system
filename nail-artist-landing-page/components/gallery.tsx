import Image from "next/image"

const galleryImages = [
  { src: "/gallery/nail-1.png", alt: "Elegant french tip nail design", span: "col-span-1 row-span-2" },
  { src: "/gallery/nail-2.png", alt: "Minimalist nude nail art", span: "col-span-1" },
  { src: "/gallery/nail-3.png", alt: "Luxury gold accent nails", span: "col-span-1" },
  { src: "/gallery/nail-4.png", alt: "Sophisticated marble nail design", span: "col-span-1 row-span-2" },
  { src: "/gallery/nail-5.png", alt: "Classic red manicure", span: "col-span-1" },
  { src: "/gallery/nail-6.png", alt: "Artistic floral nail design", span: "col-span-1" },
]

export function Gallery() {
  return (
    <section id="gallery" className="py-32 bg-background">
      <div className="max-w-7xl mx-auto px-6 lg:px-8">
        <div className="text-center mb-16">
          <p className="text-xs tracking-[0.3em] uppercase text-muted-foreground mb-4">
            Portfolio
          </p>
          <h2 className="font-serif text-4xl md:text-5xl lg:text-6xl font-light text-charcoal text-balance">
            A Gallery of Artistry
          </h2>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 md:gap-6">
          {galleryImages.map((image, index) => (
            <div
              key={index}
              className={`relative overflow-hidden group ${image.span} aspect-[3/4] first:aspect-auto`}
            >
              <Image
                src={image.src}
                alt={image.alt}
                fill
                className="object-cover transition-transform duration-700 group-hover:scale-105"
                sizes="(max-width: 768px) 50vw, 33vw"
              />
              <div className="absolute inset-0 bg-charcoal/0 group-hover:bg-charcoal/20 transition-colors duration-500" />
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
