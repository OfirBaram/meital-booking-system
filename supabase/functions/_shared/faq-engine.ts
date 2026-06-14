/**
 * faq-engine.ts -- Early-exit FAQ for common studio questions.
 *
 * Called by chat-handler BEFORE the Anthropic API call.
 * Returns a response string (with [WA]/[IG] tokens) or null (proceed to AI).
 * HOW TO ADD A RULE: add a FaqRule entry to FAQ_RULES (first match wins).
 */

const WA = '[WA]'
const IG = '[IG]'

interface FaqRule {
  triggers: RegExp[]
  response: string
}

const FAQ_RULES: FaqRule[] = [
  // Safety / jailbreak attempts
  {
    triggers: [/hack|inject|ignore.{0,20}(instructions?|rules?|system)/i],
    response: 'אני כאן לעזור עם שאלות על הסטודיו של מיטל 💅',
  },

  // Minimum age
  {
    triggers: [
      /גיל.{0,5}מינ|בת\s+כמה/i,
      /minimum age|how old|age limit/i,
    ],
    response: 'הסטודיו מיועד ללקוחות מגיל 16 ומעלה.\nלשאלות נוספות:\n[WA]',
  },

  // Address / location
  {
    triggers: [
      /כתובת|איפה|מיקום|נמצא|להגיע/i,
      /address|location|directions?|where is/i,
    ],
    response: 'הסטודיו נמצא ברחוב רש"י 11, רמת גן 📍\n(נגיש מת"א, גבעתיים ופ"ת)\nלניווט:\n[WA]',
  },

  // Hours
  {
    triggers: [
      /שעות|פתוח|סגור|מתי.{0,20}(פתוח|עובד|אפשר)/i,
      /opening hours?|when (open|closed)/i,
    ],
    response: 'שעות פעילות: ראשון–חמישי 08:00–19:00\nשישי ושבת — סגור 🙏\nלתיאום תור:\n[WA]',
  },

  // Pricing
  {
    triggers: [
      /מחיר|עלות|תעריף|כמה.{0,20}(עולה|זה)/i,
      /price|pricing|cost|how much|rates?/i,
    ],
    response: 'המחירים נקבעים לפי הטיפול ♥\nלבירור מחיר מדויק:\n[WA]',
  },

  // Services
  {
    triggers: [
      /שירות|טיפול|מה.{0,10}(מציע|עושה|יש|אפשר)/i,
      /services?|treatments?|what do you offer/i,
    ],
    response: "מיטל מתמחה בשני שירותים:\n• לק ג'ל קלאסי — 90 דק'\n• לק ג'ל לרגליים — 120 דק'\nלשאלות על הסרה ותוספות:\n[WA]",
  },

  // Gallery / portfolio
  {
    triggers: [
      /גלרי|תמונות|דוגמ|עבודות|לראות/i,
      /gallery|portfolio|photos?|examples?|work/i,
    ],
    response: 'ראי את הגלריה המלאה 💅\n[IG]',
  },

  // Booking / appointment / availability
  {
    triggers: [
      /להזמין|לקבוע|תור|הזמנ|פנוי|זמינות/i,
      /book(ing)?|appointment|schedule|availability/i,
    ],
    response: "אני אשמח לבדוק זמנים פנויים עבורך! 📅\nאיזה שירות מעניין אותך?\n• לק ג'ל קלאסי (90 דק')\n• לק ג'ל לרגליים (120 דק')",
  },
]

const OFF_TOPIC = /\b(politi|health|medicine|doctor|law|legal)\b/i

export function checkFaq(userMessage: string): string | null {
  const msg = userMessage.trim()
  if (!msg) return null
  for (const rule of FAQ_RULES) {
    if (rule.triggers.some(re => re.test(msg))) return rule.response
  }
  if (OFF_TOPIC.test(msg)) return 'אני כאן לעזור עם שאלות על הסטודיו של מיטל בלבד 💅\n[WA]'
  return null
}