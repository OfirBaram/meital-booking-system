'use client'

import { useState } from 'react'
import { siteConfig } from '@/config/site-config'
import { SocialLinks } from '@/components/SocialLink'
import { MenuIcon, XIcon } from '@/components/icons/SocialIcons'

export function Header() {
  const [open, setOpen] = useState(false)
  const { navigation, social, identity } = siteConfig

  return (
    <header
      className="fixed inset-x-0 top-0 z-50 border-b border-[var(--color-border)] bg-[var(--color-background)]/85 backdrop-blur-md"
      role="banner"
    >
      <div className="mx-auto flex h-[4.5rem] max-w-7xl items-center justify-between px-6 lg:px-8">

        {/* Logo */}
        <a
          href="#"
          className="font-semibold tracking-wide text-[var(--color-charcoal)] no-underline"
          aria-label={identity.name + ' — דף הבית'}
        >
          {identity.name}
        </a>

        {/* Desktop nav */}
        <nav aria-label="ניווט ראשי" className="hidden md:block">
          <ul className="flex items-center gap-10 p-0 m-0 list-none" role="list">
            {navigation.map((item) => (
              <li key={item.href}>
                <a
                  href={item.href}
                  className="text-xs font-medium uppercase tracking-[0.1em] text-[var(--color-muted)] no-underline transition-colors duration-200 hover:text-[var(--color-charcoal)]"
                >
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        {/* Desktop social icons */}
        <div className="hidden items-center gap-1 md:flex" aria-label="קישורים חברתיים">
          <SocialLinks social={social} />
        </div>

        {/* Mobile menu button */}
        <button
          className="inline-flex items-center justify-center rounded p-1.5 text-[var(--color-charcoal)] md:hidden"
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
          <div className="border-t border-[var(--color-border)] bg-[var(--color-background)] px-6 pb-6 pt-4">
            <ul className="mb-5 flex flex-col gap-1 list-none p-0 m-0" role="list">
              {navigation.map((item) => (
                <li key={item.href}>
                  <a
                    href={item.href}
                    className="block py-2.5 text-sm font-medium uppercase tracking-[0.08em] text-[var(--color-muted)] no-underline"
                    onClick={() => setOpen(false)}
                  >
                    {item.label}
                  </a>
                </li>
              ))}
            </ul>
            <div className="flex gap-1 border-t border-[var(--color-border)] pt-4" aria-label="קישורים חברתיים">
              <SocialLinks social={social} />
            </div>
          </div>
        </nav>
      )}
    </header>
  )
}
