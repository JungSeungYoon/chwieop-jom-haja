begin;

create function public.record_body_has_content(value text)
returns boolean language sql immutable set search_path = '' as $$
  select exists (select 1 from regexp_matches(value, E'```[^\\n]*\\n(.*?)```', 'gs') code where code[1] ~ '[^[:space:]]')
    or exists (select 1 from regexp_matches(value, '\$\$(.*?)\$\$', 'gs') math where math[1] ~ '[^[:space:]]')
    or regexp_replace(
      regexp_replace(regexp_replace(value, E'```[^\\n]*\\n[[:space:]]*```', '', 'g'), '<[^>]*>', '', 'g'),
      '[[:space:]#*_~>`$\[\]()!+-]', '', 'g') <> ''
$$;
revoke all on function public.record_body_has_content(text) from public, anon, authenticated;

create table public.records (
  id uuid primary key references public.record_drafts(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  record_type text not null check (record_type in ('project','study','other')),
  title text not null check (char_length(title) between 1 and 200 and title = btrim(title) and title !~ '[[:cntrl:]]'),
  body text not null check (char_length(body) <= 100000 and public.record_body_has_content(body)),
  details jsonb not null check (public.valid_draft_details(record_type, details)),
  tags text[] not null check (public.valid_draft_tags(tags)),
  visibility text not null check (visibility in ('public','private')),
  source_version integer not null check (source_version > 0),
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index records_owner_updated_idx on public.records (owner_id, updated_at desc, id);
alter table public.records enable row level security;
revoke all on public.records from anon, authenticated;
grant select on public.records to anon, authenticated;
create policy records_public_or_owner_read on public.records
for select to anon, authenticated using (visibility = 'public' or (select auth.uid()) = owner_id);

-- 쓰기는 이 함수만 허용한다. 초안과 발행본을 잠그고 한 트랜잭션에서 검사·복사한다.
create function public.apply_record(p_draft_id uuid, p_draft_version integer, p_record_version integer, p_visibility text)
returns setof public.records language plpgsql security definer set search_path = '' as $$
declare draft public.record_drafts; saved public.records; actor uuid;
begin
  actor = auth.uid();
  if actor is null then raise exception 'authentication required' using errcode = '42501'; end if;
  if p_draft_version is null or p_draft_version < 1 or p_record_version is null or p_record_version < 0
    or p_visibility is null or p_visibility not in ('public','private') then
    raise exception 'invalid publication input' using errcode = '22023';
  end if;
  select * into draft from public.record_drafts where id = p_draft_id and owner_id = actor for update;
  if not found then raise exception 'draft not found' using errcode = 'P0002'; end if;
  if draft.version <> p_draft_version then raise exception 'draft version conflict' using errcode = 'P0003'; end if;
  if btrim(draft.title) = '' or not public.record_body_has_content(draft.body) then
    raise exception 'title and body required' using errcode = '22023';
  end if;
  select * into saved from public.records where id = draft.id for update;
  if coalesce(saved.version, 0) <> p_record_version then
    raise exception 'record version conflict' using errcode = 'P0004';
  end if;
  if saved.id is null then
    insert into public.records(id,owner_id,record_type,title,body,details,tags,visibility,source_version)
    values (draft.id,actor,draft.record_type,draft.title,draft.body,draft.details,draft.tags,p_visibility,draft.version);
  else
    update public.records set record_type=draft.record_type, title=draft.title, body=draft.body,
      details=draft.details, tags=draft.tags, visibility=p_visibility, source_version=draft.version,
      version=version+1, updated_at=now() where id=draft.id and owner_id=actor;
  end if;
  return query select * from public.records where id=draft.id and owner_id=actor;
end;
$$;
revoke all on function public.apply_record(uuid,integer,integer,text) from public, anon;
grant execute on function public.apply_record(uuid,integer,integer,text) to authenticated;

commit;
