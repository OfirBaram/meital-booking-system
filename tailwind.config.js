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
        primary:       '#A67C8E',
        'primary-dk':  '#8B6175',
        'primary-lt':  '#C4A0B0',
        secondary:     '#DDC3A5',
        cream:         '#FAF5F0',
        'admin-bg':    '#FBF6F1',
        'text-main':   '#4A2E3A',
        'text-muted':  '#9B8090',
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
        heebo: ['Heebo', 'sans-serif'],
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
