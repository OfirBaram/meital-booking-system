-- ============================================================================
-- First-party analytics. Mixpanel and GA4 both collect from the browser, but
-- neither can be queried without an API key we do not hold, and an ad blocker
-- silently drops both. This table is the copy we own and can always read.
--
-- No PII: session_id is a random per-tab id, never a phone or a name.
-- ============================================================================

create table if not exists public.site_events (
  id          bigserial primary key,
  created_at  timestamptz not null default now(),
  event       text        not null,
  session_id  text        not null,
  page        text,
  referrer    text,
  device      text,
  props       jsonb       not null default '{}'::jsonb
);

comment on table public.site_events is
  'First-party web analytics. Written only by the track Edge Function (service role). No PII.';

create index if not exists site_events_created_idx  on public.site_events (created_at desc);
create index if not exists site_events_event_idx    on public.site_events (event, created_at desc);
create index if not exists site_events_session_idx  on public.site_events (session_id, created_at);

-- RLS on with no policies: anon and authenticated cannot read or write.
-- Only the service role (which bypasses RLS) reaches this table.
alter table public.site_events enable row level security;

-- ── Daily funnel ────────────────────────────────────────────────────────────
-- One row per day. Sessions, not raw hits, because a person reloading twice is
-- still one visit.
create or replace view public.analytics_daily as
select
  (created_at at time zone 'Asia/Jerusalem')::date            as day,
  count(distinct session_id)                                   as sessions,
  count(*) filter (where event = 'page_view')                  as page_views,
  count(distinct session_id) filter (where event = 'chat_opened')       as chat_openers,
  count(*) filter (where event = 'chat_message_sent')          as chat_messages,
  count(distinct session_id) filter (where event = 'chat_message_sent') as chat_talkers,
  count(distinct session_id) filter (where event = 'whatsapp_clicked')  as whatsapp_clickers,
  count(distinct session_id) filter (where event = 'booking_clicked')   as booking_clickers,
  count(distinct session_id) filter (where device = 'mobile')  as mobile_sessions
from public.site_events
group by 1
order by 1 desc;

comment on view public.analytics_daily is
  'Daily funnel: sessions -> chat opened -> chat used -> outbound intent.';

-- ── Conversion rates ────────────────────────────────────────────────────────
create or replace view public.analytics_funnel as
select
  day,
  sessions,
  chat_openers,
  chat_talkers,
  whatsapp_clickers,
  booking_clickers,
  round(100.0 * chat_openers      / nullif(sessions, 0), 1)     as pct_opened_chat,
  round(100.0 * chat_talkers      / nullif(chat_openers, 0), 1) as pct_talked_of_openers,
  round(100.0 * whatsapp_clickers / nullif(sessions, 0), 1)     as pct_reached_whatsapp,
  round(100.0 * booking_clickers  / nullif(sessions, 0), 1)     as pct_reached_booking,
  round(100.0 * mobile_sessions   / nullif(sessions, 0), 1)     as pct_mobile
from public.analytics_daily;

comment on view public.analytics_funnel is
  'analytics_daily with conversion percentages. The one place rates are defined.';

-- ── Traffic sources ─────────────────────────────────────────────────────────
create or replace view public.analytics_sources as
select
  (created_at at time zone 'Asia/Jerusalem')::date as day,
  case
    when referrer is null or referrer = '' or referrer = 'direct' then 'ישיר'
    when referrer ilike '%instagram%'   then 'אינסטגרם'
    when referrer ilike '%facebook%'    then 'פייסבוק'
    when referrer ilike '%tiktok%'      then 'טיקטוק'
    when referrer ilike '%google%'      then 'גוגל'
    when referrer ilike '%whatsapp%'    then 'וואטסאפ'
    when referrer ilike '%meytalnails%' then 'ניווט פנימי'
    else 'אחר'
  end                                              as source,
  count(distinct session_id)                       as sessions
from public.site_events
where event = 'page_view'
group by 1, 2
order by 1 desc, 3 desc;

comment on view public.analytics_sources is
  'Sessions per day by referrer bucket — where visitors actually come from.';

-- A view runs as its owner by default, which would hand anon a read path around
-- the table's RLS. Force invoker semantics and revoke the REST grants outright:
-- these are for the service role and the SQL editor, never for the browser.
alter view public.analytics_daily   set (security_invoker = true);
alter view public.analytics_funnel  set (security_invoker = true);
alter view public.analytics_sources set (security_invoker = true);

revoke all on public.analytics_daily   from anon, authenticated;
revoke all on public.analytics_funnel  from anon, authenticated;
revoke all on public.analytics_sources from anon, authenticated;
revoke all on public.site_events       from anon, authenticated;
