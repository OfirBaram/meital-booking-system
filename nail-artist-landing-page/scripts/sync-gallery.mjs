#!/usr/bin/env node
/**
 * sync-gallery.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * Syncs the images in  public/gallery/  with the gallery[] array in
 * config/site-config.ts.  No manual editing needed — just drop an image and
 * run this script.
 *
 * USAGE
 *   node scripts/sync-gallery.mjs              # add any new images found
 *   node scripts/sync-gallery.mjs --list       # show status (no changes)
 *   node scripts/sync-gallery.mjs --remove     # remove entries for deleted files
 *
 * WHAT IT DOES
 *   1. Scans public/gallery/ for image files (.png .jpg .jpeg .webp .avif)
 *   2. Compares with the src values already in site-config.ts
 *   3. Appends new entries (span2: false, alt = filename-based placeholder)
 *   4. Optionally removes entries whose files no longer exist
 *   5. Reminds you to fill in Hebrew alt text
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { readdir }   from 'node:fs/promises'
import { join, extname, resolve } from 'node:path'
import { fileURLToPath }          from 'node:url'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'

const __dir     = fileURLToPath(new URL('.', import.meta.url))
const ROOT      = resolve(__dir, '..')
const GALLERY   = join(ROOT, 'public', 'gallery')
const CONFIG    = join(ROOT, 'config', 'site-config.ts')
const IMG_EXTS  = new Set(['.png', '.jpg', '.jpeg', '.webp', '.avif', '.gif'])
const GALLERY_END_RE = /(  \] satisfies GalleryImage\[\],)/

// ── helpers ──────────────────────────────────────────────────────────────────
function readConfig() {
  if (!existsSync(CONFIG)) throw new Error('config/site-config.ts not found')
  return readFileSync(CONFIG, 'utf-8')
}

function extractSrcs(config) {
  return [...config.matchAll(/src:\s*["']\/gallery\/([^"']+)["']/g)].map(m => m[1])
}

function filenameToAlt(filename) {
  // "nail-7.png" → "תמונה 7 — ערוך alt בעברית ב-site-config.ts"
  const num = filename.match(/\d+/)?.[0] ?? ''
  return `תמונה ${num} — ערוך alt בעברית ב-site-config.ts`
}

function buildEntry(filename, isLast) {
  const src = `/gallery/${filename}`
  const alt = filenameToAlt(filename)
  // span2: alternate true/false for variety
  return `    { src: "${src}", alt: "${alt}", span2: false },`
}

// ── main ─────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2)

let galleryFiles
try {
  const all = await readdir(GALLERY)
  galleryFiles = all.filter(f => IMG_EXTS.has(extname(f).toLowerCase())).sort()
} catch {
  console.error(`\n  ERROR: could not read ${GALLERY}`)
  console.error('  Make sure public/gallery/ exists.\n')
  process.exit(1)
}

const config   = readConfig()
const inConfig = extractSrcs(config)

// ── --list ───────────────────────────────────────────────────────────────────
if (args.includes('--list')) {
  console.log('\n  Gallery status\n  ' + '─'.repeat(50))
  console.log('\n  In public/gallery/:')
  galleryFiles.forEach(f => {
    const status = inConfig.includes(f) ? '[in config]' : '[NOT in config]'
    console.log(`    ${status.padEnd(16)} ${f}`)
  })
  console.log('\n  In site-config.ts gallery[]:')
  inConfig.forEach(f => {
    const onDisk = galleryFiles.includes(f)
    console.log(`    ${onDisk ? '[file exists]' : '[FILE MISSING]'}  ${f}`)
  })
  console.log('')
  process.exit(0)
}

// ── --remove ─────────────────────────────────────────────────────────────────
if (args.includes('--remove')) {
  const missing = inConfig.filter(f => !galleryFiles.includes(f))
  if (missing.length === 0) {
    console.log('  No stale entries found.')
    process.exit(0)
  }
  let updated = config
  missing.forEach(f => {
    // Remove the entire line containing this src
    const lineRE = new RegExp(`\\n?\\s*\\{[^}]*src:\\s*["']\\\/gallery\\\/${f}["'][^}]*\\},?`, 'g')
    updated = updated.replace(lineRE, '')
  })
  writeFileSync(CONFIG, updated, 'utf-8')
  console.log(`  Removed ${missing.length} stale entries: ${missing.join(', ')}`)
  process.exit(0)
}

// ── default: add new images ───────────────────────────────────────────────────
const newFiles = galleryFiles.filter(f => !inConfig.includes(f))

if (newFiles.length === 0) {
  console.log('\n  All images are already in site-config.ts. Nothing to do.\n')
  process.exit(0)
}

console.log(`\n  Found ${newFiles.length} new image(s): ${newFiles.join(', ')}`)

const newEntries = newFiles.map(buildEntry).join('\n')
const updated    = config.replace(GALLERY_END_RE, `${newEntries}\n$1`)

if (updated === config) {
  console.error('\n  ERROR: Could not locate the end of gallery[] in site-config.ts.')
  console.error('  Make sure the line "] satisfies GalleryImage[]," is present.\n')
  process.exit(1)
}

writeFileSync(CONFIG, updated, 'utf-8')

console.log(`  Added ${newFiles.length} entry/entries to config/site-config.ts`)
console.log('\n  ACTION REQUIRED:')
console.log('  Open config/site-config.ts and replace the placeholder alt text')
console.log('  with proper Hebrew descriptions for each new image.\n')
console.log('  Example:')
newFiles.forEach(f => {
  console.log(`    alt: "${filenameToAlt(f)}"`)
  console.log(`    →  alt: "תיאור קצר ומדויק בעברית"`)
})
console.log('')
