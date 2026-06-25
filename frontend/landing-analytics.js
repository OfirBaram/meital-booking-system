import { trackEvent } from './lib/analytics.js';

// Identify social platform from link href — covers all social strip variants.
function platformFromHref(href) {
  if (!href) return null;
  if (href.includes('wa.me') || href.includes('whatsapp')) return 'whatsapp';
  if (href.includes('instagram.com'))                      return 'instagram';
  if (href.includes('tiktok.com'))                         return 'tiktok';
  if (href.includes('waze.com') || href.startsWith('waze://')) return 'waze';
  if (href.includes('easy.co.il'))                         return 'easy';
  return null;
}

document.addEventListener('DOMContentLoaded', () => {
  // Landing page load — richer than the auto $pageview from Mixpanel init
  trackEvent('landing_page_viewed', {
    referrer:         document.referrer || 'direct',
    has_saved_client: !!localStorage.getItem('meital_client'),
  });

  // Global click delegation — covers all dynamically-rendered elements
  document.body.addEventListener('click', e => {
    const el = e.target.closest('a, button');
    if (!el) return;
    const href = el.getAttribute('href') || '';

    // Hero: WhatsApp CTA
    if (el.classList.contains('btn-primary') && href.includes('wa.me')) {
      trackEvent('hero_cta_clicked', { cta: 'whatsapp' });
      return;
    }
    // Hero: scroll to gallery
    if (el.classList.contains('btn-outline') && href === '#gallery') {
      trackEvent('hero_cta_clicked', { cta: 'gallery' });
      return;
    }
    // Sticky floating book button
    if (el.closest('#sticky-book')) {
      trackEvent('book_now_clicked', { source: 'sticky_bar' });
      return;
    }
    // Desktop / mobile nav anchor links
    if (el.closest('nav') && href.startsWith('#') && href.length > 1) {
      trackEvent('nav_section_clicked', { section: href.slice(1) });
      return;
    }
    // Contact section WhatsApp CTA
    if (el.classList.contains('btn-wa')) {
      trackEvent('contact_whatsapp_clicked');
      return;
    }
    // Service card book button
    if (el.classList.contains('service-book-btn')) {
      trackEvent('service_book_clicked', { service: el.closest('article')?.querySelector('.service-title')?.textContent?.trim() || '' });
      return;
    }
    // Gallery lightbox WA CTA
    if (el.id === 'lb-wa-cta') {
      trackEvent('lightbox_wa_clicked');
      return;
    }
    // Social strip links (header, mobile, footer)
    if (el.closest('#header-social-strip, #mobile-social-strip, #footer-social')) {
      const platform = platformFromHref(href);
      if (platform) trackEvent('social_clicked', { platform });
      return;
    }
  });

  // Mobile hamburger menu open
  const menuBtn = document.getElementById('menu-btn');
  if (menuBtn) {
    menuBtn.addEventListener('click', () => {
      const willOpen = menuBtn.getAttribute('aria-expanded') !== 'true';
      if (willOpen) trackEvent('mobile_menu_opened');
    });
  }

  // Gallery lightbox — track which photo the user opens
  const galleryGrid = document.getElementById('gallery-grid');
  if (galleryGrid) {
    galleryGrid.addEventListener('click', e => {
      const item = e.target.closest('.gallery-item');
      if (!item) return;
      const items = [...galleryGrid.querySelectorAll('.gallery-item')];
      const caption = item.querySelector('.gallery-caption')?.textContent?.trim() || '';
      trackEvent('gallery_photo_opened', {
        photo_index: items.indexOf(item),
        caption,
      });
    });
  }

  // Process section — fires once when 50% of the section is visible
  const processSection = document.getElementById('process');
  if (processSection) {
    new IntersectionObserver((entries, obs) => {
      entries.forEach(e => {
        if (e.isIntersecting) {
          trackEvent('process_section_viewed');
          obs.disconnect();
        }
      });
    }, { threshold: 0.5 }).observe(processSection);
  }

  // Testimonials section — fires once when 50% is visible
  const testimonialsSection = document.getElementById('testimonials');
  if (testimonialsSection) {
    new IntersectionObserver((entries, obs) => {
      entries.forEach(e => {
        if (e.isIntersecting) {
          trackEvent('testimonials_section_viewed');
          obs.disconnect();
        }
      });
    }, { threshold: 0.5 }).observe(testimonialsSection);
  }

  // Gallery "show more" button — delegated, button is rendered after init
  document.addEventListener('click', e => {
    if (e.target.closest('.gallery-more-btn')) {
      trackEvent('gallery_load_more_clicked');
    }
  });

});
