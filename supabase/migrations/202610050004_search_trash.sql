begin;
alter table public.record_drafts add column deleted_at timestamptz;
alter table public.records add column deleted_at timestamptz;
alter policy records_public_or_owner_read on public.records
using ((visibility = 'public' and deleted_at is null) or (select auth.uid()) = owner_id);
alter policy record_drafts_owner_update on public.record_drafts
using ((select auth.uid()) = owner_id and deleted_at is null)
with check ((select auth.uid()) = owner_id and deleted_at is null);
create index records_public_updated_idx on public.records (updated_at desc, id)
where visibility='public' and deleted_at is null;

-- ponytail: 부분 문자열 검색은 순차 검사한다. 검색 지연이 커지면 pg_trgm 인덱스로 전환한다.
create function public.search_records(p_query text, p_type text, p_tags text[], p_owner uuid, p_offset integer)
returns table(id uuid, owner_id uuid, record_type text, title text, excerpt text, tags text[], version integer, created_at timestamptz, updated_at timestamptz)
language plpgsql stable security invoker set search_path = '' as $$
begin
  if p_query is null or char_length(p_query)>100 or p_tags is null or not public.valid_draft_tags(p_tags)
    or (p_type is not null and p_type not in ('project','study','other'))
    or p_offset is null or p_offset not between 0 and 999999 then
    raise exception 'invalid search input' using errcode='22023';
  end if;
  return query select r.id,r.owner_id,r.record_type,r.title,left(r.body,200),r.tags,r.version,r.created_at,r.updated_at
  from public.records r where r.visibility='public' and r.deleted_at is null
    and (p_owner is null or r.owner_id=p_owner) and (p_type is null or r.record_type=p_type) and r.tags @> p_tags
    and (p_query='' or strpos(lower(r.title || ' ' || r.body),lower(p_query))>0
      or exists(select 1 from unnest(r.tags) tag where strpos(lower(tag),lower(p_query))>0))
  order by r.updated_at desc,r.id limit 21 offset p_offset;
end;
$$;
revoke all on function public.search_records(text,text,text[],uuid,integer) from public;
grant execute on function public.search_records(text,text,text[],uuid,integer) to anon,authenticated;

create function public.search_archive(p_query text, p_type text, p_tags text[], p_state text, p_offset integer)
returns table(id uuid, record_type text, title text, excerpt text, tags text[], draft_version integer, record_version integer,
  state text, source_version integer, has_unapplied_changes boolean, created_at timestamptz, updated_at timestamptz, deleted_at timestamptz)
language plpgsql stable security invoker set search_path = '' as $$
begin
  if p_query is null or char_length(p_query)>100 or p_tags is null or not public.valid_draft_tags(p_tags)
    or (p_type is not null and p_type not in ('project','study','other'))
    or p_state is null or p_state not in ('all','draft','public','private','deleted')
    or p_offset is null or p_offset not between 0 and 999999 then
    raise exception 'invalid search input' using errcode='22023';
  end if;
  return query select d.id,d.record_type,d.title,left(d.body,200),d.tags,d.version,coalesce(r.version,0),
    case when d.deleted_at is not null then 'deleted' when r.id is null then 'draft' else r.visibility end,
    r.source_version,(r.id is not null and d.version<>r.source_version),d.created_at,d.updated_at,d.deleted_at
  from public.record_drafts d left join public.records r on r.id=d.id and r.owner_id=d.owner_id
  where d.owner_id=(select auth.uid()) and (p_type is null or d.record_type=p_type) and d.tags @> p_tags
    and ((p_state='deleted' and d.deleted_at is not null) or (d.deleted_at is null and
      (p_state='all' or (p_state='draft' and r.id is null) or p_state=r.visibility)))
    and (p_query='' or strpos(lower(d.title || ' ' || d.body),lower(p_query))>0
      or exists(select 1 from unnest(d.tags) tag where strpos(lower(tag),lower(p_query))>0))
  order by d.updated_at desc,d.id limit 21 offset p_offset;
end;
$$;
revoke all on function public.search_archive(text,text,text[],text,integer) from public,anon;
grant execute on function public.search_archive(text,text,text[],text,integer) to authenticated;

create function public.set_record_deleted(p_draft_id uuid, p_draft_version integer, p_record_version integer, p_deleted boolean)
returns table(id uuid, draft_version integer, record_version integer, deleted boolean)
language plpgsql security definer set search_path = '' as $$
declare draft public.record_drafts; saved public.records; actor uuid;
begin
  actor=auth.uid();
  if actor is null then raise exception 'authentication required' using errcode='42501'; end if;
  if p_deleted is null or p_draft_version is null or p_draft_version<1 or p_record_version is null or p_record_version<0 then
    raise exception 'invalid lifecycle input' using errcode='22023';
  end if;
  select * into draft from public.record_drafts d where d.id=p_draft_id and d.owner_id=actor for update;
  if not found or ((draft.deleted_at is not null)=p_deleted) then raise exception 'draft not found' using errcode='P0002'; end if;
  if draft.version<>p_draft_version then raise exception 'draft conflict' using errcode='P0003'; end if;
  select * into saved from public.records r where r.id=draft.id for update;
  if coalesce(saved.version,0)<>p_record_version then raise exception 'record conflict' using errcode='P0004'; end if;
  update public.record_drafts d set deleted_at=case when p_deleted then now() else null end where d.id=draft.id;
  if saved.id is not null then
    update public.records r set deleted_at=case when p_deleted then now() else null end,
      visibility=case when p_deleted then r.visibility else 'private' end,version=r.version+1,updated_at=now()
    where r.id=draft.id and r.owner_id=actor;
  end if;
  return query select d.id,d.version,coalesce(r.version,0),p_deleted from public.record_drafts d
    left join public.records r on r.id=d.id where d.id=draft.id and d.owner_id=actor;
end;
$$;
revoke all on function public.set_record_deleted(uuid,integer,integer,boolean) from public,anon;
grant execute on function public.set_record_deleted(uuid,integer,integer,boolean) to authenticated;

-- 삭제된 초안은 발행할 수 없다. 기존 발행 함수의 계약과 권한은 유지한다.
create or replace function public.apply_record(p_draft_id uuid, p_draft_version integer, p_record_version integer, p_visibility text)
returns setof public.records language plpgsql security definer set search_path = '' as $$
declare draft public.record_drafts; saved public.records; actor uuid;
begin
  actor = auth.uid();
  if actor is null then raise exception 'authentication required' using errcode = '42501'; end if;
  if p_draft_version is null or p_draft_version < 1 or p_record_version is null or p_record_version < 0
    or p_visibility is null or p_visibility not in ('public','private') then
    raise exception 'invalid publication input' using errcode = '22023';
  end if;
  select * into draft from public.record_drafts where id = p_draft_id and owner_id = actor and deleted_at is null for update;
  if not found then raise exception 'draft not found' using errcode = 'P0002'; end if;
  if draft.version <> p_draft_version then raise exception 'draft version conflict' using errcode = 'P0003'; end if;
  if btrim(draft.title) = '' or not public.record_body_has_content(draft.body) then
    raise exception 'title and body required' using errcode = '22023';
  end if;
  select * into saved from public.records where id = draft.id for update;
  if coalesce(saved.version, 0) <> p_record_version then raise exception 'record version conflict' using errcode = 'P0004'; end if;
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
commit;
