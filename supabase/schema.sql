create extension if not exists pgcrypto;

create table if not exists public.reserved_anonymous_numbers (
  anonymous_number text primary key,
  claimed_by_profile_id uuid unique,
  claimed_at timestamptz,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  anonymous_number text not null unique references public.reserved_anonymous_numbers(anonymous_number),
  password_hash text not null,
  age integer not null check (age >= 10 and age <= 120),
  device_info text,
  last_seen_ip text,
  accepted_policies_at timestamptz not null,
  accepted_privacy_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  author_anonymous_number text not null references public.profiles(anonymous_number),
  parent_post_id uuid references public.posts(id) on delete cascade,
  content text not null check (char_length(content) between 2 and 280),
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  anonymous_number text not null references public.profiles(anonymous_number),
  content text not null check (char_length(content) between 2 and 280),
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.post_likes (
  post_id uuid not null references public.posts(id) on delete cascade,
  anonymous_number text not null references public.profiles(anonymous_number),
  created_at timestamptz not null default now(),
  primary key (post_id, anonymous_number)
);

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_anonymous_number text not null references public.profiles(anonymous_number),
  target_post_id uuid references public.posts(id) on delete cascade,
  target_comment_id uuid references public.comments(id) on delete cascade,
  reason text not null,
  details text,
  status text not null default 'pending_review',
  review_after timestamptz,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create or replace view public.posts_feed as
select
  posts.id,
  posts.author_anonymous_number,
  posts.parent_post_id,
  posts.content,
  posts.created_at,
  coalesce(likes.likes_count, 0) as likes_count,
  coalesce(comments.comments_count, 0) as comments_count
from public.posts
left join (
  select post_id, count(*)::int as likes_count
  from public.post_likes
  group by post_id
) likes on likes.post_id = posts.id
left join (
  select post_id, count(*)::int as comments_count
  from public.comments
  where deleted_at is null
  group by post_id
) comments on comments.post_id = posts.id
where posts.deleted_at is null;

insert into public.reserved_anonymous_numbers (anonymous_number, notes)
values
  ('ANONYM-0', 'admin ocupado'),
  ('ANONYM-1', 'ejemplo'),
  ('ANONYM-2', 'ejemplo'),
  ('ANONYM-3', 'ejemplo')
on conflict (anonymous_number) do nothing;