/**
 * Unit tests for the landing page site-config.
 * Validates config integrity so broken placeholder values or regressions
 * are caught before they reach production.
 */
import { describe, it, expect } from 'vitest'
import { siteConfig } from '../../../nail-artist-landing-page/config/site-config'

// ── Social Links ──────────────────────────────────────────────────────────────
describe('social.whatsapp', () => {
  it('is a valid https URL (not null or #)', () => {
    expect(siteConfig.social.whatsapp).toBeTruthy()
    expect(siteConfig.social.whatsapp).toMatch(/^https:\/\//)
  })

  it('targets the correct phone number', () => {
    expect(siteConfig.social.whatsapp).toContain('972547686865')
  })

  it('contains a pre-filled message', () => {
    expect(siteConfig.social.whatsapp).toContain('?text=')
  })

  it('message includes Hebrew-encoded characters', () => {
    // %D7 is the first byte of most Hebrew Unicode chars in URL encoding
    expect(siteConfig.social.whatsapp).toContain('%D7')
  })
})

describe('social.instagram', () => {
  it('is a valid https URL', () => {
    expect(siteConfig.social.instagram).toMatch(/^https:\/\//)
  })

  it('points to instagram.com', () => {
    expect(siteConfig.social.instagram).toContain('instagram.com')
  })

  it('is not the # placeholder', () => {
    expect(siteConfig.social.instagram).not.toBe('#')
  })
})

describe('social.tiktok', () => {
  it('is a valid https URL', () => {
    expect(siteConfig.social.tiktok).toMatch(/^https:\/\//)
  })

  it('points to tiktok.com', () => {
    expect(siteConfig.social.tiktok).toContain('tiktok.com')
  })
})

describe('social.waze', () => {
  it('is a valid URL', () => {
    expect(siteConfig.social.waze).toMatch(/^https:\/\//)
  })

  it('includes navigate=yes to open navigation immediately', () => {
    expect(siteConfig.social.waze).toContain('navigate=yes')
  })
})

// ── Identity ──────────────────────────────────────────────────────────────────
describe('identity', () => {
  it('name is non-empty', () => {
    expect(siteConfig.identity.name.trim()).toBeTruthy()
  })

  it('studio is non-empty', () => {
    expect(siteConfig.identity.studio.trim()).toBeTruthy()
  })

  it('city is רמת גן', () => {
    expect(siteConfig.identity.city).toBe('רמת גן')
  })

  it('whatsappNumber is digits only (no + or spaces)', () => {
    expect(siteConfig.identity.whatsappNumber).toMatch(/^\d+$/)
  })

  it('whatsappNumber starts with 972 (Israeli country code)', () => {
    expect(siteConfig.identity.whatsappNumber).toMatch(/^972/)
  })
})

// ── Gallery ───────────────────────────────────────────────────────────────────
describe('gallery', () => {
  it('has at least 6 images', () => {
    expect(siteConfig.gallery.length).toBeGreaterThanOrEqual(6)
  })

  it('all images have non-empty alt text', () => {
    siteConfig.gallery.forEach(({ alt, src }) => {
      expect(alt.trim(), `alt missing for ${src}`).toBeTruthy()
    })
  })

  it('all image srcs start with /gallery/', () => {
    siteConfig.gallery.forEach(({ src }) => {
      expect(src, `bad src: ${src}`).toMatch(/^\/gallery\//)
    })
  })

  it('at least one image has span2=true (tall tile for masonry)', () => {
    expect(siteConfig.gallery.some((img) => img.span2)).toBe(true)
  })
})

// ── Services ──────────────────────────────────────────────────────────────────
describe('services', () => {
  it('has at least 4 services', () => {
    expect(siteConfig.services.length).toBeGreaterThanOrEqual(4)
  })

  it('all service IDs are unique', () => {
    const ids = siteConfig.services.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('all service nums are unique', () => {
    const nums = siteConfig.services.map((s) => s.num)
    expect(new Set(nums).size).toBe(nums.length)
  })

  it('all services have non-empty title, duration, description', () => {
    siteConfig.services.forEach(({ id, title, duration, description }) => {
      expect(title.trim(),       `title missing for ${id}`).toBeTruthy()
      expect(duration.trim(),    `duration missing for ${id}`).toBeTruthy()
      expect(description.trim(), `description missing for ${id}`).toBeTruthy()
    })
  })
})

// ── Navigation ────────────────────────────────────────────────────────────────
describe('navigation', () => {
  it('has at least 4 nav items', () => {
    expect(siteConfig.navigation.length).toBeGreaterThanOrEqual(4)
  })

  it('all hrefs are hash anchors (same-page links)', () => {
    siteConfig.navigation.forEach(({ href, label }) => {
      expect(href, `bad href for "${label}"`).toMatch(/^#/)
    })
  })

  it('includes #contact link', () => {
    expect(siteConfig.navigation.map((n) => n.href)).toContain('#contact')
  })

  it('all labels are non-empty Hebrew text', () => {
    siteConfig.navigation.forEach(({ label }) => {
      expect(label.trim()).toBeTruthy()
    })
  })
})

// ── SEO ───────────────────────────────────────────────────────────────────────
describe('SEO config', () => {
  it('title mentions the business name', () => {
    expect(siteConfig.seo.title).toContain('מיטל')
  })

  it('title mentions רמת גן for local SEO', () => {
    expect(siteConfig.seo.title).toContain('רמת גן')
  })

  it('description is at least 100 characters', () => {
    expect(siteConfig.seo.description.length).toBeGreaterThanOrEqual(100)
  })

  it('keywords include core nail service terms', () => {
    const kw = siteConfig.seo.keywords
    expect(kw).toContain('ציפורניים')
    expect(kw).toContain('רמת גן')
  })

  it('ogImage starts with /', () => {
    expect(siteConfig.seo.ogImage).toMatch(/^\//)
  })
})

// ── Business ──────────────────────────────────────────────────────────────────
describe('business', () => {
  it('hours are non-empty', () => {
    expect(siteConfig.business.hours.trim()).toBeTruthy()
  })

  it('priceRange is set', () => {
    expect(siteConfig.business.priceRange.trim()).toBeTruthy()
  })
})
