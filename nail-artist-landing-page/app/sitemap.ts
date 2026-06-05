import { siteConfig } from '@/config/site-config'

export default function sitemap() {
  const base = siteConfig.seo.siteUrl

  return [
    {
      url: base,
      lastModified: new Date(),
      changeFrequency: 'monthly' as const,
      priority: 1,
    },
    {
      url: base + '/takanon',
      lastModified: new Date(),
      changeFrequency: 'yearly' as const,
      priority: 0.3,
    },
    {
      url: base + '/privacy',
      lastModified: new Date(),
      changeFrequency: 'yearly' as const,
      priority: 0.3,
    },
  ]
}
