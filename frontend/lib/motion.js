// Thin wrapper around Motion One (https://motion.dev).
// Import from here throughout the app.
// motion@12 uses framer-motion spring API: { type: spring, stiffness, damping }
// NOT the old easing API: { easing: spring({ stiffness, damping }) }

import { animate, spring, stagger } from 'motion';
export { animate, spring, stagger };
