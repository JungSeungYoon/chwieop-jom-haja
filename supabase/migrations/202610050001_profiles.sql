begin;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  handle text not null unique,
  nickname text not null,
  major text not null default '',
  interests text not null default '',
  bio text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_handle_format check (
    handle ~ '^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$'
    and handle not in ('admin','api','auth','login','settings','u','me','explore','bookmarks')
  ),
  constraint profiles_nickname_format check (
    char_length(nickname) between 2 and 30 and nickname = btrim(nickname)
    and nickname !~ '[[:cntrl:]]'
  ),
  constraint profiles_optional_format check (
    char_length(major) <= 50 and char_length(interests) <= 100 and char_length(bio) <= 200
    and major = btrim(major) and interests = btrim(interests) and bio = btrim(bio)
    and major !~ '[[:cntrl:]]' and interests !~ '[[:cntrl:]]' and bio !~ '[[:cntrl:]]'
  )
);

create function public.set_profile_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_updated_at before update on public.profiles
for each row execute function public.set_profile_updated_at();

alter table public.profiles enable row level security;
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to anon, authenticated;
grant insert (id, handle, nickname, major, interests, bio) on public.profiles to authenticated;
grant update (handle, nickname, major, interests, bio) on public.profiles to authenticated;

create policy profiles_public_read on public.profiles
for select to anon, authenticated using (true);

create policy profiles_owner_insert on public.profiles
for insert to authenticated with check ((select auth.uid()) = id);

create policy profiles_owner_update on public.profiles
for update to authenticated using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

commit;
