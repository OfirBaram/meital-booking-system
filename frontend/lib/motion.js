// Thin wrapper around Motion One (https://motion.dev).
// Import from here throughout the app — one place to swap the CDN or version.
//
// Presets keep spring parameters consistent:
//   springs.enter — elements entering the screen (steps, tabs, modals)
//   springs.pop   — tappable element feedback (cards, chips)
//   springs.fast  — snappy commit animations (approve/reject fly-out)

import { animate, spring, stagger } from 'motion';
export { animate, spring, stagger };

export const springs = {
  enter: { easing: spring({ stiffness: 300, damping: 25 }) },
  pop:   { easing: spring({ stiffness: 500, damping: 18 }) },
  fast:  { easing: spring({ stiffness: 450, damping: 32 }) },
};
