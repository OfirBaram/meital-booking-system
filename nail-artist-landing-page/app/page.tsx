import { Header }           from '@/components/header'
import { Hero }             from '@/components/hero'
import { About }            from '@/components/about'
import { Services }         from '@/components/Services'
import { Gallery }          from '@/components/gallery'
import { Testimonials }     from '@/components/Testimonials'
import { Contact }          from '@/components/contact'
import { Footer }           from '@/components/footer'
import { FloatingWhatsApp } from '@/components/FloatingWhatsApp'
import { RevealObserver }   from '@/components/RevealObserver'

export default function Page() {
  return (
    <>
      <Header />
      <main id="main-content" tabIndex={-1} className="outline-none">
        <Hero />
        <About />
        <Services />
        <Gallery />
        <Testimonials />
        <Contact />
      </main>
      <Footer />
      <FloatingWhatsApp />
      <RevealObserver />
    </>
  )
}
