// ─────────────────────────────────────────────────────────────────────────────
//  SITE CONFIG  ◄  ערוך קובץ זה בלבד כדי לעדכן תוכן, קישורים וצבעים
// ─────────────────────────────────────────────────────────────────────────────

// ── Types ─────────────────────────────────────────────────────────────────────
export interface SocialLinks {
  whatsapp:  string | null
  instagram: string | null
  tiktok:    string | null
  google:    string | null
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
    whatsappNumber: "",            // ספרות בלבד, ללא + — "972501234567"
  },

  /* ── SEO ──────────────────────────────────────────────────────────────────
     כותרת ותיאור לגוגל ולשיתוף ברשתות חברתיות                              */
  seo: {
    title:       "מיטל שבע ברעם — עיצוב ציפורניים בוטיק | רמת גן",
    description: "סטודיו עיצוב ציפורניים בוטיק ברמת גן. לק ג'ל, ג'ל לרגליים וטיפולי ספא. חוויה אישית ואיכות פרימיום.",
    keywords:    "לק ג'ל, ציפורניים, רמת גן, מניקור, פדיקור, בוטיק, מיטל שבע ברעם",
    ogImage:     "/gallery/nail-1.png",
    siteUrl:     "https://example.com",  // ← עדכן ל-URL האמיתי לפני העלאה
  },

  /* ── SOCIAL LINKS ─────────────────────────────────────────────────────────
     החלף '#' ב-URL המלא. null = האייקון לא מוצג.                           */
  social: {
    whatsapp:  "#",   // "https://wa.me/972XXXXXXXXX"
    instagram: "#",   // "https://instagram.com/meital_nails"
    tiktok:    "#",   // "https://tiktok.com/@meital_nails"
    google:    "#",   // "https://g.page/meital-nails"
    easy:      "#",   // "https://easy.co.il/meital"
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
      id:          "gel-classic",
      num:         "01",
      title:       "ג'ל קלאסי",
      duration:    "90 דקות",
      description: "לק ג'ל מקצועי עם הכנת ציפורן, עיצוב ואפייה מושלמת. עמיד ל-3–4 שבועות עם ברק שמתחרה בחדש.",
    },
    {
      id:          "gel-feet",
      num:         "02",
      title:       "ג'ל לרגליים",
      duration:    "120 דקות",
      description: "טיפול פדיקור מלא הכולל הכנת העור, עיצוב ציפורן ולק ג'ל. תוצאה נקייה ועמידה לקיץ ולכל השנה.",
    },
    {
      id:          "nail-art",
      num:         "03",
      title:       "עיצוב אמנותי",
      duration:    "לפי הזמנה",
      description: "עיצוב ציפורניים ייחודי — ציורים, stone art, ombre ועוד. מתאים לאירועים, ימי הולדת ויום-יום.",
    },
    {
      id:          "removal",
      num:         "04",
      title:       "הסרת ג'ל",
      duration:    "30 דקות",
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
