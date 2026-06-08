import mixpanel from 'mixpanel-browser';

const TOKEN = '350a74d45d2277767754b88e66a8ee74';
const IS_DEV = import.meta.env?.DEV ?? false;

mixpanel.init(TOKEN, {
  debug: IS_DEV,
  track_pageview: true,
  persistence: 'localStorage',
});

/**
 * @param {string} event
 * @param {Record<string, unknown>} [properties]
 */
export function trackEvent(event, properties = {}) {
  try {
    if (IS_DEV) console.debug('[analytics]', event, properties);
    mixpanel.track(event, properties);
  } catch { /* ad blockers may prevent Mixpanel from loading */ }
}

export function identifyUser(phone) {
  mixpanel.identify(phone);
}

export function resetUser() {
  mixpanel.reset();
}
