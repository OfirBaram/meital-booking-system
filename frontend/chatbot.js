/* chatbot.js — Meital Boutique chat widget v1.0 */
(function () {
  'use strict';

  var PHONE      = '972547686865';
  var WA_URL     = 'https://wa.me/' + PHONE;
  var IS_LANDING = window.location.pathname.indexOf('landing') !== -1;

  /* --- CSS --- */
  var CSS = `
    #cb-widget, #cb-widget * { box-sizing: border-box; font-family: 'Heebo', sans-serif; }
    #cb-widget { position: fixed; bottom: 20px; right: 20px; z-index: 9999; direction: rtl; }
    #cb-toggle {
      width: 56px; height: 56px; border-radius: 50%;
      background: linear-gradient(135deg, #A67C8E, #c9a8b8);
      border: none; cursor: pointer;
      box-shadow: 0 4px 16px rgba(166,124,142,.45);
      font-size: 24px; display: flex; align-items: center; justify-content: center;
      transition: transform .2s, box-shadow .2s; position: relative;
    }
    #cb-toggle:hover { transform: scale(1.08); box-shadow: 0 6px 22px rgba(166,124,142,.55); }
    #cb-toggle:focus-visible { outline: 3px solid #A67C8E; outline-offset: 3px; }
    .cb-pulse {
      position: absolute; top: -2px; right: -2px;
      width: 13px; height: 13px; background: #e05c7a;
      border-radius: 50%; border: 2px solid #fff; animation: cbPulse 2s infinite;
    }
    @keyframes cbPulse {
      0%,100% { transform: scale(1); opacity: 1; }
      50%      { transform: scale(1.4); opacity: .65; }
    }
    #cb-window {
      position: absolute; bottom: 68px; right: 0; width: 320px;
      background: #FAF5F0; border-radius: 16px;
      box-shadow: 0 8px 32px rgba(0,0,0,.16);
      display: flex; flex-direction: column; overflow: hidden; max-height: 500px;
      transform: scale(.88) translateY(16px); opacity: 0;
      transition: transform .25s cubic-bezier(.34,1.56,.64,1), opacity .2s;
      pointer-events: none;
    }
    #cb-window.cb-open { transform: scale(1) translateY(0); opacity: 1; pointer-events: all; }
    #cb-header {
      background: linear-gradient(135deg, #A67C8E, #8a6478);
      color: #fff; padding: 13px 14px;
      display: flex; align-items: center; justify-content: space-between; flex-shrink: 0;
    }
    #cb-header-left { display: flex; align-items: center; gap: 10px; }
    #cb-avatar {
      width: 36px; height: 36px; border-radius: 50%;
      background: rgba(255,255,255,.22);
      overflow: hidden; flex-shrink: 0;
    }
    #cb-name { font-weight: 700; font-size: 15px; line-height: 1.2; }
    #cb-sub  { font-size: 11px; opacity: .85; }
    #cb-close {
      background: none; border: none; color: rgba(255,255,255,.75);
      cursor: pointer; font-size: 19px; padding: 2px 4px; line-height: 1;
      transition: color .15s; border-radius: 50%;
    }
    #cb-close:hover { color: #fff; }
    #cb-messages {
      flex: 1; overflow-y: auto; padding: 12px 10px;
      display: flex; flex-direction: column; gap: 9px; scroll-behavior: smooth;
    }
    .cb-msg { display: flex; flex-direction: column; max-width: 87%; }
    .cb-msg.bot  { align-self: flex-end;   align-items: flex-end; }
    .cb-msg.user { align-self: flex-start; align-items: flex-start; }
    .cb-bubble {
      padding: 9px 13px; border-radius: 15px;
      font-size: 14px; line-height: 1.55; white-space: pre-wrap; word-break: break-word;
    }
    .cb-msg.bot .cb-bubble {
      background: #fff; color: #3d2b36; border-bottom-right-radius: 3px;
      box-shadow: 0 1px 4px rgba(0,0,0,.07);
    }
    .cb-msg.user .cb-bubble { background: #A67C8E; color: #fff; border-bottom-left-radius: 3px; }
    #cb-quick-replies {
      padding: 7px 10px 3px; display: flex;
      flex-wrap: wrap; gap: 5px; justify-content: flex-end; flex-shrink: 0;
    }
    .cb-qr-btn {
      background: #fff; border: 1.5px solid #A67C8E; color: #A67C8E;
      border-radius: 18px; padding: 5px 11px; font-size: 12.5px;
      cursor: pointer; transition: all .15s; font-family: 'Heebo', sans-serif; white-space: nowrap;
    }
    .cb-qr-btn:hover { background: #A67C8E; color: #fff; }
    #cb-input-area {
      display: flex; gap: 7px; padding: 9px 10px;
      border-top: 1px solid #e8ddd4; background: #fff; flex-shrink: 0; align-items: center;
    }
    #cb-input {
      flex: 1; border: 1.5px solid #DDC3A5; border-radius: 20px;
      padding: 7px 13px; font-size: 14px; outline: none;
      font-family: 'Heebo', sans-serif; direction: rtl;
      color: #3d2b36; background: #FAF5F0; transition: border-color .15s; min-width: 0;
    }
    #cb-input:focus { border-color: #A67C8E; }
    #cb-send {
      background: #A67C8E; border: none; color: #fff;
      width: 34px; height: 34px; border-radius: 50%; cursor: pointer; font-size: 15px;
      display: flex; align-items: center; justify-content: center;
      transition: background .15s; flex-shrink: 0;
    }
    #cb-send:hover { background: #8a6478; }
    .cb-typing-wrap { display: flex; gap: 4px; padding: 9px 13px; align-items: center; }
    .cb-dot {
      width: 7px; height: 7px; border-radius: 50%; background: #cbb8c2; animation: cbDot 1.2s infinite;
    }
    .cb-dot:nth-child(2) { animation-delay: .2s; }
    .cb-dot:nth-child(3) { animation-delay: .4s; }
    @keyframes cbDot { 0%,60%,100% { transform: translateY(0); } 30% { transform: translateY(-6px); } }
    @media (max-width: 400px) {
      #cb-window { width: calc(100vw - 24px); right: 0; }
      #cb-widget { right: 12px; bottom: 12px; }
    }
  `;

  /* --- INTENTS --- */
  var INTENTS = [
    { patterns: ['שלום','היי','הי ','בוקר','ערב','צהריים','אהלן','מה שלום','מה נשמ'], id: 'greeting' },
    { patterns: ['שירות','טיפול','מה יש','מציעה',"ג'ל",'לק','ציפורן','מה את עושה','מה את מ'], id: 'services' },
    { patterns: ['מחיר','עלות','עולה','כמה זה','כסף','כמה עולה'], id: 'prices' },
    { patterns: ['כמה זמן','משך','ארוך','לוקח','ממושך'], id: 'duration' },
    { patterns: ['להזמין','לזמן','קביעה','לקבוע','תור','הזמנה'], id: 'booking' },
    { patterns: ['שעות','פתוח','סגור','עובדת','מתי את','מתי פ'], id: 'hours' },
    { patterns: ['כתובת','איפה','מיקום','מגיעים','ניווט','לאן'], id: 'location' },
    { patterns: ['ביטול','לבטל','לשנות','שינוי','להזיז'], id: 'cancel' },
    { patterns: ['פנוי','זמין','יש מקום','יש חריץ'], id: 'avail' },
    { patterns: ['ואטסאפ','whatsapp','טלפון','קשר','להתקשר','לכתוב לך'], id: 'contact' },
    { patterns: ['תודה','תנקיו','יופי','סבבה','מעולה','ברור','הבנתי','תענוג'], id: 'thanks' },
    { patterns: ['כמה זמן מחזיק','מחזיק','לכמה זמן','אחרי הטיפול','תחזוקה','ימים','שבועות'], id: 'care' },
    { patterns: ['להתכונן','מה צריך','מה להביא','מה לדעת','ביקור ראשון','פעם ראשונה','חדשה','לא הייתי'], id: 'prepare' },
    { patterns: ['תשלום','אשראי','מזומן','ביט','פייבוקס','כרטיס','העברה','cash'], id: 'payment' },
    { patterns: ['עיצוב','צבע','גוון','רעיון','מה לבחור','השראה','נייל ארט','פרנץ','אומברה','גלייטר'], id: 'design' },
  ];

  /* --- RESPONSES --- */
  var RESPONSES = {
    greeting: {
      text: 'היי! 😊 ברוכה הבאה לסטודיו שלי.\nאיך אוכל לעזור לך היום?',
      qr: ['אילו שירותים קיימים?', 'מחירים ותשלום 💳', 'איך מזמינים תור?', 'יצירת קשר']
    },
    services: {
      text: 'אני מציעה שלושה שירותים עיקריים:\n\n💅 ג\'ל ידיים — 60 דקות\n🌸 לק רגיל ברגליים — 30 דקות\n✨ ג\'ל ידיים + לק רגליים — 90 דקות',
      qr: ['איך מזמינים?', 'מחירים?', 'חזרה ⬅']
    },
    prices: {
      text: 'לגבי מחירים — הכי טוב ליצור איתי קשר ישירות כדי שאוכל לעדכן אותך 😊',
      qr: ['WhatsApp 💬', 'חזרה ⬅']
    },
    duration: {
      text: 'משכי הטיפולים:\n\n💅 ג\'ל ידיים — 60 דקות\n🌸 לק רגיל ברגליים — 30 דקות\n✨ ג'ל + לק — 90 דקות',
      qr: ['לקביעת תור', 'חזרה ⬅']
    },
    booking: {
      text: 'לקביעת תור לחצי על הכפתור — ממלאים פרטים תוך כ-2 דקות ומקבלים אישור ב-SMS 😊',
      qr: ['לקביעת תור ←', 'חזרה ⬅']
    },
    hours: {
      text: 'לגבי שעות — הכי נוח לשלוח לי הודעה ואתן לך פרטים עדכניים 😊',
      qr: ['WhatsApp 💬', 'חזרה ⬅']
    },
    location: {
      text: 'לפרטי המיקום — הכי נוח ליצור איתי קשר ישירות 😊',
      qr: ['WhatsApp 💬', 'חזרה ⬅']
    },
    contact: {
      text: 'את מוזמנת לשלוח לי הודעה ב-WhatsApp — אחזור אלייך בהקדם! 💌',
      qr: ['WhatsApp 💬']
    },
    cancel: {
      text: 'לביטול או שינוי הזמנה — שלחי לי הודעה ב-WhatsApp ואסדר את זה מיד 😊',
      qr: ['WhatsApp 💬', 'חזרה ⬅']
    },
    avail: {
      text: 'ניתן לראות את כל החריצים הפנויים ישירות בדף ההזמנה 😊',
      qr: ['לקביעת תור ←', 'חזרה ⬅']
    },
    thanks: {
      text: 'בשמחה! מחכה לראות אותך בקרוב 💅',
      qr: ['לקביעת תור', 'שאלה נוספת ⬅']
    },
    care: {
      text: "ג'ל איכותי מחזיק בדרך כלל 3–4 שבועות 💅\nלשמירה על התוצאה:\n• לחות ידיים + קרם קוטיקולות מדי יום\n• להימנע ממגע ממושך עם מיים\n• לא להשתמש בציפורניים ככלי עבודה 😊",
      qr: ['לקביעת תור ←', 'שאלה נוספת ⬅']
    },
    prepare: {
      text: 'אין צורך בהכנה מיוחדת! 😊\nאפשר להגיע כרגיל — לקינה ישנה מורידים בסטודיו.\nמומלץ להגיע עם ציפורניים נקיות ויבשות.',
      qr: ['אילו שירותים קיימים?', 'לקביעת תור ←', 'חזרה ⬅']
    },
    payment: {
      text: 'מקבלים מזומן, כרטיס אשראי, ביט ופייבוקס 💳\nלכל שאלה — שלחי הודעה 😊',
      qr: ['לקביעת תור ←', 'חזרה ⬅']
    },
    design: {
      text: "יש אינסוף אפשרויות! 🎨\nפרנץ', ניוד, אומברה, גלייטר, נייל-ארט ועוד.\nמומלץ לשלוח לי תמונות השראה לפני הביקור — ניצור ביחד משהו שמדויק לך.",
      qr: ['WhatsApp 💬', 'לקביעת תור ←', 'חזרה ⬅']
    },
    fallback: {
      text: 'לא הצלחתי להבין לגמרי... 😊\nהכי נוח לשלוח לי הודעה ואעזור לך ישירות!',
      qr: ['WhatsApp 💬', 'לקביעת תור ←']
    }
  };

  /* --- STATE --- */
  var isOpen    = false;
  var typingEl  = null;
  var dragState = { active: false, wasDragging: false, timer: null, startX: 0, startY: 0, origLeft: 0, origTop: 0 };

  /* --- BUILD DOM --- */
  function buildWidget() {
    var widget = document.createElement('div'); widget.id = 'cb-widget';
    var win = document.createElement('div'); win.id = 'cb-window';
    win.setAttribute('role','dialog'); win.setAttribute('aria-modal','true');
    win.setAttribute('aria-label','צ\'אט עם מיטל');
    var hdr = document.createElement('div'); hdr.id = 'cb-header';
    var hdrl = document.createElement('div'); hdrl.id = 'cb-header-left';
    var av = document.createElement('div'); av.id = 'cb-avatar';
    var avImg = document.createElement('img'); avImg.src = './meital_profile_header.webp'; avImg.alt = 'מיטל'; avImg.style.cssText = 'width:100%;height:100%;object-fit:cover;object-position:center top;';
    av.appendChild(avImg);
    var nw = document.createElement('div');
    var nm = document.createElement('div'); nm.id = 'cb-name'; nm.textContent = 'מיטל';
    var sb = document.createElement('div'); sb.id = 'cb-sub'; sb.textContent = 'לק ג\'ל בוטיק';
    nw.appendChild(nm); nw.appendChild(sb); hdrl.appendChild(av); hdrl.appendChild(nw);
    var closeBtn = document.createElement('button'); closeBtn.id = 'cb-close';
    closeBtn.setAttribute('aria-label','סגור'); closeBtn.textContent = '✕';
    hdr.appendChild(hdrl); hdr.appendChild(closeBtn);
    var msgs = document.createElement('div'); msgs.id = 'cb-messages'; msgs.setAttribute('aria-live','polite');
    var qr = document.createElement('div'); qr.id = 'cb-quick-replies';
    var ia = document.createElement('div'); ia.id = 'cb-input-area';
    var inp = document.createElement('input'); inp.id = 'cb-input'; inp.type = 'text';
    inp.placeholder = 'כתבי הודעה...'; inp.maxLength = 200;
    inp.setAttribute('aria-label','הודעה');
    var snd = document.createElement('button'); snd.id = 'cb-send';
    snd.setAttribute('aria-label','שלחי'); snd.textContent = '←';
    ia.appendChild(inp); ia.appendChild(snd);
    win.appendChild(hdr); win.appendChild(msgs); win.appendChild(qr); win.appendChild(ia);
    var tog = document.createElement('button'); tog.id = 'cb-toggle';
    tog.setAttribute('aria-label','פתחי צ\'אט'); tog.textContent = '💅';
    var pulse = document.createElement('span'); pulse.className = 'cb-pulse';
    tog.appendChild(pulse); widget.appendChild(win); widget.appendChild(tog);
    document.body.appendChild(widget);
    return { closeBtn: closeBtn, inp: inp, snd: snd, tog: tog };
  }

  /* --- INIT --- */
  function init() {
    var style = document.createElement('style'); style.textContent = CSS; document.head.appendChild(style);
    var els = buildWidget();
    var widget = document.getElementById('cb-widget');

    els.tog.addEventListener('click', function() {
      if (dragState.wasDragging) { dragState.wasDragging = false; return; }
      toggleWindow();
    });
    els.closeBtn.addEventListener('click', closeWindow);
    els.snd.addEventListener('click', handleSend);
    els.inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') handleSend(); });

    /* --- DRAG: long-press (500ms) to reposition widget --- */
    els.tog.style.touchAction = 'none';

    els.tog.addEventListener('pointerdown', function(e) {
      dragState.startX = e.clientX;
      dragState.startY = e.clientY;
      dragState.timer  = setTimeout(function() {
        var rect = widget.getBoundingClientRect();
        widget.style.right  = '';
        widget.style.bottom = '';
        widget.style.left   = rect.left + 'px';
        widget.style.top    = rect.top  + 'px';
        dragState.origLeft  = rect.left;
        dragState.origTop   = rect.top;
        dragState.active    = true;
        try { els.tog.setPointerCapture(e.pointerId); } catch (_) {}
        els.tog.style.transform = 'scale(1.12)';
        els.tog.style.boxShadow = '0 8px 28px rgba(166,124,142,.7)';
      }, 500);
    });

    els.tog.addEventListener('pointermove', function(e) {
      if (!dragState.active) {
        if (dragState.timer &&
            (Math.abs(e.clientX - dragState.startX) > 8 ||
             Math.abs(e.clientY - dragState.startY) > 8)) {
          clearTimeout(dragState.timer); dragState.timer = null;
        }
        return;
      }
      var l = Math.max(4, Math.min(window.innerWidth  - 60, dragState.origLeft + (e.clientX - dragState.startX)));
      var t = Math.max(4, Math.min(window.innerHeight - 60, dragState.origTop  + (e.clientY - dragState.startY)));
      widget.style.left = l + 'px';
      widget.style.top  = t + 'px';
    });

    function endDrag() {
      clearTimeout(dragState.timer); dragState.timer = null;
      if (!dragState.active) return;
      dragState.active      = false;
      dragState.wasDragging = true;
      els.tog.style.transform = '';
      els.tog.style.boxShadow = '';
    }
    els.tog.addEventListener('pointerup',     endDrag);
    els.tog.addEventListener('pointercancel', endDrag);
  }

  /* --- WINDOW --- */
  function toggleWindow() { isOpen ? closeWindow() : openWindow(); }
  function openWindow() {
    isOpen = true;
    document.getElementById('cb-window').classList.add('cb-open');
    var pulse = document.querySelector('.cb-pulse'); if (pulse) pulse.remove();
    if (!document.getElementById('cb-messages').firstChild) {
      setTimeout(function () { showResponse('greeting'); }, 300);
    }
    setTimeout(function () { document.getElementById('cb-input').focus(); }, 350);
  }
  function closeWindow() { isOpen = false; document.getElementById('cb-window').classList.remove('cb-open'); }

  /* --- MESSAGES --- */
  function addMessage(text, type) {
    var c = document.getElementById('cb-messages');
    var m = document.createElement('div'); m.className = 'cb-msg ' + type;
    var b = document.createElement('div'); b.className = 'cb-bubble'; b.textContent = text;
    m.appendChild(b); c.appendChild(m); c.scrollTop = c.scrollHeight;
  }
  function showTyping() {
    var c = document.getElementById('cb-messages');
    typingEl = document.createElement('div'); typingEl.className = 'cb-msg bot';
    var bub = document.createElement('div'); bub.className = 'cb-bubble cb-typing-wrap';
    for (var k = 0; k < 3; k++) { var d = document.createElement('div'); d.className = 'cb-dot'; bub.appendChild(d); }
    typingEl.appendChild(bub); c.appendChild(typingEl); c.scrollTop = c.scrollHeight;
  }
  function hideTyping() { if (typingEl) { typingEl.remove(); typingEl = null; } }
  function setQuickReplies(labels) {
    var c = document.getElementById('cb-quick-replies'); c.innerHTML = '';
    for (var i = 0; i < labels.length; i++) {
      (function (label) {
        var b = document.createElement('button'); b.className = 'cb-qr-btn'; b.textContent = label;
        b.addEventListener('click', function () { handleQuickReply(label); }); c.appendChild(b);
      })(labels[i]);
    }
  }
  function showResponse(id) {
    var r = RESPONSES[id] || RESPONSES.fallback; showTyping();
    setTimeout(function () { hideTyping(); addMessage(r.text, 'bot'); setQuickReplies(r.qr || []); }, 650);
  }

  /* --- ACTIONS --- */
  function handleQuickReply(label) {
    if (label === 'WhatsApp 💬') { window.open(WA_URL, '_blank'); return; }
    if (label === 'לקביעת תור ←' ||
        label === 'לקביעת תור') { goToBooking(); return; }
    if (label === 'חזרה ⬅' ||
        label === 'שאלה נוספת ⬅') { showResponse('greeting'); return; }
    if (label === 'מחירים ותשלום 💳') { addMessage(label, 'user'); setQuickReplies([]); showResponse('payment'); return; }
    addMessage(label, 'user'); setQuickReplies([]); showResponse(matchIntent(label));
  }
  function handleSend() {
    var inp = document.getElementById('cb-input'); var text = inp.value.trim(); if (!text) return;
    inp.value = ''; addMessage(text, 'user'); setQuickReplies([]); showResponse(matchIntent(text));
  }
  function goToBooking() {
    if (IS_LANDING) { window.location.href = 'index.html'; }
    else { closeWindow(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
  }

  /* --- INTENT MATCHING --- */
  function matchIntent(text) {
    var t = text.toLowerCase().replace(/[?!.,;]/g, '');
    for (var i = 0; i < INTENTS.length; i++) {
      var pats = INTENTS[i].patterns;
      for (var j = 0; j < pats.length; j++) {
        if (t.indexOf(pats[j].toLowerCase()) !== -1) return INTENTS[i].id;
      }
    }
    return 'fallback';
  }

  /* --- BOOT --- */
  if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', init); }
  else { init(); }
}());
