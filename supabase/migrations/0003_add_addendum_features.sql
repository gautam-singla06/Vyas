-- =============================================================================
-- Migration 0003: Addendum Features
-- Rate Limits table and chat_logs audit columns
-- =============================================================================

-- 1. Create rate_limits table for Vercel serverless persistence
create table if not exists public.rate_limits (
  id           uuid primary key default gen_random_uuid(),
  ip_or_phone  text not null,
  window_start timestamptz not null,
  hit_count    integer not null default 1,
  created_at   timestamptz not null default now()
);

-- Index for fast lookup by ip_or_phone and window
create unique index if not exists rate_limits_ip_window_uq
  on public.rate_limits(ip_or_phone, window_start);

-- Clean-up index
create index if not exists rate_limits_window_start_idx
  on public.rate_limits(window_start desc);

-- Allow service role to bypass RLS, deny public access entirely since
-- rate limits are strictly internal server infrastructure.
alter table public.rate_limits enable row level security;
-- No policies granted = restricted to postgres/service_role

-- 2. Add columns to chat_logs for ATS / Gemini routing metrics
do $$
begin
  alter table public.chat_logs 
    add column handled_by text check (handled_by in ('ats', 'gemini')),
    add column channel text check (channel in ('web', 'whatsapp', 'sms')),
    add column matched_pattern text,
    add column is_emergency boolean not null default false;
exception when duplicate_column then null; end $$;

-- 3. Default the channel column for old web records
update public.chat_logs 
set channel = 'web' 
where channel is null;
