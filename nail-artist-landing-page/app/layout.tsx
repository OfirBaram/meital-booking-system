import type { Metadata, Viewport } from 'next'
import { Assistant } from 'next/font/google'
import { siteConfig } from '@/config/site-config'
import './globals.css'

const assistant = Assistant({
  subsets:  ['hebrew', 'latin'],
  weight:   ['300', '400', '600'],
  variable: '--font-assistant',
  display:  'swap',
})

const TITLE    = siteConfig.seo.title
const DESC     = 'סטודיו עיצוב ציפורניים בוטיק ברמת גן. לק ג\'ל, עיצוב אמנותי וג\'ל לרגליים — חוויה אישית ויוקרתית. קבעי תור עכשיו בווטסאפ.'
const SITE_URL = siteConfig.seo.siteUrl
const OG_IMG   = siteConfig.seo.ogImage

export const metadata: Metadata = {
  title:       TITLE,
  description: DESC,
  keywords:    'לק ג\'ל רמת גן, מניקור רמת גן, פדיקור רמת גן, ציפורניים בוטיק, מיטל שבע ברעם, נייל ארט, ג\'ל לרגליים, עיצוב ציפורניים אמנותי, סטודיו ציפורניים רמת גן, stone art ציפורניים',
  authors:     [{ name: siteConfig.identity.name }],
  metadataBase: new URL(SITE_URL),
  alternates: {
    canonical: '/',
    languages: { 'he-IL': '/' },
  },
  openGraph: {
    type:        'website',
    locale:      'he_IL',
    url:         SITE_URL,
    title:       TITLE,
    description: DESC,
    images:      [{ url: OG_IMG, width: 1200, height: 630, alt: 'סטודיו ציפורניים מיטל שבע ברעם — רמת גן' }],
    siteName:    siteConfig.identity.studio,
  },
  twitter: {
    card:        'summary_large_image',
    title:       TITLE,
    description: DESC,
    images:      [OG_IMG],
  },
  robots: { index: true, follow: true, googleBot: { index: true, follow: true } },
  other: {
    'geo.region':    'IL-TA',
    'geo.placename': 'Ramat Gan',
    'geo.position':  '32.0879;34.8001',
    'ICBM':          '32.0879, 34.8001',
  },
}

export const viewport: Viewport = {
  width:        'device-width',
  initialScale: 1,
  themeColor:   '#FAF5F0',
}

const jsonLd = {
  '@context':  'https://schema.org',
  '@graph': [
    {
      '@type':     'NailSalon',
      '@id':       SITE_URL + '/#nailsalon',
      name:         siteConfig.identity.name,
      description:  DESC,
      url:          SITE_URL,
      telephone:    siteConfig.identity.phone || undefined,
      priceRange:   siteConfig.business.priceRange,
      image:        SITE_URL + OG_IMG,
      hasMap:       siteConfig.social.waze ?? undefined,
      address: {
        '@type':         'PostalAddress',
        streetAddress:   siteConfig.identity.address,
        addressLocality: 'רמת גן',
        addressRegion:   'תל אביב',
        addressCountry:  'IL',
        postalCode:      '5251601',
      },
      geo: {
        '@type':     'GeoCoordinates',
        latitude:    32.0879,
        longitude:   34.8001,
      },
      areaServed: ['רמת גן', 'גבעתיים', 'תל אביב', 'פתח תקווה'],
      openingHoursSpecification: [
        { '@type': 'OpeningHoursSpecification', dayOfWeek: ['Tuesday','Wednesday','Thursday','Friday','Saturday'], opens: '10:00', closes: '19:00' },
      ],
      aggregateRating: {
        '@type':       'AggregateRating',
        ratingValue:  '4.9',
        reviewCount:  '127',
        bestRating:   '5',
        worstRating:  '1',
      },
      sameAs: [
        siteConfig.social.instagram,
        siteConfig.social.tiktok,
      ].filter((v): v is string => typeof v === 'string'),
    },
    {
      '@type':    'FAQPage',
      mainEntity: [
        { '@type': 'Question', name: 'כמה זמן מחזיק לק ג\'ל?', acceptedAnswer: { '@type': 'Answer', text: 'לק ג\'ל איכותי מחזיק בין 3 ל-4 שבועות ללא שבירה, עם ברק מושלם.' } },
        { '@type': 'Question', name: 'האם ההסרה פוגעת בציפורן?', acceptedAnswer: { '@type': 'Answer', text: 'הסרה מקצועית נכונה לא פוגעת בציפורן. בסטודיו מיטל מבצעים הסרה עדינה שמשמרת את הציפורן הטבעית.' } },
        { '@type': 'Question', name: 'כמה עולה לק ג\'ל ברמת גן?', acceptedAnswer: { '@type': 'Answer', text: 'מחיר לק ג\'ל בסטודיו מיטל מתחיל ב-₪₪. ניתן לתאם ולברר מחיר מדויק בווטסאפ.' } },
        { '@type': 'Question', name: 'האם צריך לקבוע תור מראש?', acceptedAnswer: { '@type': 'Answer', text: 'כן, הסטודיו עובד בתיאום מראש בלבד. ניתן לקבוע תור בווטסאפ.' } },
        { '@type': 'Question', name: 'איפה הסטודיו ממוקם?', acceptedAnswer: { '@type': 'Answer', text: 'הסטודיו ממוקם ברמת גן, נגיש בנסיעה מתל אביב, גבעתיים ופתח תקווה.' } },
      ],
    },
  ],
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="he" dir="rtl" className={assistant.variable}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body>
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:right-4 focus:z-[9999] focus:rounded focus:bg-charcoal focus:px-4 focus:py-2 focus:text-sm focus:text-white"
        >
          דלג לתוכן הראשי
        </a>
        {children}
      </body>
    </html>
  )
}
