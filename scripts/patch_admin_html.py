"""Patch admin.html: replace tab-diary, add tab-clients, add 5th nav button."""
import sys

path = 'frontend/admin.html'
with open(path, 'r', encoding='utf-8') as f:
    src = f.read()

# ── PATCH 1: Replace tab-diary content ──────────────────────────────────────
OLD_DIARY = """    <!-- ── TAB: DIARY (ניהול יומן + תקשורת) ── -->
    <main id="tab-diary" class="hidden max-w-2xl mx-auto px-4 pt-5">
      <h2 class="text-base font-black text-text-main mb-4">ניהול יומן</h2>

      <!-- Slot Inventory -->
      <div class="bg-white rounded-2xl border border-secondary/30 shadow-sm mb-4 overflow-hidden">
        <div class="px-4 pt-4 pb-2 flex items-center justify-between">
          <div class="text-xs font-bold text-text-muted uppercase tracking-widest">חריצי זמן — 60 יום קדימה</div>
          <button id="js-diary-refresh" data-qa="btn-diary-refresh"
            class="text-xs text-primary hover:text-primary-dk font-semibold transition-colors active:scale-95">רענן</button>
        </div>
        <div id="js-diary-slots" data-qa="slot-inventory" class="px-4 pb-4">
          <div class="text-xs text-text-muted text-center py-4">טוען...</div>
        </div>
      </div>

      <!-- Communication Log -->
      <div class="bg-white rounded-2xl border border-secondary/30 shadow-sm mb-4 overflow-hidden">
        <div class="px-4 pt-4 pb-2 flex items-center justify-between">
          <div class="text-xs font-bold text-text-muted uppercase tracking-widest">יומן תקשורת SMS</div>
          <button id="js-log-refresh" data-qa="btn-log-refresh"
            class="text-xs text-primary hover:text-primary-dk font-semibold transition-colors active:scale-95">רענן</button>
        </div>
        <div id="js-sms-log" data-qa="sms-log" class="px-4 pb-4">
          <div class="text-xs text-text-muted text-center py-4">טוען...</div>
        </div>
      </div>
    </main>"""

NEW_DIARY = """    <!-- ── TAB: DIARY (ניהול יומן + תקשורת) ── -->
    <main id="tab-diary" class="hidden max-w-2xl mx-auto px-4 pt-5">
      <h2 class="text-base font-black text-text-main mb-4">ניהול יומן</h2>

      <!-- Date range picker -->
      <div class="bg-white rounded-2xl border border-secondary/30 shadow-sm mb-4 p-4">
        <div class="text-xs font-bold text-text-muted uppercase tracking-widest mb-3">טווח תצוגה</div>
        <div class="flex gap-2 mb-3">
          <div class="flex-1">
            <label class="block text-xs text-text-muted mb-1">מתאריך</label>
            <input id="js-diary-from" type="date"
              class="w-full border border-secondary/60 rounded-xl px-3 py-2 text-sm text-text-main focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors">
          </div>
          <div class="flex-1">
            <label class="block text-xs text-text-muted mb-1">עד תאריך</label>
            <input id="js-diary-to" type="date"
              class="w-full border border-secondary/60 rounded-xl px-3 py-2 text-sm text-text-main focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors">
          </div>
        </div>
        <button id="js-diary-load"
          class="w-full bg-primary text-white font-bold py-2.5 rounded-xl hover:bg-primary-dk active:scale-[0.98] transition-all disabled:opacity-60 flex items-center justify-center gap-2 min-h-[44px] text-sm">
          טען חריצים
        </button>
      </div>

      <!-- Slot list grouped by date -->
      <div id="js-diary-slots" data-qa="slot-inventory" class="space-y-4 mb-4">
        <div class="text-xs text-text-muted text-center py-8">בחרי טווח תאריכים ולחצי "טען חריצים"</div>
      </div>

      <!-- Add single slot -->
      <div class="bg-white rounded-2xl border border-secondary/30 shadow-sm p-4 mb-4">
        <div class="text-xs font-bold text-text-muted uppercase tracking-widest mb-3">הוספת חריץ בודד</div>
        <div class="flex gap-2 mb-3">
          <div class="flex-1">
            <label class="block text-xs text-text-muted mb-1">תאריך</label>
            <input id="js-add-slot-date" type="date"
              class="w-full border border-secondary/60 rounded-xl px-3 py-2 text-sm text-text-main focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors">
          </div>
          <div class="flex-1">
            <label class="block text-xs text-text-muted mb-1">שעה</label>
            <input id="js-add-slot-time" type="time" step="1800"
              class="w-full border border-secondary/60 rounded-xl px-3 py-2 text-sm text-text-main focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors">
          </div>
        </div>
        <button id="js-add-slot-btn"
          class="w-full bg-primary text-white font-bold py-2.5 rounded-xl hover:bg-primary-dk active:scale-[0.98] transition-all disabled:opacity-60 flex items-center justify-center gap-2 min-h-[44px] text-sm">
          + הוסף חריץ
        </button>
      </div>

      <!-- Communication Log -->
      <div class="bg-white rounded-2xl border border-secondary/30 shadow-sm mb-4 overflow-hidden">
        <div class="px-4 pt-4 pb-2 flex items-center justify-between">
          <div class="text-xs font-bold text-text-muted uppercase tracking-widest">יומן תקשורת SMS</div>
          <button id="js-log-refresh" data-qa="btn-log-refresh"
            class="text-xs text-primary hover:text-primary-dk font-semibold transition-colors active:scale-95">רענן</button>
        </div>
        <div id="js-sms-log" data-qa="sms-log" class="px-4 pb-4">
          <div class="text-xs text-text-muted text-center py-4">טוען...</div>
        </div>
      </div>
    </main>

    <!-- ── TAB: CLIENTS (לקוחות והזמנות) ── -->
    <main id="tab-clients" class="hidden max-w-2xl mx-auto px-4 pt-5">
      <h2 class="text-base font-black text-text-main mb-4">לקוחות</h2>

      <!-- Search -->
      <div class="bg-white rounded-2xl border border-secondary/30 shadow-sm mb-4 p-4">
        <div class="flex gap-2">
          <input id="js-client-search" type="search" placeholder="חפש לפי שם או טלפון..." dir="rtl"
            class="flex-1 border border-secondary/60 rounded-xl px-4 py-2.5 text-sm text-text-main focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors">
          <button id="js-client-search-btn"
            class="bg-primary text-white font-bold px-4 py-2.5 rounded-xl hover:bg-primary-dk active:scale-95 transition-all disabled:opacity-60 text-sm shrink-0 min-h-[44px]">
            חפש
          </button>
        </div>
      </div>

      <!-- Client list panel -->
      <div id="js-clients-list" class="space-y-3">
        <div class="text-xs text-text-muted text-center py-8">
          <span class="spinner w-5 h-5 inline-block"></span>
        </div>
      </div>

      <!-- Client history panel (hidden by default) -->
      <div id="js-client-history" class="hidden">
        <div class="flex items-center gap-3 mb-4">
          <button id="js-back-to-clients"
            class="p-2 rounded-xl text-text-muted hover:text-primary hover:bg-cream active:scale-95 transition-all">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
            </svg>
          </button>
          <div>
            <div id="js-history-name" class="text-base font-black text-text-main"></div>
            <div id="js-history-phone" class="text-xs text-text-muted"></div>
          </div>
        </div>
        <div id="js-history-list" class="space-y-3"></div>
      </div>
    </main>"""

if OLD_DIARY not in src:
    print('ERROR: tab-diary anchor not found')
    sys.exit(1)

src = src.replace(OLD_DIARY, NEW_DIARY, 1)
print('PATCH 1 OK: tab-diary replaced + tab-clients added')

# ── PATCH 2: Add 5th nav button (clients) after the diary nav button ─────────
OLD_NAV = """        <button data-tab="diary" data-qa="nav-tab-diary"
          class="nav-tab flex-1 flex flex-col items-center gap-0.5 py-2.5 text-text-muted transition-all">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"/>
          </svg>
          <span class="text-[10px] font-semibold">יומן</span>
        </button>
      </div>
    </nav>"""

NEW_NAV = """        <button data-tab="diary" data-qa="nav-tab-diary"
          class="nav-tab flex-1 flex flex-col items-center gap-0.5 py-2.5 text-text-muted transition-all">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"/>
          </svg>
          <span class="text-[10px] font-semibold">יומן</span>
        </button>
        <button data-tab="clients" data-qa="nav-tab-clients"
          class="nav-tab flex-1 flex flex-col items-center gap-0.5 py-2.5 text-text-muted transition-all">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/>
          </svg>
          <span class="text-[10px] font-semibold">לקוחות</span>
        </button>
      </div>
    </nav>"""

if OLD_NAV not in src:
    print('ERROR: nav diary button anchor not found')
    sys.exit(1)

src = src.replace(OLD_NAV, NEW_NAV, 1)
print('PATCH 2 OK: 5th nav button added')

with open(path, 'w', encoding='utf-8') as f:
    f.write(src)
print('admin.html written successfully')
