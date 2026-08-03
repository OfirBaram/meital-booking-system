/**
 * faq-engine.ts -- Meital Studio: 50-topic knowledge base.
 * Early-exit FAQ called by chat-handler BEFORE the Anthropic API call.
 * Returns a Hebrew response string (with [WA]/[IG] tokens) or null.
 *
 * HOW TO ADD A RULE
 *   1. Add a FaqRule entry to FAQ_RULES (first match wins).
 *   2. triggers: RegExp[] -- each checked via .test(msg).
 *   3. Redeploy: bash scripts/deploy-functions.sh
 */

interface FaqRule {
  triggers: RegExp[]
  response: string
}

const FAQ_RULES: FaqRule[] = [

  // -- SAFETY / JAILBREAK -------------------------------------------------------
  {
    triggers: [/hack|inject|ignore.{0,20}(instructions?|rules?|system)/i],
    response: "אני כאן לעזור עם שאלות על הסטודיו של מיטל 💅",
  },

  // -- GREETING (pure greeting ONLY — anchored so it never swallows a real request)
  {
    triggers: [/^\s*(היי+|שלום|הי+|אהלן|הללו|בוקר טוב|צהריים טובים|ערב טוב|מה נשמע|מה קורה|מה המצב)[\s!?.,😊🙂💅✨]*$/i],
    response: "היי! 💅 כיף שכתבת 🙂\nאני העוזרת של מיטל — אשמח לעזור לך לקבוע תור או לכל שאלה על הסטודיו. מה תרצי?",
  },

  // -- THANKS / CLOSING ---------------------------------------------------------
  {
    triggers: [/^\s*(תודה( רבה| לך)?|מושלם,? ?תודה|אחלה,? ?תודה|סבבה,? ?תודה|thanks?|thank you)[\s!?.,😊🙂💅✨🙏❤]*$/i],
    response: "בשמחה רבה! 💛 מחכה לראות אותך אצל מיטל ✨",
  },

  // -- GIFT CARDS ---------------------------------------------------------------
  {
    triggers: [/שובר|גיפט\s?קארד|gift\s?card|מתנה|וואוצ.ר|voucher/i],
    response: "איזה רעיון מקסים! 🎁\nלפרטים על שוברי מתנה — כתבי לי כאן ואשמח לסדר 💬",
  },

  // -- STRICT: NO BNIYA / ACRYLIC / EXTENSIONS (must fire before generic services)
  {
    triggers: [
      /בניי?ה|בניי?ת|אקריל|extension|acrylic|טיפס|כושי|nail\s*build/i,
    ],
    response: "מיטל מתמחה בלק ג'ל על ציפורניים טבעיות בלבד 💅\nבנייה ואקריל אינם בתחום השירות.\nאם את מחפשת לק ג'ל מדהים — את במקום הנכון!\n[WA]",
  },

  // == GROUP 1: SERVICES =======================================================

  // Q1 -- What services are offered?
  {
    triggers: [
      /מה\s*(ה)?(שירות|טיפול|מציע|עושה|נותנ)|אילו\s*שירות|מה\s*אפשר/i,
      /what.{0,10}(services?|treatments?|offer|do you do)/i,
    ],
    // No price here on purpose — this engine has no DB access, so a number typed
    // into this string would go stale the moment Meital edits it in the console.
    // Price questions fall through to the model, which gets the live catalogue.
    response: "אני מציעה שני שירותים 💅\nלק ג'ל לציפורניים ידיים — 60 דקות\nעיצוב גבות ושפם בווקס — 15 דקות\nאיזה מהם מעניין אותך? אשמח לפרט על מחיר וזמינות.",
  },

  // Q3 -- Feet / pedicure — NOT offered.
  // regular_feet and gel_combo were deleted from the catalogue on 2026-06-21
  // (migration 20260621000000). This rule used to promise the service; it now
  // declines it, because there is no service_id and no slot that can fulfil it.
  {
    triggers: [
      /לק.{0,5}ג.ל.{0,10}רגלי|פדיקור|ג.ל.{0,5}רגל|gel.{0,10}feet|pedicure/i,
    ],
    response: "כרגע אני מתמקדת בלק ג'ל לידיים ובעיצוב גבות ושפם 💅\nטיפולי רגליים לא בתחום שלי כרגע.\nאם תרצי לק ג'ל לידיים — אשמח לעזור!",
  },

  // Q3b -- Eyebrows / mustache (wax). Added 2026-08-03: brows_wax has been in the
  // catalogue since 2026-06-21 but had NO rule, so "עושה גבות?" fell through to
  // the services rule and was answered with "לק ג'ל" — actively wrong.
  // Price is deliberately absent: eyebrow pricing is arranged personally.
  {
    triggers: [
      /גבות|שפם|ווקס|wax|eyebrow|brows/i,
    ],
    response: "כן! אני עושה עיצוב גבות ושפם בווקס ✨\nתוצאה נקייה ומדויקת, הטיפול לוקח כ-15 דקות.\nלגבי מחיר ותיאום — הכי נוח לדבר איתי ישירות:\n[WA]",
  },

  // Q5 -- Difference between regular polish and gel
  {
    triggers: [
      /הבדל.{0,20}(לק\s*רגיל|ג.ל)|לק\s*רגיל\s*לעומת|מה\s*עדיף/i,
      /diff.{0,15}(regular|normal).{0,10}gel|gel\s*vs/i,
    ],
    response: "לק ג'ל מחזיק 3-4 שבועות ולא מתקלף ✨\nלק רגיל עלול להתקלף תוך ימים בודדים.\nהתוצאה מבריקה ועמידה!\n[WA]",
  },

  // Q6 -- Nail art / special designs
  {
    triggers: [
      /נייל\s*ארט|nail\s*art|עיצוב.{0,15}מיוחד|ציפורניים\s*מעוצב|ציורים\s*על\s*ציפורניים/i,
    ],
    response: "לשאלות על עיצובים מיוחדים — הכי טוב לשוחח ישירות 🎨\n[WA]\nוגם ראי את הגלריה:\n[IG]",
  },

  // Q7 -- French manicure
  {
    triggers: [/פרנץ|french\s*(manicure|tip|nail)/i],
    response: "לשאלות על סגנונות מיוחדים כמו פרנץ' — שוחחי איתי 💅\n[WA]",
  },

  // Q8 -- Natural nails only
  {
    triggers: [/ציפורניים\s*טבעי|natural\s*nails?|only.{0,10}natural/i],
    response: "כן! מיטל עובדת על ציפורניים טבעיות בלבד 💅\nהתוצאה יפה ובריאה.\n[WA]",
  },

  // Q9 -- Dry manicure
  {
    triggers: [/מניקור\s*יבש|dry\s*manicure/i],
    response: "לשאלות על סוגי מניקור ספציפיים — שוחחי איתי:\n[WA]",
  },

  // Q10 -- Hands + feet together
  {
    triggers: [
      /גם\s*(ידיים|יד)\s*(וגם|ו-?)\s*(רגליים|רגל)|ידיים\s*(ו|ועם)\s*רגליים|שניהם/i,
      /both.{0,10}(hands?\s*and\s*feet|mani.{0,5}pedi)/i,
    ],
    response: "אפשרי! ניתן לתאם טיפול משולב 💅🦶\nלבדיקת זמינות ותיאום:\n[WA]",
  },

  // Q14 -- Classic manicure (gel-only studio)
  {
    triggers: [/מניקור\s*קלאסי|מניקור\s*ללא\s*ג.ל|classic\s*manicure|regular\s*manicure/i],
    response: "מיטל מתמחה בלק ג'ל 💅 — לא במניקור קלאסי.\nאם את מחפשת לק עמיד ויפה — את במקום הנכון!\n[WA]",
  },

  // == GROUP 2: PROCESS ========================================================

  // Q11, Q12 -- Arriving with/without existing polish
  {
    triggers: [
      /להגיע\s*(עם|בלי)\s*(לק|צבע|ציפורניים)|ציפורניים\s*נקי|לק\s*(קודם|ישן|קיים)/i,
      /come\s*with\s*(polish|nail|color)/i,
    ],
    response: "עדיף להגיע עם ציפורניים נקיות 💆‍♀️\nאם יש לק קיים — מיטל תסיר אותו (בתוספת עלות קטנה).\nלפרטים:\n[WA]",
  },

  // Q13 -- Gel removal
  {
    triggers: [
      /הסר|להסיר|הורד|להוריד|הסרת\s*(לק|ג.ל|צבע)|removal|remove.{0,10}(gel|polish|nail)/i,
    ],
    response: "כן! מיטל מציעה הסרת לק ג'ל ישן 💅\nלפרטים על עלות ותיאום:\n[WA]",
  },

  // Q15 -- Treatment duration
  {
    triggers: [
      /כמה\s*זמן\s*(אורך|לוקח|נמשך|הטיפול)|משך\s*הטיפול|how\s*long.{0,20}(take|treatment)/i,
    ],
    // Durations are known and fixed, so state them. The old answer said the
    // duration "varies" and promised "ואראה לך זמנים" — a promise the website
    // bot cannot keep, since it has no calendar access.
    response: "לק ג'ל לציפורניים ידיים — כשעה 💅\nעיצוב גבות ושפם — כ-15 דקות ✨\nלתיאום תור:\n[WA]",
  },

  // Q16 -- Shortening / shaping nails
  {
    triggers: [
      /לקצר|לעצב|לחתוך|קיצור\s*(ציפורניים?)|shorten|trim\s*nails?|cut.{0,10}nails?/i,
    ],
    response: "כן! ניתן לעצב ולקצר ✂️\nמיטל תעזור להגיע לצורה הרצויה.\n[WA]",
  },

  // Q17 -- Broken nail
  {
    triggers: [/ציפורן.{0,10}(שבר|נשבר|שבורה)|שבר.{0,10}ציפורן|broken\s*nail/i],
    response: "לא בעיה! מיטל תטפל בזה 💪\nלתיאום:\n[WA]",
  },

  // Q18 -- Does it hurt?
  {
    triggers: [/כואב|כאב|מכאיב|hurt|painful?|does\s*it\s*(hurt|pain)/i],
    response: "ממש לא! הטיפול עדין ונעים לחלוטין 🌸\nמיטל עובדת בעדינות ובמקצועיות.\n[WA]",
  },

  // Q19 -- Electric / drill tools
  {
    triggers: [/מכשור\s*חשמלי|מכונה|פרייזה|electric|machine|drill|e-file/i],
    response: "לשאלות על הציוד המקצועי — שוחחי איתי 💆‍♀️\n[WA]",
  },

  // Q20 -- Very short nails
  {
    triggers: [
      /ציפורניים\s*(מאוד?\s*)?קצרות|ציפורניים\s*קצרצרות|very\s*short\s*nails?/i,
    ],
    response: "בהחלט! מיטל עובדת על כל אורך ציפורן 💅\nאפילו ממש קצרות — התוצאה תהיה יפהפייה.\n[WA]",
  },

  // == GROUP 3: HEALTH & MAINTENANCE ===========================================

  // Q21 -- Does gel damage nails?
  {
    triggers: [
      /מזיק|מזיקה|פוגע|נזק.{0,10}ציפורן|harmful|damage.{0,10}nails?/i,
    ],
    response: "לק ג'ל איכותי שמוסר בצורה נכונה — לא מזיק! 💆‍♀️\nמיטל עובדת עם Gelish, OPI ו-CND בלבד.\n[WA]",
  },

  // Q22 -- How long does gel last?
  {
    triggers: [
      /כמה\s*זמן\s*(מחזיק|עומד|נשאר|זה\s*מחזיק)|how\s*long.{0,10}last/i,
    ],
    response: "לק ג'ל מחזיק בממוצע 3-4 שבועות ✨\nתלוי בטיפוח ובאורח החיים.\n[WA]",
  },

  // Q23 -- Polish chipping
  {
    triggers: [/מתקלף|התקלף|קלוף|לק\s*נפל|chip.{0,5}off|peeling/i],
    response: "אם זה קרה — אשמח לעזור! 💅\nצרי קשר ונמצא פתרון:\n[WA]",
  },

  // Q24 -- Break between treatments
  {
    triggers: [
      /הפסקה\s*(בין\s*טיפולים?|מטיפולים?)|לנוח\s*(מלק|מג.ל|מטיפולים?)/i,
      /break.{0,15}treatment|rest.{0,10}nails?/i,
    ],
    response: "כן, לגמרי אפשרי 💆‍♀️\nמיטל תוכל לייעץ לגבי לוח הזמנים הנכון.\n[WA]",
  },

  // Q25 -- Home maintenance tips
  {
    triggers: [
      /לשמור|שמירה|תחזוקה|בבית|how\s*to\s*(maintain|keep|care)|tips?\s*(for|on)\s*nails?/i,
    ],
    response: "כמה טיפים לשמירה בבית ✨\n• הימנעי מחומרים חריפים ללא כפפות\n• שמן ציפורניים יומי עוזר מאוד\n• אל תשתמשי בציפורניים ככלים\nלשאלות נוספות:\n[WA]",
  },

  // Q26 -- Pregnancy (no medical advice -- redirect to physician)
  {
    triggers: [/הריון|בהריון|הרה|pregnant|pregnancy/i],
    response: "שאלה חשובה! 🌸\nמומלץ להתייעץ עם רופאת הנשים לפני טיפול בהריון.\nלאחר אישור רפואי — אשמח לקבל אותך:\n[WA]",
  },

  // Q27 -- Certification / health ministry
  {
    triggers: [
      /אישור.{0,15}(משרד|בריאות)|רישיון|תעודה\s*(מקצועית|הסמכה)|certified|certificate|license|ministry/i,
    ],
    response: "לשאלות על תעודות ורישוי — שוחחי עם מיטל ישירות 🌸\n[WA]",
  },

  // Q28 -- Product quality / brands
  {
    triggers: [
      /חומרים\s*(איכותי|בטוח)|מוצרים\s*(איכות|מותג)|מותג|gelish|opi|cnd|quality|brands?/i,
    ],
    response: "מיטל עובדת עם מותגים מובילים בלבד ✨\nGelish | OPI | CND — המיטב בשוק!\n[WA]",
  },

  // Q29 -- Do nails breathe under gel?
  {
    triggers: [/נושמ|אוורור|breathe|breathing\s*nail/i],
    response: "שאלה מקצועית מצוינת ❤️\nאשמח לענות בפירוט — שוחחי איתי:\n[WA]",
  },

  // Q30 -- Allergic reaction (redirect to dermatologist)
  {
    triggers: [/אלרגי|רגישות|גירוי|גירוד|allerg|sensitivit|reaction/i],
    response: "במקרה של תגובה אלרגית — פני לרופאת עור בהקדם 🏥\nלאחר מכן, אשמח לדבר ולמצוא פתרון:\n[WA]",
  },

  // == GROUP 4: LOGISTICS ======================================================

  // Q31 -- How to book
  {
    triggers: [
      /איך\s*(קובע|מזמינ|ניתן\s*לקבוע|אפשר\s*לקבוע)|לקבוע\s*תור|להזמין\s*תור|how\s*to\s*book/i,
    ],
    response: "קביעת תור דרך ווטסאפ 📲\n[WA]\nאו דרך מערכת ההזמנות שלי 📅",
  },

  // Q32 -- Address / location
  {
    triggers: [
      /כתובת|איפה|מיקום|נמצא|להגיע|address|location|directions?|where\s*is/i,
    ],
    response: "הסטודיו נמצא ברחוב רש\"י 11, רמת גן 📍\n(נגיש מת\"א, גבעתיים ופ\"ת)\nלניווט ופרטים:\n[WA]",
  },

  // Q33 -- Parking
  {
    triggers: [/חניה|לחנות|parking|park\b/i],
    response: "יש חניה ברחוב ובסביבה הקרובה 🚗\nלפרטים מדויקים:\n[WA]",
  },

  // Q34 -- Opening hours
  {
    triggers: [
      /שעות|פתוח|סגור|מתי.{0,20}(פתוח|עובד|אפשר)|opening\s*hours?|when\s*(open|closed)/i,
    ],
    response: "שעות פעילות: ראשון–חמישי 08:00–19:00 ⏰\nשישי ושבת — סגור 🙏\nלתיאום תור:\n[WA]",
  },

  // Q35 -- Friday / Shabbat / weekend
  {
    triggers: [/שישי|שבת|סוף\s*שבוע|friday|saturday|weekend/i],
    response: "הסטודיו פתוח ראשון–חמישי בלבד 🙏\nשישי ושבת — סגור.\nלקביעת תור:\n[WA]",
  },

  // Q36 -- Same-day / last-minute
  {
    triggers: [
      /מהיום\s*להיום|תור\s*הי?ום|same\s*day|last.{0,5}minute\s*(appointment|booking)/i,
    ],
    response: "לבדיקת זמינות מהירה — שלחי הודעה:\n[WA]",
  },

  // Q37 -- Cancellation policy
  {
    triggers: [/ביטול\s*(תור|הזמנה)|לבטל|cancel|cancellat/i],
    // 48h is the policy the code actually enforces (client-cancel/index.ts and
    // client-reschedule/index.ts). Stating it here stops the bot from deflecting
    // a question it can answer, and keeps it aligned with what the system will do.
    response: "אפשר לבטל או לשנות תור עד 48 שעות לפני המועד 🙏\nאם זה דחוף יותר מזה — כתבי לי ונמצא פתרון:\n[WA]",
  },

  // Q38 -- Late arrival
  {
    triggers: [/מאחרת|עיכוב|איחור|late\s*arri|tardiness?/i],
    response: "נסי להודיע מראש — זה עוזר מאוד 🙏\nלתיאום:\n[WA]",
  },

  // Q39-40 -- Payment methods
  {
    triggers: [
      /תשלום|לשלם|ביט|אשראי|מזומן|אפל\s*פיי|גוגל\s*פיי|payment|credit|cash|bit\b|visa|mastercard/i,
    ],
    // Already public on the landing page FAQ — there was no reason for the bot
    // to be the only surface that refused to say it.
    response: "אפשר לשלם במזומן, בכרטיס אשראי, בביט או בפייבוקס 💳\nלכל שאלה נוספת אני כאן:\n[WA]",
  },

  // == GROUP 5: ABOUT & MISC ===================================================

  // Q41 -- How old is Meital? (friendly deflect)
  {
    triggers: [
      /בת\s*כמה\s*(מיטל|את)|גיל\s*(מיטל|שלך|של\s*מיטל)|how\s*old\s*(is\s*meital|are\s*you)/i,
    ],
    response: "מיטל לא חולקת פרטים אישיים — אבל הניסיון שלה מדבר בעד עצמו! 💅\nראי את העבודות:\n[IG]",
  },

  // Q42 -- Business story
  {
    triggers: [
      /איך\s*(נולד|הקמת|התחלת|קמ)\s*(העסק|הסטודיו|הכל)|סיפור\s*(שלך|של\s*מיטל)|how\s*did.{0,15}start/i,
    ],
    response: "מתוך אהבה אמיתית לאומנות הציפורניים ✨\nראי את הסיפור בתמונות:\n[IG]",
  },

  // Q43 -- Can I bring a friend?
  {
    triggers: [
      /להביא\s*(חברה|חבר|חברות|מישהי?)|עם\s*חברה|can\s*I\s*bring\s*(a\s*)?(friend|someone)/i,
    ],
    response: "כרגע הסטודיו מיועד ללקוחה אחת בכל פעם 💆‍♀️\nלתיאום תורות נפרדים לשתיכן:\n[WA]",
  },

  // Q44 -- Can I bring children?
  {
    triggers: [
      /להביא\s*(ילד|תינוק|ילדים|תינוקות?)|ילד.{0,10}איתי|can\s*I\s*bring\s*(child|kid|baby)/i,
    ],
    response: "הסטודיו הוא מרחב שקט ורגוע 🌸\nלשאלות נוספות — שוחחי איתי:\n[WA]",
  },

  // Q45 -- Job openings / work with Meital
  {
    triggers: [
      /מחפש(ת)?\s*(עובד|עובדות|לעבוד|להצטרף|עבודה)|job|recruitment|hiring|employ/i,
    ],
    response: "לשאלות על השתלבות — שוחחי עם מיטל ישירות 💅\n[WA]",
  },

  // Q46, Q47 -- Gallery / Instagram / portfolio
  {
    triggers: [
      /גלרי|תמונות|דוגמ|עבודות|לראות|אינסטגרם|instagram|portfolio|gallery|photos?/i,
    ],
    response: "ראי את הגלריה המלאה 💅\n[IG]",
  },

  // Q48 -- Courses / training
  {
    triggers: [/קורס|הכשר|לימוד|ללמוד|course|training|learn.{0,10}nail/i],
    response: "לשאלות על הכשרות וקורסים — שוחחי עם מיטל:\n[WA]",
  },

  // Q49 -- Phone number / contact
  {
    triggers: [
      /מספר\s*(טלפון|פלאפון|נייד)|phone\s*number|contact\s*(number|info)|telephone/i,
    ],
    response: "מיטל זמינה בווטסאפ 📲\n[WA]",
  },

  // Q50 -- WhatsApp response time
  {
    triggers: [
      /עונ(ה|ת)\s*(מהר|בזמן|לווטסאפ)|תגוב[הי]\s*מהיר|response\s*time|how\s*fast/i,
    ],
    response: "מיטל עונה בהקדם האפשרי 📲\nשלחי הודעה ותקבלי מענה:\n[WA]",
  },

  // -- PRICING — deliberately NOT handled here ----------------------------------
  // There used to be a catch-all price rule returning "המחירים נקבעים לפי הטיפול".
  // It was removed on 2026-08-03 when prices became real data (services.price_ils).
  // This engine runs BEFORE the model (bot-core.ts) and has no DB access, so any
  // rule matching /מחיר|כמה עולה/ would shadow the live price and permanently
  // re-introduce the deflection. Price questions must fall through to the model,
  // which receives the current catalogue and its prices in the system prompt.
  // Do NOT add a pricing rule here.

  // -- MINIMUM AGE -------------------------------------------------------------
  {
    triggers: [
      /גיל.{0,5}מינ|גיל\s*מינימ|minimum\s*age|age\s*limit|how\s*old\s*(do|can)/i,
    ],
    response: "הסטודיו מיועד ללקוחות מגיל 16 ומעלה 🌸\nלשאלות נוספות:\n[WA]",
  },

  // -- BOOKING / AVAILABILITY (broad catch-all -- must be last) ----------------
  {
    triggers: [
      /להזמין|לקבוע|תור|הזמנ|פנוי|זמינות|book(ing)?|appointment|schedule|availability/i,
    ],
    response: "אשמח לעזור לך לקבוע תור! 📅\nכתבי לי איזה שירות מעניין אותך ומתי נוח לך, ואמצא לך זמן פנוי 💅",
  },
]

const OFF_TOPIC =
  /\b(politi|sport|celebrit|gossip|recipe|weather|news|movie|music|stocks?|crypto)\b/i

export function checkFaq(userMessage: string): string | null {
  const msg = userMessage.trim()
  if (!msg) return null
  for (const rule of FAQ_RULES) {
    if (rule.triggers.some(re => re.test(msg))) return rule.response
  }
  if (OFF_TOPIC.test(msg)) return "אני כאן לעזור עם שאלות על הסטודיו של מיטל בלבד 💅\n[WA]"
  return null
}
