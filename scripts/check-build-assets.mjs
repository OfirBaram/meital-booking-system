/**
 * Post-build asset integrity check.
 *
 * Scans every HTML file in dist/ for local file references that Vite does NOT
 * rewrite at build time (JS string literals inside <script> blocks) and verifies
 * every referenced file actually exists in dist/.
 *
 * Catches the class of bug where a path like './public/gallery/nail-01.jpg'
 * survives the build unchanged but resolves to a 404 in production because Vite
 * strips the /public/ prefix when copying the public/ directory.
 *
 * Exit code 0 = all good. Exit code 1 = missing assets (CI fails, deploy blocked).
 */

import { readFileSync, existsSync, readdirSync } from 'fs'
import { resolve, dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const distDir = resolve(__dirname, '..', 'dist')

// Regex: local relative paths inside JS string literals (single or double quotes)
// Matches: './gallery/nail-01.jpg'  './images/foo.png'  etc.
// Skips:   './assets/...' — Vite manages those with content hashes
const JS_STRING_PATH = /['"](\.[^'"]+\.(?:jpg|jpeg|png|webp|gif|svg|mp4|pdf))['"](?!\s*,\s*contentType)/g

let failures = 0
let checked = 0

const htmlFiles = readdirSync(distDir).filter(f => f.endsWith('.html'))

for (const htmlFile of htmlFiles) {
  const htmlPath = join(distDir, htmlFile)
  const content = readFileSync(htmlPath, 'utf-8')

  // Extract only the <script> blocks — Vite rewrites attributes in HTML tags,
  // but never touches JS string contents.
  const scriptBlocks = [...content.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)]
    .map(m => m[1])
    .join('\n')

  const seen = new Set()
  let m
  JS_STRING_PATH.lastIndex = 0

  while ((m = JS_STRING_PATH.exec(scriptBlocks)) !== null) {
    const ref = m[1]

    // Skip Vite-managed asset paths (content-hashed, always present if build passed)
    if (ref.startsWith('./assets/')) continue
    // Skip external-looking relative paths (data URIs, etc.)
    if (ref.includes('://')) continue
    if (seen.has(ref)) continue
    seen.add(ref)

    checked++
    // Resolve relative to dist/ root
    const abs = resolve(distDir, ref.replace(/^\.\//, ''))
    if (!existsSync(abs)) {
      console.error(`✖  MISSING  ${htmlFile}: JS string references "${ref}" → not found in dist/`)
      console.error(`   Expected: ${abs}`)
      failures++
    }
  }
}

if (failures === 0) {
  console.log(`✓  check-build-assets: ${checked} JS-string asset reference(s) across ${htmlFiles.length} HTML file(s) — all present in dist/`)
} else {
  console.error(`\n✖  ${failures} missing asset(s). Fix the paths before deploying.`)
  console.error(`   Hint: Vite copies frontend/public/ → dist/ root (strips /public/ prefix).`)
  console.error(`         JS string literals are NOT rewritten by Vite — use the runtime path.`)
  process.exit(1)
}
