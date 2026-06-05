import Link from "next/link"

export function Hero() {
  return (
    <section className="relative min-h-screen flex items-center justify-center pt-20">
      <div className="absolute inset-0 bg-champagne/30" />
      
      <div className="relative z-10 max-w-4xl mx-auto px-6 text-center">
        <p className="text-xs tracking-[0.3em] uppercase text-muted-foreground mb-6">
          Boutique Nail Artistry
        </p>
        
        <h1 className="font-serif text-5xl md:text-7xl lg:text-8xl font-light text-charcoal leading-tight mb-8 text-balance">
          Where Elegance
          <br />
          <span className="italic">Meets Artistry</span>
        </h1>
        
        <p className="max-w-xl mx-auto text-lg md:text-xl text-muted-foreground leading-relaxed mb-12">
          Experience bespoke nail artistry crafted with precision, 
          passion, and an unwavering commitment to luxury.
        </p>
        
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link
            href="#contact"
            className="inline-flex px-10 py-4 bg-charcoal text-primary-foreground text-xs tracking-[0.2em] uppercase hover:bg-charcoal/90 transition-colors duration-300"
          >
            Schedule Your Experience
          </Link>
          <Link
            href="#gallery"
            className="inline-flex px-10 py-4 border border-charcoal text-charcoal text-xs tracking-[0.2em] uppercase hover:bg-charcoal hover:text-primary-foreground transition-colors duration-300"
          >
            View Portfolio
          </Link>
        </div>
      </div>

      <div className="absolute bottom-12 left-1/2 -translate-x-1/2">
        <div className="flex flex-col items-center gap-2 text-muted-foreground">
          <span className="text-xs tracking-widest uppercase">Scroll</span>
          <svg className="w-4 h-8 animate-bounce" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
          </svg>
        </div>
      </div>
    </section>
  )
}
