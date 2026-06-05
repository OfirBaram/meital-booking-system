import {
  WhatsAppIcon, InstagramIcon, TikTokIcon,
  WazeIcon, EasyIcon,
} from '@/components/icons/SocialIcons'
import type { SocialLinks } from '@/config/site-config'

const ICONS: Record<keyof SocialLinks, React.ComponentType<React.SVGProps<SVGSVGElement>>> = {
  whatsapp:  WhatsAppIcon,
  instagram: InstagramIcon,
  tiktok:    TikTokIcon,
  waze:      WazeIcon,
  easy:      EasyIcon,
}

const LABELS: Record<keyof SocialLinks, string> = {
  whatsapp:  'וואטסאפ',
  instagram: 'אינסטגרם',
  tiktok:    'טיקטוק',
  waze:      'ניווט בוויז',
  easy:      'Easy',
}

interface Props {
  social: SocialLinks
  iconClassName?: string
  linkClassName?: string
}

export function SocialLinks({ social, iconClassName = 'size-[1.125rem]', linkClassName }: Props) {
  return (
    <>
      {(Object.keys(social) as (keyof SocialLinks)[])
        .filter((key) => social[key] !== null)
        .map((key) => {
          const Icon = ICONS[key]
          const href = social[key]!
          return (
            <a
              key={key}
              href={href}
              target={href === '#' ? undefined : '_blank'}
              rel="noopener noreferrer"
              aria-label={LABELS[key]}
              className={linkClassName ?? 'inline-flex size-11 items-center justify-center rounded-full text-muted transition-colors duration-200 hover:bg-champagne/20 hover:text-charcoal'}
            >
              <Icon className={iconClassName} aria-hidden="true" />
            </a>
          )
        })}
    </>
  )
}
