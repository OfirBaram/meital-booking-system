# Skill: add-bot-tool
> הוסף כלי חדש ל-TOOL_REGISTRY של הבוט

## קובץ מקור
`supabase/functions/_shared/bot-config.ts`

## שלבים

### 1. הגדר את הtool
```typescript
// בתוך bot-config.ts, לפני TOOL_REGISTRY

interface MyToolInput extends Record<string, unknown> {
  param1: string
  param2?: number
}
interface MyToolOutput {
  success: boolean
  data?: string
  error?: string
}

const myTool: BotTool<MyToolInput, MyToolOutput> = {
  definition: {
    name: 'my_tool_name',        // snake_case, unique
    description: 'תיאור מתי ולמה הbot יפעיל את הtool.',
    input_schema: {
      type: 'object' as const,
      properties: {
        param1: { type: 'string', description: 'תיאור.' },
        param2: { type: 'number', description: 'אופציונלי.' },
      },
      required: ['param1'],
    },
  },
  async execute(input, ctx) {
    try {
      // ctx.supabase — Supabase client (anon or service_role)
      // ctx.phone    — verified WA phone (null on web)
      // ctx.channel  — 'web' | 'whatsapp'
      const result = await ctx.supabase.from('table').select('...')
      return { success: true, data: result.data?.[0]?.field }
    } catch (e) {
      console.error('[my_tool_name]', e instanceof Error ? e.message : String(e))
      return { success: false, error: 'exception' }
    }
  },
}
```

### 2. רשום ב-TOOL_REGISTRY
```typescript
export const TOOL_REGISTRY = new Map<string, BotTool>([
  // ... existing tools ...
  ['my_tool_name', myTool],   // <-- add here
])
```

### 3. שקול הגבלת channel
אם הtool דורש WhatsApp phone (verified identity), הוסף לset:
```typescript
export const WHATSAPP_ONLY_TOOLS = new Set<string>([
  // ... existing ...
  'my_tool_name',   // <-- add here if WA-only
])
```

### 4. עדכן system prompt
בתוך `SYSTEM_PROMPT_TEMPLATE`, הוסף הוראה מתי לקרוא לtool.

### 5. כתוב יוניט טסט
ב-`tests/unit/whatsapp-security.test.js` — הוסף section לtool החדש.

### 6. פרוס
```bash
bash scripts/deploy-functions.sh
```

## כללים
- `execute` חייב לעטוף הכל ב-try/catch, להחזיר object (**לעולם לא לזרוק**)
- Supabase: `await supabase.from(...)` — אף פעם `.catch()` (Deno bug)
- לא להחזיר PII ב-error field (phone, name)
- identity תמיד מ-`ctx`, לא מ-`input` (model-provided)
