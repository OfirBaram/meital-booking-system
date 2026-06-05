#!/usr/bin/env node
/**
 * update-content.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * Interactive helper — lists every editable field in site-config.ts and shows
 * how to change it.  Does NOT modify files; it's a guide and validator.
 *
 * USAGE
 *   node scripts/update-content.mjs            # print full guide
 *   node scripts/update-content.mjs --check    # validate config & print status
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { readFileSync, existsSync } from 'node:fs'
import { resolve, join }            from 'node:path'
import { fileURLToPath }            from 'node:url'

const __dir  = fileURLToPath(new URL('.', import.meta.url))
const ROOT   = resolve(__dir, '..')
const CONFIG = join(ROOT, 'config', 'site-config.ts')

const LINE = '─'.repeat(60)
const BOLD = (s) => `\x1b[1m${s}\x1b[0m`
const DIM  = (s) => `\x1b[2m${s}\x1b[0m`
const OK   = `\x1b[32m[OK]\x1b[0m`
const WARN = `\x1b[33m[!]\x1b[0m`

const config = readFileSync(CONFIG, 'utf-8')

// ── --check ───────────────────────────────────────────────────────────────────
if (process.argv.includes('--check')) {
  console.log(`\n${BOLD('site-config.ts — validation report')}\n${LINE}`)

  const checks = [
    ['name',           config.includes('מיטל שבע ברעם'),   'identity.name is set'],
    ['address',        config.includes('רמת גן'),           'identity.city is set'],
    ['siteUrl',        !config.includes('https://example.com'), 'siteUrl updated from placeholder'],
    ['whatsapp url',   !config.match(/whatsapp:\s*"#"/),    'WhatsApp URL is set'],
    ['instagram url',  !config.match(/instagram:\s*"#"/),   'Instagram URL is set'],
    ['gallery images', (config.match(/src: "\/gallery\//g)||[]).length >= 6, 'at least 6 gallery images'],
    ['alt text',       !config.includes('ערוך alt בעברית'), 'no placeholder alt text remaining'],
  ]

  checks.forEach(([, pass, msg]) => console.log(`  ${pass ? OK : WARN}  ${msg}`))

  const placeholderSocials = ['whatsapp', 'instagram', 'tiktok', 'google', 'easy']
    .filter(k => config.match(new RegExp(`${k}:\\s*"#"`)))
  if (placeholderSocials.length)
    console.log(`\n  ${WARN}  Social links still using "#": ${placeholderSocials.join(', ')}`)

  console.log('')
  process.exit(0)
}

// ── default: full guide ───────────────────────────────────────────────────────
console.log(`
${BOLD('Content Update Guide — config/site-config.ts')}
${LINE}

${BOLD('FILE LOCATION')}
  nail-artist-landing-page/config/site-config.ts
  (this is the ONLY file you need to edit for content changes)

${BOLD('LIVE RELOAD')}
  While \`npm run dev\` is running, any save to site-config.ts is
  reflected in the browser within ~1 second via Next.js Fast Refresh.

${LINE}
${BOLD('SECTION MAP')}
${LINE}

  identity{}    Name, tagline, address, city, phone
  seo{}         Page title, meta description, OG image, site URL
  social{}      WhatsApp, Instagram, TikTok, Google Business, Easy
                → Replace "#" with the full URL for each platform
  navigation[]  Menu links (href + Hebrew label)
  services[]    Each service: num, title, duration, description
  gallery[]     Image list  (see Gallery section below)
  business{}    Opening hours, price range
  legal{}       Paths to terms/privacy pages
  colors{}      CSS token values  (champagne, charcoal, muted…)

${LINE}
${BOLD('HOW TO UPDATE A SERVICE')}
${LINE}

  Find the service by its id, e.g. "gel-classic", and edit inline:

    {
      id:          "gel-classic",
      num:         "01",
      title:       "ג'ל קלאסי",          ← שם השירות
      duration:    "90 דקות",             ← משך הטיפול
      description: "...",                 ← תיאור קצר
    },

  To add a service: copy any block, paste it, give it a new id + num.
  To hide a service: delete the block.

${LINE}
${BOLD('HOW TO UPDATE SOCIAL LINKS')}
${LINE}

  social: {
    whatsapp:  "https://wa.me/972501234567",   ← digits only after wa.me/
    instagram: "https://instagram.com/handle",
    tiktok:    "https://tiktok.com/@handle",
    google:    "https://g.page/your-business",
    easy:      "https://easy.co.il/your-page",
  }

  Set a value to null to hide that icon entirely:
    easy: null,

${LINE}
${BOLD('GALLERY (see also: node scripts/sync-gallery.mjs)')}
${LINE}

  To add an image:
    1. Copy the image file into  public/gallery/
    2. Run:  node scripts/sync-gallery.mjs
       (auto-adds entry with placeholder alt text)
    3. Open site-config.ts, find the new entry, replace alt text
       with a proper Hebrew description

  To change an existing image:
    Replace the file in public/gallery/ (keep same filename) — done.

  To change alt text or span2:
    Edit the gallery[] entry directly in site-config.ts.

  span2: true  →  image tiles spans 2 grid rows (tall portrait style)
  span2: false →  standard single-row tile

${LINE}
${BOLD('COLORS')}
${LINE}

  colors: {
    bg:        "#FAF5F0",   // page background
    card:      "#FFFFFF",   // card surfaces
    charcoal:  "#2d2b3d",   // primary text, dark buttons
    champagne: "#DDC3A5",   // accent, borders, highlights
    muted:     "#8a7f8e",   // secondary text
    border:    "#e8d5c4",   // dividers
    primary:   "#A67C8E",   // brand pink (focus rings)
  }

${LINE}
${BOLD('VALIDATION')}
${LINE}

  node scripts/update-content.mjs --check
  (checks for placeholder values and missing config)

${LINE}
`)
