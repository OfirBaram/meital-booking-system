---
name: update-landing-content
description: Update text, images, colors, or social links in the Meital nail-artist landing page (Next.js, nail-artist-landing-page/). Use when asked to change ANY content on the landing page — names, services, gallery images, social URLs, or colors. All content lives in config/site-config.ts; gallery images live in nail-artist-landing-page/public/gallery/.
metadata:
  type: project
---

# update-landing-content skill

## When to trigger
- "Change the WhatsApp number / Instagram link"
- "Add a new image to the gallery"
- "Update the studio address / hours"
- "Change the champagne color"
- "Add / edit a service"
- "Update the Hebrew text in the hero / about / services"

## Key facts
- **Single source of truth**: `nail-artist-landing-page/config/site-config.ts`
- **File edit tool**: Use Python + `skills/utils/ai_tools.py patch` — never Edit/Write tools (U+200F path bug)
- **Dev server**: changes appear instantly via Next.js Fast Refresh when `npm run dev` is running
- **Production build**: `cd nail-artist-landing-page && npm run build && npm run start`

## Validation after edit
```bash
cd nail-artist-landing-page && node scripts/update-content.mjs --check
```

## Editing site-config.ts (patch tool)
```bash
PYTHON=/c/Users/DELL/AppData/Local/Programs/Python/Python312/python.exe
BASE="/c/Users/DELL/Documents/GitHub/‏‏OfirBaram/.git/meital-booking-system"

$PYTHON "$BASE/skills/utils/ai_tools.py" patch \
  "$BASE/nail-artist-landing-page/config/site-config.ts" \
  --old '"old text"' --new '"new text"'
```

## Gallery image workflow
1. Copy image to `nail-artist-landing-page/public/gallery/`
2. Run: `cd nail-artist-landing-page && npm run sync-gallery`
3. Open `config/site-config.ts`, find new entry, replace placeholder alt with Hebrew text
4. Optionally set `span2: true` to make it a tall tile in the masonry grid

## Gallery status check
```bash
cd nail-artist-landing-page && npm run gallery:list
```

## Social link format
```
whatsapp:  "https://wa.me/972XXXXXXXXX"   # 972 + number without leading 0
instagram: "https://instagram.com/handle"
tiktok:    "https://tiktok.com/@handle"
google:    "https://g.page/business-slug"
easy:      "https://easy.co.il/page"
```
Set to `null` to hide the icon entirely.

## Color tokens (globals.css @theme + siteConfig.colors)
| Token | Default | Usage |
|---|---|---|
| `charcoal` | `#2d2b3d` | Primary text, dark buttons, footer bg |
| `champagne` | `#DDC3A5` | Accents, borders, service card hover |
| `muted` | `#8a7f8e` | Secondary text |
| `bg` | `#FAF5F0` | Page background |
| `card` | `#FFFFFF` | Section card surfaces |
| `primary` | `#A67C8E` | Focus ring, brand pink |

## npm scripts cheatsheet
| Command | What it does |
|---|---|
| `npm run dev` | Start dev server on :3000 |
| `npm run build` | Production build |
| `npm run sync-gallery` | Add new images from public/gallery/ to config |
| `npm run gallery:list` | Show which images are/aren't in config |
| `npm run gallery:remove` | Remove config entries for deleted image files |
| `npm run content:check` | Validate config — spot placeholder values |
| `npm run content:guide` | Print full content-update guide |
