# -*- coding: utf-8 -*-
"""One-shot script: apply all landing page improvements."""
import sys

with open('frontend/landing.html', 'r', encoding='utf-8') as f:
    content = f.read()

errors = []

def patch(old, new, desc):
    global content
    if old not in content:
        errors.append('NOT FOUND: ' + desc)
        return
    content = content.replace(old, new, 1)
    print('OK: ' + desc)

# ── 1. Canonical URL
patch(
    '<link rel="canonical" href="https://example.com/" /><!-- עדכן ל-URL האמיתי -->',
    '<link rel="canonical" href="https://ofirbaram.github.io/meital-booking-system/" />',
    'canonical'
)

# ── 2. OG URL
patch(
    '<meta property="og:url"         content="https://example.com/" /><!-- עדכן -->',
    '<meta property="og:url"         content="https://ofirbaram.github.io/meital-booking-system/" />',
    'og:url'
)

# ── 3. Schema.org
patch(
    '  {\n'
    '    "@context": "https://schema.org",\n'
    '    "@type": "BeautySalon",\n'
    '    "name": "מיטל שבע ברעם — עיצוב ציפורניים",\n'
    '    "description": "סטודיו עיצוב ציפורניים בוטיק ברמת גן",\n'
    '    "address": {\n'
    '      "@type": "PostalAddress",\n'
    '      "streetAddress": "11",\n'
    '      "addressLocality": "רמת גן",\n'
    '      "addressCountry": "IL"\n'
    '    },\n'
    '    "url": "https://example.com",\n'
    '    "priceRange": "₪₪",\n'
    '    "openingHours": "Tu-Sa 10:00-19:00"\n'
    '  }',
    '  {\n'
    '    "@context": "https://schema.org",\n'
    '    "@type": "BeautySalon",\n'
    '    "name": "מיטל שבע ברעם — עיצוב ציפורניים",\n'
    '    "description": "סטודיו עיצוב ציפורניים בוטיק ברמת גן",\n'
    '    "address": {\n'
    '      "@type": "PostalAddress",\n'
    '      "streetAddress": "11",\n'
    '      "addressLocality": "רמת גן",\n'
    '      "addressCountry": "IL"\n'
    '    },\n'
    '    "telephone": "+972547686865",\n'
    '    "email": "meital_sheva7@hotmail.com",\n'
    '    "url": "https://ofirbaram.github.io/meital-booking-system/",\n'
    '    "priceRange": "₪₪",\n'
    '    "openingHoursSpecification": [{\n'
    '      "@type": "OpeningHoursSpecification",\n'
    '      "dayOfWeek": ["Tuesday","Wednesday","Thursday","Friday","Saturday"],\n'
    '      "opens": "10:00",\n'
    '      "closes": "19:00"\n'
    '    }],\n'
    '    "sameAs": [\n'
    '      "https://www.instagram.com/meytal.sheva",\n'
    '      "https://www.tiktok.com/@meytal.sheva"\n'
    '    ]\n'
    '  }',
    'schema.org'
)

# ── 4. SiteConfig identity
patch(
    "    phone:     '',   // e.g. '050-1234567'\n"
    "    whatsapp:  '',   // e.g. '972501234567'  (ספרות בלבד, ללא +)",
    "    phone:     '054-768-6865',\n"
    "    whatsapp:  '972547686865',\n"
    "    email:     'meital_sheva7@hotmail.com',\n"
    "    apiBase:   '',   // GAS web app URL — if set, shows next available slot in hero",
    'SiteConfig identity'
)

# ── 5. CSS additions
patch(
    "    /* ── DIVIDER ── */\n"
    "    .divider { border: none; border-top: 1px solid var(--border); margin: 0; }\n"
    "  </style>",
    "    /* ── DIVIDER ── */\n"
    "    .divider { border: none; border-top: 1px solid var(--border); margin: 0; }\n"
    "\n"
    "    /* ── STICKY BOOK BUTTON ── */\n"
    "    #sticky-book {\n"
    "      position: fixed; bottom: 1.5rem; left: 50%; transform: translateX(-50%);\n"
    "      z-index: 100; transition: opacity .3s, transform .3s;\n"
    "      opacity: 0; pointer-events: none;\n"
    "    }\n"
    "    #sticky-book.visible { opacity: 1; pointer-events: auto; }\n"
    "    #sticky-book a {\n"
    "      display: inline-flex; align-items: center; gap: .6rem;\n"
    "      padding: .875rem 2rem;\n"
    "      background: var(--charcoal); color: #FAF5F0;\n"
    "      font-size: .875rem; font-weight: 600; letter-spacing: .08em;\n"
    "      text-decoration: none; border-radius: 100px;\n"
    "      box-shadow: 0 4px 20px rgba(45,43,61,.35);\n"
    "      transition: transform .2s, box-shadow .2s; white-space: nowrap;\n"
    "    }\n"
    "    #sticky-book a:hover { transform: translateY(-2px); box-shadow: 0 8px 28px rgba(45,43,61,.4); }\n"
    "\n"
    "    /* ── GALLERY LIGHTBOX ── */\n"
    "    #lightbox {\n"
    "      position: fixed; inset: 0; z-index: 9000;\n"
    "      background: rgba(0,0,0,.92);\n"
    "      display: flex; align-items: center; justify-content: center;\n"
    "    }\n"
    "    #lightbox[hidden] { display: none; }\n"
    "    #lb-body { max-width: 90vw; max-height: 90vh; text-align: center; }\n"
    "    #lb-img { max-width: 100%; max-height: 80vh; object-fit: contain; display: block; }\n"
    "    #lb-caption { color: rgba(255,255,255,.65); margin-top: .75rem; font-size: .875rem; }\n"
    "    #lb-close {\n"
    "      position: fixed; top: 1.25rem; left: 1.25rem;\n"
    "      background: none; border: none; color: #fff; font-size: 2rem;\n"
    "      cursor: pointer; z-index: 9001; line-height: 1; padding: .25rem .5rem;\n"
    "      opacity: .8; transition: opacity .2s;\n"
    "    }\n"
    "    #lb-close:hover { opacity: 1; }\n"
    "    #lb-prev, #lb-next {\n"
    "      position: fixed; top: 50%; transform: translateY(-50%);\n"
    "      background: none; border: none; color: #fff; font-size: 3rem;\n"
    "      cursor: pointer; z-index: 9001; padding: 0 1.25rem;\n"
    "      opacity: .6; transition: opacity .2s; line-height: 1;\n"
    "    }\n"
    "    #lb-prev:hover, #lb-next:hover { opacity: 1; }\n"
    "    #lb-prev { right: .5rem; }\n"
    "    #lb-next { left: .5rem; }\n"
    "\n"
    "    /* ── HERO NEXT-SLOT TEASER ── */\n"
    "    #hero-next-slot {\n"
    "      display: inline-flex; align-items: center; gap: .5rem;\n"
    "      margin-bottom: 2rem;\n"
    "      background: rgba(166,124,142,.12); border: 1px solid rgba(166,124,142,.25);\n"
    "      padding: .5rem 1.25rem; border-radius: 100px;\n"
    "      font-size: .875rem; color: var(--muted);\n"
    "    }\n"
    "    #hero-next-slot[hidden] { display: none; }\n"
    "    #hero-next-slot .slot-dot {\n"
    "      width: .5rem; height: .5rem; border-radius: 50%;\n"
    "      background: #25D366; flex-shrink: 0;\n"
    "    }\n"
    "\n"
    "    /* ── CONTACT LINKS ── */\n"
    "    .contact-link {\n"
    "      display: block; color: rgba(250,245,240,.7); text-decoration: none;\n"
    "      font-size: .9375rem; line-height: 1.7; transition: color .22s;\n"
    "    }\n"
    "    .contact-link:hover { color: var(--champagne); }\n"
    "  </style>",
    'CSS additions'
)

# ── 6. Hero next-slot div
patch(
    '      <div class="btn-group" id="hero-cta">',
    '      <div id="hero-next-slot" hidden>'
    '<span class="slot-dot" aria-hidden="true"></span>'
    '<span id="hero-next-slot-text"></span></div>\n'
    '      <div class="btn-group" id="hero-cta">',
    'hero next-slot div'
)

# ── 7. Contact social column -> contact-links
patch(
    '        <div>\n'
    '          <span class="contact-meta-label">מדיה חברתית</span>\n'
    '          <div id="contact-social" class="social-strip" style="justify-content:center; margin-top:.5rem;"></div>\n'
    '        </div>',
    '        <div>\n'
    '          <span class="contact-meta-label">צרי קשר</span>\n'
    '          <div id="contact-links"></div>\n'
    '        </div>',
    'contact-links'
)

# ── 8. HTML: lightbox + sticky button
patch(
    '</body>\n</html>',
    '<!-- ── LIGHTBOX ── -->\n'
    '<div id="lightbox" role="dialog" aria-modal="true" aria-label="תמונה מוגדלת" hidden>\n'
    '  <button id="lb-close" aria-label="סגור">&#x2715;</button>\n'
    '  <button id="lb-prev" aria-label="תמונה קודמת">&#8250;</button>\n'
    '  <button id="lb-next" aria-label="תמונה הבאה">&#8249;</button>\n'
    '  <div id="lb-body">\n'
    '    <img id="lb-img" src="" alt="" />\n'
    '    <p id="lb-caption"></p>\n'
    '  </div>\n'
    '</div>\n\n'
    '<!-- ── STICKY BOOK BUTTON ── -->\n'
    '<div id="sticky-book">\n'
    '  <a href="./index.html">\n'
    '    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">'
    '<rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>'
    '<line x1="16" y1="2" x2="16" y2="6"/>'
    '<line x1="8" y1="2" x2="8" y2="6"/>'
    '<line x1="3" y1="10" x2="21" y2="10"/></svg>\n'
    '    קביעת תור\n'
    '  </a>\n'
    '</div>\n\n'
    '</body>\n</html>',
    'lightbox + sticky HTML'
)

# ── 9. renderGallery: keyboard accessible
patch(
    "    item.innerHTML =\n"
    "      '<img src=\"' + sanitize(img.src) + '\"' +\n"
    "           ' alt=\"' + sanitize(img.alt) + '\"' +\n"
    "           ' loading=\"lazy\" />' +\n"
    "      '<figcaption class=\"gallery-overlay\">' +\n"
    "        '<span class=\"gallery-caption\">' + sanitize(img.alt) + '</span>' +\n"
    "      '</figcaption>';",
    "    item.style.cursor = 'zoom-in';\n"
    "    item.setAttribute('tabindex', '0');\n"
    "    item.setAttribute('role', 'button');\n"
    "    item.setAttribute('aria-label', 'הגדל תמונה: ' + sanitize(img.alt));\n"
    "    item.innerHTML =\n"
    "      '<img src=\"' + sanitize(img.src) + '\"' +\n"
    "           ' alt=\"' + sanitize(img.alt) + '\"' +\n"
    "           ' loading=\"lazy\" />' +\n"
    "      '<figcaption class=\"gallery-overlay\">' +\n"
    "        '<span class=\"gallery-caption\">' + sanitize(img.alt) + '</span>' +\n"
    "      '</figcaption>';",
    'renderGallery accessible'
)

# ── 10. renderContact: phone + email
patch(
    "  // Address\n"
    "  var addrEl = document.getElementById('meta-address');\n"
    "  if (addrEl) addrEl.textContent = SiteConfig.identity.address;\n"
    "}",
    "  // Phone + Email\n"
    "  var contactLinks = document.getElementById('contact-links');\n"
    "  if (contactLinks) {\n"
    "    var ph = SiteConfig.identity.phone;\n"
    "    var em = SiteConfig.identity.email;\n"
    "    var html = '';\n"
    "    if (ph) html += '<a href=\"tel:+972' + ph.replace(/^0/, '').replace(/-/g, '') + '\" class=\"contact-link\">' + ph + '</a>';\n"
    "    if (em) html += '<a href=\"mailto:' + em + '\" class=\"contact-link\">' + em + '</a>';\n"
    "    contactLinks.innerHTML = html;\n"
    "  }\n"
    "  // Address\n"
    "  var addrEl = document.getElementById('meta-address');\n"
    "  if (addrEl) addrEl.textContent = SiteConfig.identity.address;\n"
    "}",
    'renderContact phone/email'
)

# ── 11. buildSocialIcon: waze mobile deep-link
patch(
    "function buildSocialIcon(name, href) {\n"
    "  if (!href || !SOCIAL_ICONS[name]) return '';\n"
    "  var a = document.createElement('a');\n"
    "  a.className = 'social-icon';\n"
    "  a.href = sanitize(href);",
    "function buildSocialIcon(name, href) {\n"
    "  if (!href || !SOCIAL_ICONS[name]) return '';\n"
    "  var a = document.createElement('a');\n"
    "  a.className = 'social-icon';\n"
    "  if (name === 'waze' && /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)) {\n"
    "    a.href = href.replace('https://waze.com/ul', 'waze://ul');\n"
    "  } else {\n"
    "    a.href = sanitize(href);\n"
    "  }",
    'buildSocialIcon waze'
)

# ── 12. New init functions
patch(
    "// ── Init\n"
    "document.addEventListener('DOMContentLoaded', function() {",
    "// ── Lightbox\n"
    "function initLightbox() {\n"
    "  var lb = document.getElementById('lightbox');\n"
    "  if (!lb) return;\n"
    "  var lbImg = document.getElementById('lb-img');\n"
    "  var lbCap = document.getElementById('lb-caption');\n"
    "  var current = 0;\n"
    "  var items = [];\n"
    "  var itemIdx = 0;\n"
    "\n"
    "  document.querySelectorAll('.gallery-item').forEach(function(el) {\n"
    "    var img = el.querySelector('img');\n"
    "    if (!img) return;\n"
    "    var n = itemIdx++;\n"
    "    items.push({ src: img.src, alt: img.alt });\n"
    "    el.addEventListener('click', function() { openImg(n); });\n"
    "    el.addEventListener('keydown', function(e) {\n"
    "      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openImg(n); }\n"
    "    });\n"
    "  });\n"
    "\n"
    "  function showImg(idx) {\n"
    "    current = (idx + items.length) % items.length;\n"
    "    lbImg.src = items[current].src;\n"
    "    lbImg.alt = items[current].alt;\n"
    "    lbCap.textContent = items[current].alt;\n"
    "  }\n"
    "  function openImg(idx) {\n"
    "    showImg(idx);\n"
    "    lb.removeAttribute('hidden');\n"
    "    document.body.style.overflow = 'hidden';\n"
    "    document.getElementById('lb-close').focus();\n"
    "  }\n"
    "  function closeImg() {\n"
    "    lb.setAttribute('hidden', '');\n"
    "    document.body.style.overflow = '';\n"
    "  }\n"
    "\n"
    "  document.getElementById('lb-close').addEventListener('click', closeImg);\n"
    "  lb.addEventListener('click', function(e) { if (e.target === lb) closeImg(); });\n"
    "  document.getElementById('lb-prev').addEventListener('click', function() { showImg(current - 1); });\n"
    "  document.getElementById('lb-next').addEventListener('click', function() { showImg(current + 1); });\n"
    "  document.addEventListener('keydown', function(e) {\n"
    "    if (lb.hasAttribute('hidden')) return;\n"
    "    if (e.key === 'Escape') closeImg();\n"
    "    if (e.key === 'ArrowRight') showImg(current - 1);\n"
    "    if (e.key === 'ArrowLeft') showImg(current + 1);\n"
    "  });\n"
    "  var tX = 0;\n"
    "  lb.addEventListener('touchstart', function(e) { tX = e.touches[0].clientX; }, { passive: true });\n"
    "  lb.addEventListener('touchend', function(e) {\n"
    "    var dx = e.changedTouches[0].clientX - tX;\n"
    "    if (Math.abs(dx) > 50) { if (dx > 0) showImg(current - 1); else showImg(current + 1); }\n"
    "  });\n"
    "}\n"
    "\n"
    "// ── Sticky book button\n"
    "function initStickyBook() {\n"
    "  var hero = document.querySelector('.hero');\n"
    "  var btn  = document.getElementById('sticky-book');\n"
    "  if (!hero || !btn || !window.IntersectionObserver) return;\n"
    "  new IntersectionObserver(function(entries) {\n"
    "    btn.classList.toggle('visible', !entries[0].isIntersecting);\n"
    "  }, { threshold: 0 }).observe(hero);\n"
    "}\n"
    "\n"
    "// ── Next available slot teaser\n"
    "function initNextSlot() {\n"
    "  var apiBase = SiteConfig.identity && SiteConfig.identity.apiBase;\n"
    "  if (!apiBase) return;\n"
    "  var now = new Date();\n"
    "  var url = apiBase + '?action=getSlots&month=' + now.getFullYear() + '-' + (now.getMonth() + 1);\n"
    "  fetch(url).then(function(r) { return r.json(); }).then(function(data) {\n"
    "    var slots = data && data.slots;\n"
    "    if (!slots) return;\n"
    "    var today = now.toISOString().slice(0, 10);\n"
    "    var days = Object.keys(slots).sort().filter(function(d) { return d >= today; });\n"
    "    for (var i = 0; i < days.length; i++) {\n"
    "      var times = slots[days[i]];\n"
    "      if (!times || !times.length) continue;\n"
    "      var date = new Date(days[i] + 'T12:00:00');\n"
    "      var label = date.toLocaleDateString('he-IL', { weekday: 'short', day: 'numeric', month: 'numeric' });\n"
    "      var el = document.getElementById('hero-next-slot');\n"
    "      var txt = document.getElementById('hero-next-slot-text');\n"
    "      if (el && txt) {\n"
    "        txt.textContent = 'הזמן הפנוי הקרוב: ' + label + ' ב-' + times[0];\n"
    "        el.removeAttribute('hidden');\n"
    "      }\n"
    "      break;\n"
    "    }\n"
    "  }).catch(function() {});\n"
    "}\n"
    "\n"
    "// ── Init\n"
    "document.addEventListener('DOMContentLoaded', function() {",
    'new init functions'
)

# ── 13. Remove renderSocialStrip('contact-social')
patch(
    "  renderSocialStrip('contact-social');\n",
    "",
    'remove contact-social call'
)

# ── 14. Add new DOMContentLoaded calls
patch(
    "  renderContact();\n"
    "  renderFooter();\n"
    "  initMobileMenu();\n"
    "});",
    "  renderContact();\n"
    "  renderFooter();\n"
    "  initMobileMenu();\n"
    "  initLightbox();\n"
    "  initStickyBook();\n"
    "  initNextSlot();\n"
    "});",
    'DOMContentLoaded new calls'
)

# ── Write or report
if errors:
    print('\nERRORS:')
    for e in errors:
        print(' ', e)
    sys.exit(1)
else:
    with open('frontend/landing.html', 'w', encoding='utf-8') as f:
        f.write(content)
    print('\nALL DONE — file written')
