/**
 * diagnostic-reporter.js — a Claude-readable failure log for Playwright.
 *
 * Playwright's built-in HTML report is great for humans clicking around, but a
 * coding agent debugging a CI failure wants ONE plain-text file it can read
 * top-to-bottom: which test failed, where (file:line), the error, the browser
 * console, and which screenshot to look at. This reporter writes exactly that
 * to `test-results/CLAUDE-FAILURES.md` and echoes a pointer to stdout.
 *
 * It is additive — it runs alongside the 'html'/'list'/'dot' reporters, never
 * replaces them. If every test passes it writes a short "all green" file so the
 * absence of failures is unambiguous (vs. the reporter not having run).
 *
 * @implements {import('@playwright/test/reporter').Reporter}
 */
import fs from 'node:fs'
import path from 'node:path'

const OUT_DIR  = 'test-results'
const OUT_FILE = path.join(OUT_DIR, 'CLAUDE-FAILURES.md')

function rel(p) {
  if (!p) return p
  return path.relative(process.cwd(), p).split(path.sep).join('/')
}

export default class DiagnosticReporter {
  constructor() {
    /** @type {Map<string, object>} keyed by test id so retries collapse to one entry. */
    this.failuresById = new Map()
    this.total = 0
  }

  onTestEnd(test, result) {
    if (result.retry === 0) this.total++ // count each test once, not per retry
    // A retry that finally passes clears the earlier-attempt failure (flaky-but-green).
    if (result.status === 'passed') { this.failuresById.delete(test.id); return }
    if (result.status === 'skipped') return
    if (result.status === test.expectedStatus) return // expected failure (e.g. test.fail)

    const errors = (result.errors ?? []).map(e =>
      // Strip ANSI color codes so the markdown stays clean.
      (e.stack || e.message || String(e)).replace(/\[[0-9;]*m/g, '')
    )

    const attachments = (result.attachments ?? []).map(a => ({
      name: a.name,
      contentType: a.contentType,
      path: a.path ? rel(a.path) : null,
      // text attachments (our console/network logs) carry an inline body buffer
      inline: !a.path && a.body ? a.body.toString('utf8') : null,
    }))

    this.failuresById.set(test.id, {
      title: test.titlePath().filter(Boolean).join(' › '),
      location: `${rel(test.location.file)}:${test.location.line}`,
      status: result.status,
      retry: result.retry,
      durationMs: result.duration,
      errors,
      attachments,
    })
  }

  async onEnd(result) {
    fs.mkdirSync(OUT_DIR, { recursive: true })

    // One entry per failing test (its final attempt). Tests that passed on a
    // retry were removed from the map above, so only true failures remain.
    this.failures = [...this.failuresById.values()]

    if (this.failures.length === 0) {
      const ok = `# E2E Diagnostics — all green ✅\n\n` +
        `Run status: **${result.status}**. ${this.total} test(s), 0 failures.\n` +
        `No screenshots or logs to inspect.\n`
      fs.writeFileSync(OUT_FILE, ok, 'utf8')
      return
    }

    const lines = []
    lines.push(`# E2E Failure Diagnostics`)
    lines.push('')
    lines.push(`Run status: **${result.status}** — ${this.failures.length} failing test(s) of ${this.total}.`)
    lines.push('')
    lines.push(`> Read this file first when an E2E run is red. Each section is one`)
    lines.push(`> failing test: the error, the browser console (JS errors fire here`)
    lines.push(`> long before "element not found" does), failed network calls, and`)
    lines.push(`> the screenshot path. Open the screenshot to see the actual UI state.`)
    lines.push('')

    this.failures.forEach((f, i) => {
      lines.push(`## ${i + 1}. ${f.title}`)
      lines.push('')
      lines.push(`- **Location:** \`${f.location}\``)
      lines.push(`- **Status:** ${f.status}${f.retry ? ` (after ${f.retry} retr${f.retry === 1 ? 'y' : 'ies'})` : ''}`)
      lines.push(`- **Duration:** ${f.durationMs} ms`)
      lines.push('')

      if (f.errors.length) {
        lines.push('### Error')
        lines.push('```')
        lines.push(f.errors.join('\n\n').trim())
        lines.push('```')
        lines.push('')
      }

      const screenshots = f.attachments.filter(a => a.contentType && a.contentType.startsWith('image/'))
      const traces      = f.attachments.filter(a => a.name === 'trace' || (a.path && a.path.endsWith('.zip')))
      const videos      = f.attachments.filter(a => a.contentType && a.contentType.startsWith('video/'))
      const textLogs    = f.attachments.filter(a => a.inline != null)

      if (screenshots.length) {
        lines.push('### Screenshot(s)')
        screenshots.forEach(s => lines.push(`- \`${s.path}\``))
        lines.push('')
      }

      textLogs.forEach(t => {
        lines.push(`### ${t.name}`)
        lines.push('```')
        // Cap each inline log so a noisy console doesn't bury the report.
        const body = t.inline.length > 4000 ? t.inline.slice(0, 4000) + '\n…(truncated)…' : t.inline
        lines.push(body.trim())
        lines.push('```')
        lines.push('')
      })

      if (traces.length) {
        lines.push('### Trace')
        traces.forEach(t => lines.push(`- \`${t.path}\` — open with: \`npx playwright show-trace ${t.path}\``))
        lines.push('')
      }
      if (videos.length) {
        lines.push('### Video')
        videos.forEach(v => lines.push(`- \`${v.path}\``))
        lines.push('')
      }
      lines.push('---')
      lines.push('')
    })

    fs.writeFileSync(OUT_FILE, lines.join('\n'), 'utf8')

    // Pointer on stdout so it is impossible to miss in CI logs or a local run.
    process.stdout.write(
      `\n📋 ${this.failures.length} E2E failure(s). Full diagnostics: ${OUT_FILE}\n` +
      `   (screenshots + browser console + network logs per failing test)\n\n`
    )
  }
}
