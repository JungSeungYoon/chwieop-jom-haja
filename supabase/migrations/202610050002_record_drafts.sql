begin;

create function public.valid_draft_details(kind text, value jsonb)
returns boolean language plpgsql immutable set search_path = '' as $$
declare item record; allowed text[];
begin
  if value is null or jsonb_typeof(value) <> 'object' then return false; end if;
  allowed = case kind
    when 'project' then array['intro','goal','role','tools','troubleshooting','result']
    when 'study' then array['topic','resources','learned','practice','questions']
    else array[]::text[] end;
  for item in select * from jsonb_each(value) loop
    if not (item.key = any(allowed)) or jsonb_typeof(item.value) <> 'string'
      or char_length(item.value #>> '{}') > 5000 then return false; end if;
  end loop;
  return true;
end;
$$;

create function public.valid_draft_tags(value text[])
returns boolean language sql immutable set search_path = '' as $$
  select value is not null and cardinality(value) <= 10
    and not exists (select 1 from unnest(value) tag
      where tag is null or char_length(tag) not between 1 and 30
        or tag <> btrim(tag) or tag ~ '[[:cntrl:]]')
$$;

create table public.record_drafts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  record_type text not null check (record_type in ('project','study','other')),
  title text not null default '' check (char_length(title) <= 200 and title = btrim(title) and title !~ '[[:cntrl:]]'),
  body text not null default '' check (char_length(body) <= 100000),
  details jsonb not null default '{}' check (public.valid_draft_details(record_type, details)),
  tags text[] not null default '{}' check (public.valid_draft_tags(tags)),
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index record_drafts_owner_updated_idx on public.record_drafts (owner_id, updated_at desc, id);

create function public.set_draft_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.version = old.version + 1;
  new.updated_at = now();
  return new;
end;
$$;
create trigger record_drafts_updated_at before update on public.record_drafts
for each row execute function public.set_draft_updated_at();

alter table public.record_drafts enable row level security;
revoke all on public.record_drafts from anon, authenticated;
grant select on public.record_drafts to authenticated;
grant insert (owner_id, record_type, title, body, details, tags) on public.record_drafts to authenticated;
grant update (record_type, title, body, details, tags) on public.record_drafts to authenticated;
create policy record_drafts_owner_read on public.record_drafts
for select to authenticated using ((select auth.uid()) = owner_id);
create policy record_drafts_owner_insert on public.record_drafts
for insert to authenticated with check ((select auth.uid()) = owner_id);
create policy record_drafts_owner_update on public.record_drafts
for update to authenticated using ((select auth.uid()) = owner_id)
with check ((select auth.uid()) = owner_id);

commit;
