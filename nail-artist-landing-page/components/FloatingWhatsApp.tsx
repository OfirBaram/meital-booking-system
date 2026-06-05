import { siteConfig } from '@/config/site-config'
import { WhatsAppIcon } from '@/components/icons/SocialIcons'

export function FloatingWhatsApp() {
  const href = siteConfig.social.whatsapp
  if (!href) return null

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="פנייה בווטסאפ לתיאום תור"
      className="wa-float fixed bottom-6 left-6 z-50 flex size-14 items-center justify-center rounded-full bg-[#25D366] text-white shadow-lg transition-transform duration-200 hover:scale-110"
    >
      <WhatsAppIcon className="size-7" aria-hidden="true" />
    </a>
  )
}
