// ─────────────────────────────────────────────────────────────────────────────
//  SITE CONFIG  ◄  ערוך קובץ זה בלבד כדי לעדכן תוכן, קישורים וצבעים
// ─────────────────────────────────────────────────────────────────────────────

// ── Types ─────────────────────────────────────────────────────────────────────
export interface SocialLinks {
  whatsapp:  string | null
  instagram: string | null
  tiktok:    string | null
  waze:      string | null
  easy:      string | null
}

export interface NavItem {
  href:  string
  label: string
}

export interface Service {
  id:          string
  num:         string
  title:       string
  duration:    string
  price?:      string   // e.g. "מ-₪160" — shown below duration in service card
  description: string
}

export interface GalleryImage {
  src:   string   // path relative to /public
  alt:   string   // Hebrew description — used for SEO & screen readers
  span2: boolean  // true = spans 2 grid rows (tall portrait tile)
}

// ── Config ────────────────────────────────────────────────────────────────────
export const siteConfig = {

  /* ── IDENTITY ─────────────────────────────────────────────────────────────
     לשינוי שם, כתובת או מספר טלפון — ערוך כאן בלבד                        */
  identity: {
    name:           "מיטל שבע ברעם",
    studio:         "סטודיו מיטל",
    tagline:        "עיצוב ציפורניים בוטיק",
    address:        "11, רמת גן",
    city:           "רמת גן",
    phone:          "",            // "050-1234567"
    whatsappNumber: "972547686865",  // ספרות בלבד, ללא +
  },

  /* ── SEO ──────────────────────────────────────────────────────────────────
     כותרת ותיאור לגוגל ולשיתוף ברשתות חברתיות                              */
  seo: {
    title:       "מיטל שבע ברעם — עיצוב ציפורניים בוטיק | רמת גן",
    description: "סטודיו עיצוב ציפורניים בוטיק ברמת גן. לק ג'ל, עיצוב אמנותי, ג'ל לרגליים וספא — חוויה אישית ויוקרתית. קבעי תור עכשיו. חומרים מקצועיים בלבד.",
    keywords:    "לק ג'ל, ציפורניים, רמת גן, מניקור, פדיקור, בוטיק, מיטל שבע ברעם, סטודיו ציפורניים, נייל ארט, ג'ל לרגליים, עיצוב ציפורניים, אמנות ציפורניים",
    ogImage:     "/gallery/nail-1.png",
    siteUrl:     "https://example.com",  // ← עדכן ל-URL האמיתי לפני העלאה
  },

  /* ── SOCIAL LINKS ─────────────────────────────────────────────────────────
     החלף '#' ב-URL המלא. null = האייקון לא מוצג.                           */
  social: {
    whatsapp:  "https://wa.me/972547686865?text=%D7%A9%D7%9C%D7%95%D7%9D%20%D7%9E%D7%99%D7%98%D7%9C%21%20%D7%90%D7%A0%D7%99%20%D7%9E%D7%A2%D7%95%D7%A0%D7%99%D7%99%D7%A0%D7%AA%20%D7%9C%D7%A7%D7%91%D7%95%D7%A2%20%D7%AA%D7%95%D7%A8%20%F0%9F%92%85",
    instagram: "https://www.instagram.com/meytal.sheva/",
    tiktok:    "https://www.tiktok.com/@meytal.sheva",
    // Waze — link opens navigation. Update q= if address changes.
    waze:      "https://waze.com/ul?q=%D7%A8%D7%9E%D7%AA+%D7%92%D7%9F+11&navigate=yes",
    easy:      null,
  } satisfies SocialLinks,

  /* ── NAV LINKS ────────────────────────────────────────────────────────────
     סדר קישורי הניווט בתפריט                                                */
  navigation: [
    { href: "#about",    label: "אודות"   },
    { href: "#services", label: "שירותים" },
    { href: "#gallery",  label: "גלריה"   },
    { href: "#contact",  label: "צרי קשר" },
  ] satisfies NavItem[],

  /* ── SERVICES ─────────────────────────────────────────────────────────────
     להוסיף שירות: העתק בלוק קיים, שנה num/title/duration/description       */
  services: [
    {
      id:          "gel-hands",
      num:         "01",
      title:       "לק ג'ל לציפורניים",
      duration:    "60 דקות",
      price:       "מ-₪140",
      description: "ציפוי ג'ל מושלם לציפורניים — צבע מלא, פרנץ' או ombre לפי בחירה. עמיד ל-3–4 שבועות.",
    },
    {
      id:          "regular-feet",
      num:         "02",
      title:       "לק רגיל לציפורניים ברגליים",
      duration:    "30 דקות",
      price:       "מ-₪80",
      description: "לק רגיל מקצועי לציפורניים ברגליים — מגוון צבעים רחב. מהיר, נקי ומושלם לכל עונה.",
    },
    {
      id:          "gel-combo",
      num:         "03",
      title:       "לק ג'ל + לק רגיל לרגליים",
      duration:    "90 דקות",
      price:       "מ-₪200",
      description: "חבילת הקומבו המלאה — ג'ל לציפורניים ולק רגיל לרגליים. הכל בביקור אחד.",
    },
    {
      id:          "nail-art",
      num:         "03",
      title:       "עיצוב אמנותי",
      duration:    "לפי הזמנה",
      price:       "מ-₪200",
      description: "עיצוב ציפורניים ייחודי — ציורים, stone art, ombre ועוד. מתאים לאירועים, ימי הולדת ויום-יום.",
    },
    {
      id:          "removal",
      num:         "04",
      title:       "הסרת ג'ל",
      duration:    "30 דקות",
      price:       "מ-₪80",
      description: "הסרה עדינה ומקצועית שמשמרת את הציפורן הטבעית. בלי שבירה, בלי נזק — הדרך הנכונה להסיר.",
    },
  ] satisfies Service[],

  /* ── GALLERY ──────────────────────────────────────────────────────────────
     להחלפת תמונה: שים קובץ ב-/public/gallery/ ועדכן src + alt             */
  gallery: [
    { src: "/gallery/nail-1.png", alt: "עיצוב פרנץ' קלאסי — לק ג'ל לבן",      span2: true  },
    { src: "/gallery/nail-2.png", alt: "לק ג'ל ניוד — מראה טבעי ומינימלי",     span2: false },
    { src: "/gallery/nail-3.png", alt: "עיצוב זהב יוקרתי — אקסנט זהב",          span2: false },
    { src: "/gallery/nail-4.png", alt: "עיצוב שיש — ג'ל marble אלגנטי",         span2: true  },
    { src: "/gallery/nail-5.png", alt: "לק ג'ל אדום קלאסי — מושלם לאירועים",    span2: false },
    { src: "/gallery/nail-6.png", alt: "עיצוב פרחוני אמנותי — ציור על ציפורן",  span2: false },
  ] satisfies GalleryImage[],

  /* ── BUSINESS HOURS ───────────────────────────────────────────────────────*/
  business: {
    hours:      "שלישי — שבת  |  10:00 — 19:00",
    priceRange: "₪₪",
  },

  /* ── LEGAL PAGES ──────────────────────────────────────────────────────────*/
  legal: {
    terms:   "/takanon",
    privacy: "/privacy",
  },

  /* ── COLORS ───────────────────────────────────────────────────────────────
     ערכי CSS custom properties המוזרקים ב-globals.css.
     שנה כאן — כל הקומפוננטים יתעדכנו.                                      */
  colors: {
    bg:        "#FAF5F0",
    card:      "#FFFFFF",
    charcoal:  "#2d2b3d",
    champagne: "#DDC3A5",
    muted:     "#8a7f8e",
    border:    "#e8d5c4",
    primary:   "#A67C8E",
  },

} as const

export type SiteConfig = typeof siteConfig
