/**
 * diagnostic-reporter.js — two outputs from one reporter:
 *
 *   1. test-results/CLAUDE-FAILURES.md  — agent-readable failure log (for Claude)
 *   2. $GITHUB_STEP_SUMMARY (in CI)     — human-readable Job Summary: full test
 *                                          table + failure highlights with artifact refs
 *
 * Runs alongside 'html'/'dot'/'github' reporters — never replaces them.
 * If every test passes it writes a short "all green" file so absence of failures is unambiguous.
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

function fmtMs(ms) {
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`
}

export default class DiagnosticReporter {
  constructor() {
    /** @type {Map<string, object>} keyed by test id so retries collapse to one entry. */
    this.failuresById = new Map()
    /** @type {Array<{id:string,title:string,status:string,durationMs:number}>} */
    this.allTestResults = []
    this.total = 0
  }

  onTestEnd(test, result) {
    if (result.retry === 0) this.total++

    // Track every test for the Job Summary table — update on retry so final status wins.
    if (result.retry === 0) {
      this.allTestResults.push({
        id: test.id,
        title: test.titlePath().filter(Boolean).join(' › '),
        status: result.status,
        durationMs: result.duration,
      })
    } else {
      const rec = this.allTestResults.find(t => t.id === test.id)
      if (rec) { rec.status = result.status; rec.durationMs = result.duration }
    }

    // A retry that finally passes clears the earlier failure (flaky-but-green).
    if (result.status === 'passed') { this.failuresById.delete(test.id); return }
    if (result.status === 'skipped') return
    if (result.status === test.expectedStatus) return // expected failure (test.fail())

    const errors = (result.errors ?? []).map(e =>
      (e.stack || e.message || String(e)).replace(/\[[0-9;]*m/g, '')
    )
    const attachments = (result.attachments ?? []).map(a => ({
      name: a.name,
      contentType: a.contentType,
      path: a.path ? rel(a.path) : null,
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
    this.failures = [...this.failuresById.values()]
    this._writeClaudeFailures(result)
    this._writeGithubSummary(result)
  }

  // ─── 1. CLAUDE-FAILURES.md ───────────────────────────────────────────────
  _writeClaudeFailures(result) {
    if (this.failures.length === 0) {
      fs.writeFileSync(OUT_FILE,
        `# E2E Diagnostics — all green ✅\n\nRun status: **${result.status}**. ${this.total} test(s), 0 failures.\nNo screenshots or logs to inspect.\n`,
        'utf8'
      )
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
        const body = t.inline.length > 4000 ? t.inline.slice(0, 4000) + '\n...(truncated)...' : t.inline
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
    process.stdout.write(
      `\n📋 ${this.failures.length} E2E failure(s). Full diagnostics: ${OUT_FILE}\n` +
      `   (screenshots + browser console + network logs per failing test)\n\n`
    )
  }

  // ─── 2. GitHub Actions Job Summary ───────────────────────────────────────
  _writeGithubSummary(result) {
    const summaryPath = process.env.GITHUB_STEP_SUMMARY
    if (!summaryPath) return

    const passed  = this.allTestResults.filter(t => t.status === 'passed').length
    const failed  = this.failures.length
    const skipped = this.allTestResults.filter(t => t.status === 'skipped').length
    const icon    = failed === 0 ? '✅' : '❌'

    // Link back to the Actions run for one-click artifact download
    const runUrl = (process.env.GITHUB_SERVER_URL && process.env.GITHUB_REPOSITORY && process.env.GITHUB_RUN_ID)
      ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`
      : null

    const lines = []
    lines.push(`## ${icon} E2E Tests — ${passed} passed · ${failed} failed${skipped ? ` · ${skipped} skipped` : ''}`)
    if (runUrl) lines.push(`[📎 Full log & artifacts](${runUrl})`)
    lines.push('')

    // Full test table — every test, one row
    lines.push('| | Test | Duration |')
    lines.push('|:---:|---|:---:|')
    for (const t of this.allTestResults) {
      const si   = t.status === 'passed' ? '✅' : t.status === 'skipped' ? '⏭️' : '❌'
      const name = (t.status !== 'passed' && t.status !== 'skipped') ? `**${t.title}**` : t.title
      lines.push(`| ${si} | ${name} | ${fmtMs(t.durationMs)} |`)
    }
    lines.push('')

    // Failure details — one section per failing test
    if (failed > 0) {
      lines.push('---')
      lines.push('')
      lines.push('### ❌ Failure Details')
      lines.push('')
      this.failures.forEach((f, i) => {
        lines.push(`#### ${i + 1}. ${f.title}`)
        lines.push(`> 📍 \`${f.location}\`${f.retry ? ` · retried ${f.retry}×` : ''}`)
        lines.push('')
        if (f.errors.length) {
          // First 6 lines — enough to identify the failure, not the full stack
          const snippet = f.errors[0].split('\n').slice(0, 6).join('\n')
          lines.push('```')
          lines.push(snippet.trim())
          lines.push('```')
          lines.push('')
        }
        const shots = f.attachments.filter(a => a.contentType && a.contentType.startsWith('image/'))
        if (shots.length) {
          lines.push(`📸 \`${shots[0].path}\` — download **playwright-test-results** artifact to view`)
          lines.push('')
        }
      })
    }

    try {
      fs.appendFileSync(summaryPath, lines.join('\n') + '\n', 'utf8')
    } catch {
      // summaryPath not writable (local dev without GITHUB_STEP_SUMMARY set) — skip silently
    }
  }
}
