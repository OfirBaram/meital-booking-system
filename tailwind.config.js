/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './frontend/**/*.html',
    './frontend/**/*.js',
  ],
  theme: {
    extend: {
      // Brand + semantic — keep in sync with frontend/styles/tokens.css
      colors: {
        // Landing page design tokens
        champagne:     '#DDC3A5',
        charcoal:      '#2d2b3d',
        'lp-bg':       '#FAF5F0',
        'lp-card':     '#FFFFFF',
        'lp-muted':    '#8a7f8e',
        'lp-border':   '#e8d5c4',
        // Runtime-themeable brand palette — mapped to CSS-variable RGB
        // channels so admin colour edits (applyTheme) flow into every
        // utility class while opacity modifiers (bg-primary/30) keep working.
        primary:       'rgb(var(--color-primary-rgb) / <alpha-value>)',
        'primary-dk':  '#8B6175',
        'primary-lt':  'rgb(var(--color-primary-lt-rgb) / <alpha-value>)',
        secondary:     'rgb(var(--color-secondary-rgb) / <alpha-value>)',
        cream:         'rgb(var(--color-cream-rgb) / <alpha-value>)',
        'admin-bg':    '#FBF6F1',
        'text-main':   'rgb(var(--color-text-rgb) / <alpha-value>)',
        'text-muted':  'rgb(var(--color-text-muted-rgb) / <alpha-value>)',
        'text-subtle': '#7A6470',
        // Semantic status — enables bg-pending, text-approved, border-rejected, etc.
        pending:       '#E8972E',
        'pending-bg':  '#FCEED9',
        approved:      '#2E9E54',
        'approved-bg': '#DCEFE1',
        rejected:      '#EF4444',
        'rejected-lt': '#f87171',
        'free-bg':     '#F8DEE9',
        'free-dot':    '#F2789F',
      },
      fontFamily: {
        heebo:  ['Heebo', 'sans-serif'],
        serif:  ['Cormorant Garamond', 'Georgia', 'serif'],
      },
      boxShadow: {
        soft:  '0 2px 14px -6px rgba(74,46,58,0.12), 0 1px 4px -2px rgba(74,46,58,0.06)',
        card:  '0 10px 30px -16px rgba(74,46,58,0.24), 0 2px 8px -4px rgba(74,46,58,0.05)',
        sheet: '0 -4px 32px rgba(74,46,58,0.14)',
      },
      transitionTimingFunction: {
        spring:     'cubic-bezier(0.32, 0.72, 0, 1)',
        bounce:     'cubic-bezier(0.34, 1.56, 0.64, 1)',
        'ease-out': 'cubic-bezier(0.22, 1, 0.36, 1)',
      },
      transitionDuration: {
        fast:   '120ms',
        normal: '200ms',
        slow:   '320ms',
      },
      borderRadius: {
        card: '1rem',
        lg2:  '1.4rem',
      },
    },
  },
  plugins: [],
};
