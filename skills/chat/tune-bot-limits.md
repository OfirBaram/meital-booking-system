# Skill: tune-bot-limits
> כיוון פרמטרים של הבוט: rate limit, history, LLM turns, circuit breaker

## ריכוז כל הפרמטרים הכוונים

### Rate Limit — WhatsApp (per phone, per worker)
קובץ: `supabase/functions/chat-handler/index.ts`
```typescript
const WA_RL_MAX = 8        // מקסימום הודעות
const WA_RL_WIN = 60_000   // בחלון של N ms (1 דקה)
```
גדל אם לקוחות מתלוננות שהבוט חוסם אותן; הקטן אם יש abuse.

### Rate Limit — Web (per IP, per worker)
```typescript
const RL_MAX = 10       // מקסימום requests
const RL_WIN = 60_000   // חלון 1 דקה
```

### History Max (כמה turns נשמרים בשיחה)
```typescript
export const WA_MAX_HISTORY = 20   // _shared/whatsapp.ts
```
גדל → זיכרון ארוך יותר, אך prompt גדול יותר = עלות גבוהה יותר.

### LLM Agentic Turns (כמה tool calls מותרים ב-1 הודעה)
```typescript
const MAX_TURNS = 3   // _shared/bot-core.ts
```

### Max Reply Tokens
```typescript
const MAX_TOKENS = 600   // _shared/bot-core.ts
```
גדל → תשובות ארוכות יותר. 600 אופטימלי לWhatsApp (לא יותר מ-1600 תווים).

### Circuit Breaker
```typescript
const breaker = createCircuitBreaker(3)   // chat-handler/index.ts
// threshold=3, cooldownMs=120_000 (default)
```
לשנות: `createCircuitBreaker(threshold, cooldownMs)`

### Error Loop Monitor
```typescript
const WA_ERR_THRESHOLD = 5     // כמה errors לפני CRITICAL
const WA_ERR_WINDOW    = 300_000  // 5 דקות
```

### Health Check Cache TTL
```typescript
const HEALTH_TTL = 60_000   // 60 שניות
```

### WA Message Max Length
```typescript
const WA_MAX_LEN = 1000   // chat-handler/index.ts
```

## לאחר שינוי
```bash
bash scripts/deploy-functions.sh
```
