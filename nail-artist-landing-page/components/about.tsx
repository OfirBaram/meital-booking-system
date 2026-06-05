const services = [
  {
    title: "Signature Manicure",
    description: "A luxurious experience featuring premium products, meticulous nail shaping, and flawless polish application.",
  },
  {
    title: "Bespoke Nail Art",
    description: "Custom-designed nail artistry tailored to your vision, from subtle elegance to bold statement pieces.",
  },
  {
    title: "Gel Extensions",
    description: "Expertly crafted extensions using the finest materials for natural-looking, long-lasting results.",
  },
  {
    title: "Spa Treatments",
    description: "Indulgent hand and nail therapies featuring nourishing treatments for complete rejuvenation.",
  },
]

export function About() {
  return (
    <section id="about" className="py-32 bg-card">
      <div className="max-w-7xl mx-auto px-6 lg:px-8">
        <div className="grid lg:grid-cols-2 gap-16 lg:gap-24 items-start">
          <div>
            <p className="text-xs tracking-[0.3em] uppercase text-muted-foreground mb-4">
              About the Boutique
            </p>
            <h2 className="font-serif text-4xl md:text-5xl lg:text-6xl font-light text-charcoal leading-tight mb-8 text-balance">
              Crafted with Precision & Passion
            </h2>
            <div className="space-y-6 text-muted-foreground leading-relaxed">
              <p>
                At Lumière, we believe that nails are more than just an accessory—they are 
                an extension of your personal style and a canvas for artistic expression.
              </p>
              <p>
                Our boutique studio offers an intimate, refined atmosphere where every detail 
                is carefully curated. From the moment you step through our doors, you&apos;ll be 
                enveloped in an environment designed for relaxation and luxury.
              </p>
              <p>
                Each service is performed with meticulous attention to detail, using only 
                premium products sourced from the finest suppliers worldwide.
              </p>
            </div>
          </div>

          <div id="services" className="space-y-8">
            <p className="text-xs tracking-[0.3em] uppercase text-muted-foreground">
              Our Services
            </p>
            <div className="space-y-6">
              {services.map((service, index) => (
                <div 
                  key={service.title}
                  className="group p-8 bg-background border border-border hover:border-champagne transition-colors duration-300"
                >
                  <div className="flex items-start gap-6">
                    <span className="font-serif text-3xl text-champagne/80">
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    <div>
                      <h3 className="font-serif text-xl text-charcoal mb-2">
                        {service.title}
                      </h3>
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        {service.description}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
