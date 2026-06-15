import mixpanel from 'mixpanel-browser';

const TOKEN = '350a74d45d2277767754b88e66a8ee74';
const IS_DEV = import.meta.env?.DEV ?? false;

mixpanel.init(TOKEN, {
  debug: IS_DEV,
  track_pageview: true,
  persistence: 'localStorage',
  loaded: (mp) => {
    console.log('[Mixpanel] initialized — distinct_id:', mp.get_distinct_id());
  },
});

/**
 * @param {string} event
 * @param {Record<string, unknown>} [properties]
 */
export function trackEvent(event, properties = {}) {
  try {
    console.log('[Mixpanel] track »', event, properties);
    mixpanel.track(event, properties);
  } catch (err) {
    console.warn('[Mixpanel] track failed (ad-blocker?):', err);
  }
}

export function identifyUser(phone) {
  try {
    mixpanel.identify(phone);
    console.log('[Mixpanel] identify »', phone);
  } catch (err) {
    console.warn('[Mixpanel] identify failed:', err);
  }
}

export function resetUser() {
  try {
    mixpanel.reset();
  } catch (err) {
    console.warn('[Mixpanel] reset failed:', err);
  }
}
