# Landing Page — State & Roadmap
> Branch: `feat/desktop-responsive-layout`
> Last updated: 2026-06-05
> Stack: Next.js 16 (App Router) · TypeScript · Tailwind CSS v4 · React 19

---

## 1. What Was Built

A standalone RTL Hebrew landing page for Meytal Sheva Baram — nail art boutique studio, Ramat Gan.
Completely separate from the main booking app (`frontend/`). Lives in `nail-artist-landing-page/`.

### Architecture
Single source of truth: **`config/site-config.ts`** — edit one file to update all content, links, colors.

```
nail-artist-landing-page/
├── app/
│   ├── layout.tsx          # HTML shell, metadata, JSON-LD, fonts, skip link
│   ├── page.tsx            # Page composition — assembles all sections
│   ├── globals.css         # Tailwind v4 @theme tokens + base layer
│   ├── privacy/page.tsx    # /privacy route (placeholder)
│   └── takanon/page.tsx    # /takanon route (placeholder)
├── components/
│   ├── header.tsx          # Fixed nav + social icons ('use client' — mobile menu)
│   ├── hero.tsx            # Full-screen hero, WhatsApp CTA
│   ├── about.tsx           # Studio story + LCP image (priority)
│   ├── Services.tsx        # 4 service cards (article elements)
│   ├── gallery.tsx         # Masonry grid (figure/figcaption)
│   ├── contact.tsx         # Dark CTA section + info grid
│   ├── footer.tsx          # Legal links + social icons
│   ├── SocialLink.tsx      # Renders social icons from siteConfig.social
│   └── icons/SocialIcons.tsx
├── config/
│   └── site-config.ts      # ← SINGLE SOURCE OF TRUTH
├── public/
│   └── gallery/            # nail-1.png … nail-6.png (placeholders)
├── scripts/
│   ├── sync-gallery.mjs    # Auto-add new gallery images to config
│   └── update-content.mjs  # Content update guide + --check validator
└── LANDING_STATE.md        # ← this file
```

### Design System
| Token | Value | Tailwind utility |
|---|---|---|
| `--color-bg` | `#FAF5F0` | `bg-bg`, `text-bg` |
| `--color-card` | `#FFFFFF` | `bg-card` |
| `--color-charcoal` | `#2d2b3d` | `text-charcoal`, `bg-charcoal` |
| `--color-champagne` | `#DDC3A5` | `text-champagne`, `bg-champagne`, `border-champagne` |
| `--color-muted` | `#8a7f8e` | `text-muted` |
| `--color-border` | `#e8d5c4` | `border-border` |
| `--color-primary` | `#A67C8E` | `bg-primary` (focus rings) |
| Font | Assistant (Hebrew+Latin) | `--font-assistant` via `next/font/google` |

**CRITICAL — Tailwind v4 + Turbopack rule:**
NEVER use `text-[var(--color-X)]` arbitrary CSS variable values in class names.
Turbopack's Lightning CSS optimizer corrupts certain property names, causing a 500 crash.
Always use named utilities: `text-charcoal`, `bg-champagne`, `border-border`, etc.
See §6 (Known Bugs) for full explanation.

---

## 2. Current Status

### Done
- [x] Full Hebrew RTL landing page — hero, about, services, gallery, contact, footer
- [x] `config/site-config.ts` single source of truth (content, links, colors, SEO)
- [x] Social links live: Instagram (`@meytal.sheva`), TikTok (`@meytal.sheva`), Waze navigation
- [x] SEO: title, description, expanded keywords, Open Graph, Twitter Card
- [x] JSON-LD structured data: `NailSalon` type, `sameAs`, `hasMap`, `openingHours`
- [x] hreflang `he-IL` via `alternates.languages`
- [x] Canonical URL via `metadataBase` + `alternates.canonical`
- [x] `robots: { index: true, follow: true }` — full crawl permission
- [x] Preconnect + dns-prefetch for Google Fonts
- [x] WCAG 2.4.1 skip link, ARIA labels, heading hierarchy h1→h2→h3
- [x] Semantic HTML5: `<header>`, `<main>`, `<section>`, `<article>`, `<figure>`, `<footer>`, `<nav>`
- [x] LCP image marked with `priority` (about section, `nail-1.png`)
- [x] Gallery `sizes` attribute for responsive image loading
- [x] Gallery sync script + content validator npm scripts
- [x] Lightning CSS arbitrary value corruption bug fixed (see §6)
- [x] Production build clean — `npm run build` passes, 5 static pages

### Pending (owner action required)
- [ ] `siteConfig.seo.siteUrl` — replace `"https://example.com"` with real domain
- [ ] `siteConfig.social.whatsapp` — replace `"#"` with `"https://wa.me/972XXXXXXXXX"`
- [ ] `siteConfig.identity.phone` — add phone number (used in JSON-LD `telephone`)
- [ ] Real gallery images — replace placeholder nail-1…6.png with actual photos
- [ ] Legal pages — `/takanon` and `/privacy` are placeholder pages only

---

## 3. Improvement Roadmap

### 3a. E2E Tests  (Priority: HIGH — zero tests currently)

Add Playwright tests at `tests/e2e/landing/`.

**landing-smoke.spec.ts**
- Page loads with correct `<title>` (no 500 error)
- `<h1>` contains expected Hebrew text
- Instagram link href matches site-config value, has `target="_blank"` and `rel="noopener noreferrer"`
- TikTok link — same checks
- Waze link — same checks
- WhatsApp CTA visible in hero
- Gallery renders 6 images
- No JS console errors on load

**landing-accessibility.spec.ts**
- Skip link is present and focusable
- All `<img>` elements have non-empty `alt` attribute
- `<nav>` elements have `aria-label`
- Tab order flows logically through header

**landing-seo.spec.ts**
- `<meta name="description">` is present and non-empty
- JSON-LD script contains `"@type":"NailSalon"`
- `og:image` meta tag present
- `<link rel="alternate" hreflang="he-IL">` present
- `<link rel="canonical">` present
- `<title>` is unique and non-empty

**How to run:**
```
cd nail-artist-landing-page && npm run dev
npx playwright test tests/e2e/landing/ --headed
```

---

### 3b. SEO  (Priority: HIGH)

| Item | Status | Action |
|---|---|---|
| `sitemap.xml` | Missing | Add `app/sitemap.ts` (Next.js App Router) |
| `robots.txt` | Missing | Add `app/robots.ts` |
| OG image (real) | Placeholder | Create 1200x630 branded image → `/public/og-image.jpg` |
| `favicon.ico` | 404 error | Add `public/favicon.ico` and `app/icon.tsx` |
| Google Search Console | Not done | After deploy: verify ownership, submit sitemap |
| Lighthouse score | Untested | Run after deploy, target 90+ on all metrics |
| `openingHoursSpecification` | Basic | Upgrade from string array to full Schema.org object |

**sitemap.ts template** (`app/sitemap.ts`):
```typescript
import { siteConfig } from '@/config/site-config'
export default function sitemap() {
  return [
    { url: siteConfig.seo.siteUrl, lastModified: new Date(), changeFrequency: 'monthly' as const, priority: 1 },
    { url: siteConfig.seo.siteUrl + '/takanon', lastModified: new Date(), changeFrequency: 'yearly' as const, priority: 0.3 },
    { url: siteConfig.seo.siteUrl + '/privacy', lastModified: new Date(), changeFrequency: 'yearly' as const, priority: 0.3 },
  ]
}
```

**robots.ts template** (`app/robots.ts`):
```typescript
import { siteConfig } from '@/config/site-config'
export default function robots() {
  return {
    rules: { userAgent: '*', allow: '/' },
    sitemap: siteConfig.seo.siteUrl + '/sitemap.xml',
  }
}
```

---

### 3c. Performance  (Priority: HIGH)

**Target: Lighthouse ≥ 90 on LCP / CLS / TBT / Speed Index.**

| Metric | Status | Action |
|---|---|---|
| LCP | Unknown | About image has `priority` — verify ≤ 2.5s after deploy |
| CLS | Unknown | Check gallery masonry for layout shift on load |
| Image formats | PNG only | Convert gallery to WebP/AVIF (50-70% smaller) |
| Bundle size | Unknown | Run `ANALYZE=true npm run build` to inspect chunks |
| Font preload | `display:swap` set | Next.js `next/font/google` self-hosts — already optimal |

**next.config.js to add** (file does not exist yet):
```javascript
/** @type {import('next').NextConfig} */
const config = {
  images: {
    formats: ['image/avif', 'image/webp'],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920],
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ]
  },
}
export default config
```

---

### 3d. UX / UI  (Priority: MEDIUM)

**Mobile responsiveness (test these breakpoints):**
- 375px (iPhone SE) — hero text size, gallery 2-col
- 390px (iPhone 14 Pro) — button tap targets ≥ 44px
- 768px (iPad) — header nav visible, service cards 2-col
- 1280px (desktop) — full layout, 4-col services, 3-col gallery

**Animations (not yet implemented):**
- Scroll-triggered entrance animations on sections (Intersection Observer)
- Service cards: staggered fade-in on first viewport entry
- About image: subtle parallax on scroll
- Gallery: lazy-load fade-in per tile

**Content gaps:**
- About section uses `nail-1.png` (a nail photo) — should use Meytal's actual portrait photo
- Contact section has no map embed — consider adding Google Maps iframe or Waze widget
- Services: no pricing — add price range if desired
- Add WhatsApp floating button (bottom-right corner, always visible)
- Footer: add "Built with ❤️" or just year — minimal

**Accessibility improvements:**
- Add `lang="he"` to RTL content blocks where language switches
- Verify color contrast ratios (champagne on white may be borderline WCAG AA)
- Test with VoiceOver / NVDA screen reader
- Mobile: verify all touch targets are 44×44px minimum

---

### 3e. Security  (Priority: MEDIUM)

| Item | Status | Action |
|---|---|---|
| `X-Frame-Options` | Meta removed (correct) | Must be HTTP header — set in `next.config.js` (see §3c) |
| `X-Content-Type-Options` | In metadata `other` | Also needs HTTP header via `next.config.js` |
| `Content-Security-Policy` | Not set | Add to `next.config.js` headers |
| External links | All have `rel="noopener noreferrer"` | Done |
| No user input | No forms on landing page | No XSS surface currently |
| HTTPS | Handled by hosting (Vercel/Netlify) | Verify after deploy |

**CSP header (add to next.config.js headers array):**
```
Content-Security-Policy: default-src 'self'; font-src 'self' fonts.gstatic.com; style-src 'self' 'unsafe-inline' fonts.googleapis.com; img-src 'self' data:; script-src 'self' 'unsafe-inline';
```

---

### 3f. Deployment Checklist

Before going live:
1. Update `siteConfig.seo.siteUrl` to real domain
2. Update `siteConfig.social.whatsapp` to real URL
3. Add real phone: `siteConfig.identity.phone`
4. Replace placeholder gallery images with real photos
5. Write real content for `/takanon` and `/privacy` pages
6. Add `public/favicon.ico` (fix the 404 console error)
7. Add `next.config.js` with security headers and image config
8. Run `npm run build` — must be clean
9. Run `npm run content:check` — zero warnings
10. Deploy to Vercel (recommended) or Netlify
11. Submit sitemap to Google Search Console

---

## 4. File Editing Rules (CRITICAL)

### U+200F Path Hazard
The repo path contains RIGHT-TO-LEFT MARK characters (U+200F) before "OfirBaram".
The built-in Edit/Write tools resolve this to a stray wrong directory.
**All file edits must use Python via Bash:**

```bash
PYTHON=/c/Users/DELL/AppData/Local/Programs/Python/Python312/python.exe
PYTHONIOENCODING=utf-8 $PYTHON - << 'PYEOF'
import pathlib, sys
sys.stdout.reconfigure(encoding='utf-8')
BASE = pathlib.Path(".") / "nail-artist-landing-page"
p = BASE / "config/site-config.ts"
txt = p.read_text(encoding="utf-8")
txt = txt.replace("old string", "new string")
p.write_text(txt, encoding="utf-8")
PYEOF
```

Or use the ai_tools.py patch utility:
```bash
$PYTHON skills/utils/ai_tools.py patch nail-artist-landing-page/config/site-config.ts \
  --old "old string" --new "new string"
```

### Tailwind v4 — Never use arbitrary color var() classes
Wrong:  `className="text-[var(--color-charcoal)]"`
Right:  `className="text-charcoal"`

Wrong:  `className="bg-[var(--color-champagne)]/20"`
Right:  `className="bg-champagne/20"`

Using arbitrary `var(--color-X)` values in Tailwind v4 with Turbopack causes
Lightning CSS to generate corrupt class names → 500 crash (see §6).

---

## 5. npm Scripts Reference

| Command | Action |
|---|---|
| `npm run dev` | Dev server on http://localhost:3000 |
| `npm run build` | Production build (run before every commit) |
| `npm run start` | Serve production build locally |
| `npm run sync-gallery` | Add new images from public/gallery/ to config |
| `npm run gallery:list` | Show which images are/aren't in config |
| `npm run gallery:remove` | Remove config entries for deleted image files |
| `npm run content:check` | Validate config — spot placeholder values |
| `npm run content:guide` | Print full content update guide |

---

## 6. Known Bugs & Gotchas

### Lightning CSS arbitrary value corruption (FIXED — 2026-06-05)
**Symptom:** Dev server 500 error, page completely blank.
**Root cause:** Turbopack's Lightning CSS optimizer corrupts CSS custom property
names containing reserved words (`background`, `muted`, etc.) when used inside
Tailwind v4 arbitrary value brackets like `text-[var(--color-muted)]`.
**Fix applied:**
- Renamed `--color-background` → `--color-bg` in globals.css
- Converted ALL `X-[var(--color-Y)]` classes → `X-Y` named utilities across 10 files
**Prevention:** Never use `var(--color-X)` inside Tailwind arbitrary value brackets.

### .next cache stale after CSS changes
After significant CSS changes, delete cache and restart:
```bash
rm -rf nail-artist-landing-page/.next
npm --prefix nail-artist-landing-page run dev
```

### Waze URL needs verification
`siteConfig.social.waze` contains: `https://www.waze.com/ul?q=%D7%A8%D7%A9%D7%99+11+%D7%A8%D7%9E%D7%AA+%D7%92%D7%9F`
Decoded query: "רשי 11 רמת גן" — verify this navigates to the correct location before launch.

### favicon.ico 404
Console warning on every page load. Fix: add `public/favicon.ico`.

### Git — PowerShell cannot run git commands
Run ALL git commands through the Bash tool only.
PowerShell fails with "not a git repository" due to U+200F in the path.
