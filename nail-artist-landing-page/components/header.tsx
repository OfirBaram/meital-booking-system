'use client'

import { useState, useEffect } from 'react'
import { siteConfig } from '@/config/site-config'
import { SocialLinks } from '@/components/SocialLink'
import { MenuIcon, XIcon, WhatsAppIcon } from '@/components/icons/SocialIcons'

export function Header() {
  const [open, setOpen]       = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const { navigation, social, identity } = siteConfig
  const waHref = social.whatsapp ?? '#contact'

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 60)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <header
      className={[
        'fixed inset-x-0 top-0 z-50 border-b transition-all duration-300',
        scrolled
          ? 'border-border bg-bg/95 shadow-sm backdrop-blur-md'
          : 'border-transparent bg-transparent backdrop-blur-none',
      ].join(' ')}
      role="banner"
    >
      <div className="mx-auto flex h-[4.5rem] max-w-7xl items-center justify-between px-6 lg:px-8">

        {/* Logo */}
        <a href="/" className="font-semibold tracking-wide text-charcoal no-underline" aria-label={identity.name + ' — דף הבית'}>
          {identity.name}
        </a>

        {/* Desktop nav */}
        <nav aria-label="ניווט ראשי" className="hidden md:block">
          <ul className="flex items-center gap-10 list-none p-0 m-0" role="list">
            {navigation.map((item) => (
              <li key={item.href}>
                <a
                  href={item.href}
                  className="text-xs font-medium uppercase tracking-[0.1em] text-muted no-underline transition-colors duration-200 hover:text-charcoal"
                >
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        {/* Desktop right: social + CTA */}
        <div className="hidden items-center gap-3 md:flex">
          <SocialLinks social={social} />
          <a
            href={waHref}
            target={waHref.startsWith('http') ? '_blank' : undefined}
            rel="noopener noreferrer"
            aria-label="קביעת תור בווטסאפ"
            className="inline-flex items-center gap-2 rounded-full bg-charcoal px-5 py-2 text-xs font-semibold uppercase tracking-[0.1em] text-white transition-all duration-200 hover:bg-primary hover:scale-105"
          >
            <WhatsAppIcon className="size-3.5" aria-hidden="true" />
            קבעי תור
          </a>
        </div>

        {/* Mobile menu button */}
        <button
          className="inline-flex items-center justify-center rounded p-1.5 text-charcoal md:hidden"
          aria-expanded={open}
          aria-controls="mobile-nav"
          aria-label={open ? 'סגור תפריט' : 'פתח תפריט'}
          onClick={() => setOpen(!open)}
        >
          {open ? <XIcon className="size-5" /> : <MenuIcon className="size-5" />}
        </button>
      </div>

      {/* Mobile nav */}
      {open && (
        <nav id="mobile-nav" aria-label="תפריט נייד">
          <div className="border-t border-border bg-bg/98 px-6 pb-6 pt-4 backdrop-blur-md">
            <ul className="mb-5 flex flex-col gap-1 list-none p-0 m-0" role="list">
              {navigation.map((item) => (
                <li key={item.href}>
                  <a
                    href={item.href}
                    className="block py-3 text-sm font-medium uppercase tracking-[0.08em] text-charcoal no-underline border-b border-border/50 last:border-0"
                    onClick={() => setOpen(false)}
                  >
                    {item.label}
                  </a>
                </li>
              ))}
            </ul>
            <a
              href={waHref}
              target={waHref.startsWith('http') ? '_blank' : undefined}
              rel="noopener noreferrer"
              aria-label="קביעת תור בווטסאפ"
              className="mb-4 flex items-center justify-center gap-2 rounded-full bg-charcoal py-3 text-sm font-semibold text-white"
              onClick={() => setOpen(false)}
            >
              <WhatsAppIcon className="size-4" aria-hidden="true" />
              קבעי תור בווטסאפ
            </a>
            <div className="flex gap-1 pt-2" aria-label="קישורים חברתיים">
              <SocialLinks social={social} />
            </div>
          </div>
        </nav>
      )}
    </header>
  )
}
