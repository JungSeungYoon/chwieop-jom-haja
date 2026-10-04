begin;
create table public.record_links (
  owner_id uuid not null references public.profiles(id) on delete cascade,
  project_id uuid not null references public.record_drafts(id) on delete cascade,
  study_id uuid not null references public.record_drafts(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(project_id,study_id), check(project_id<>study_id)
);
create index record_links_study_idx on public.record_links(study_id,project_id);
alter table public.record_links enable row level security;
revoke all on public.record_links from anon,authenticated;
grant select on public.record_links to anon,authenticated;
create policy record_links_read on public.record_links for select to anon,authenticated
using (owner_id=(select auth.uid()) or (
  exists(select 1 from public.records p where p.id=project_id and p.owner_id=record_links.owner_id
    and p.record_type='project' and p.visibility='public' and p.deleted_at is null)
  and exists(select 1 from public.records s where s.id=study_id and s.owner_id=record_links.owner_id
    and s.record_type='study' and s.visibility='public' and s.deleted_at is null)
));

create function public.set_record_link(p_project_id uuid,p_study_id uuid,p_linked boolean)
returns table(project_id uuid,study_id uuid,linked boolean)
language plpgsql security definer set search_path='' as $$
declare actor uuid;
begin
  actor=auth.uid();
  if actor is null then raise exception 'authentication required' using errcode='42501'; end if;
  if p_project_id is null or p_study_id is null or p_project_id=p_study_id or p_linked is null then
    raise exception 'invalid link input' using errcode='22023';
  end if;
  if p_linked then
    -- 유형 변경·휴지통 이동과 연결 등록이 엇갈리지 않도록 같은 순서로 잠근다.
    perform 1 from public.record_drafts d where d.id in (p_project_id,p_study_id) order by d.id for update;
    if (select count(*) from public.record_drafts d where d.id in (p_project_id,p_study_id)
      and d.owner_id=actor and d.deleted_at is null)<>2 then
      raise exception 'owned records not found' using errcode='P0002';
    end if;
    if not exists(select 1 from public.record_drafts d where d.id=p_project_id and d.record_type='project')
      or not exists(select 1 from public.record_drafts d where d.id=p_study_id and d.record_type='study') then
      raise exception 'project and study required' using errcode='22023';
    end if;
    insert into public.record_links(owner_id,project_id,study_id) values(actor,p_project_id,p_study_id)
      on conflict on constraint record_links_pkey do nothing;
  else
    delete from public.record_links l where l.owner_id=actor and l.project_id=p_project_id and l.study_id=p_study_id;
  end if;
  return query select p_project_id,p_study_id,p_linked;
end;
$$;
revoke all on function public.set_record_link(uuid,uuid,boolean) from public,anon;
grant execute on function public.set_record_link(uuid,uuid,boolean) to authenticated;

create function public.list_public_related(p_record_id uuid,p_offset integer)
returns table(id uuid,record_type text,title text,excerpt text,tags text[],version integer)
language plpgsql stable security invoker set search_path='' as $$
begin
  if p_offset is null or p_offset not between 0 and 999999 then raise exception 'invalid offset' using errcode='22023'; end if;
  if not exists(select 1 from public.records r where r.id=p_record_id and r.visibility='public' and r.deleted_at is null) then
    raise exception 'record not found' using errcode='P0002';
  end if;
  return query select r.id,r.record_type,r.title,left(r.body,200),r.tags,r.version
  from public.record_links l join public.records p on p.id=l.project_id join public.records s on s.id=l.study_id
  join public.records r on r.id=case when l.project_id=p_record_id then l.study_id else l.project_id end
  where (l.project_id=p_record_id or l.study_id=p_record_id)
    and p.owner_id=l.owner_id and s.owner_id=l.owner_id and p.record_type='project' and s.record_type='study'
    and p.visibility='public' and s.visibility='public' and p.deleted_at is null and s.deleted_at is null
  order by l.created_at desc,r.id limit 21 offset p_offset;
end;
$$;
revoke all on function public.list_public_related(uuid,integer) from public;
grant execute on function public.list_public_related(uuid,integer) to anon,authenticated;

create function public.list_own_related(p_record_id uuid,p_offset integer)
returns table(id uuid,record_type text,title text,excerpt text,tags text[],draft_version integer,record_version integer,state text)
language plpgsql stable security invoker set search_path='' as $$
begin
  if p_offset is null or p_offset not between 0 and 999999 then raise exception 'invalid offset' using errcode='22023'; end if;
  if not exists(select 1 from public.record_drafts d where d.id=p_record_id and d.owner_id=(select auth.uid()) and d.deleted_at is null) then
    raise exception 'draft not found' using errcode='P0002';
  end if;
  return query select d.id,d.record_type,d.title,left(d.body,200),d.tags,d.version,coalesce(r.version,0),coalesce(r.visibility,'draft')
  from public.record_links l join public.record_drafts p on p.id=l.project_id join public.record_drafts s on s.id=l.study_id
  join public.record_drafts d on d.id=case when l.project_id=p_record_id then l.study_id else l.project_id end
  left join public.records r on r.id=d.id
  where l.owner_id=(select auth.uid()) and (l.project_id=p_record_id or l.study_id=p_record_id)
    and p.owner_id=l.owner_id and s.owner_id=l.owner_id and p.record_type='project' and s.record_type='study'
    and p.deleted_at is null and s.deleted_at is null
  order by l.created_at desc,d.id limit 21 offset p_offset;
end;
$$;
revoke all on function public.list_own_related(uuid,integer) from public,anon;
grant execute on function public.list_own_related(uuid,integer) to authenticated;

create function public.remove_changed_type_links()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.record_type<>old.record_type then
    delete from public.record_links where project_id=new.id or study_id=new.id;
  end if;
  return new;
end;
$$;
revoke all on function public.remove_changed_type_links() from public,anon,authenticated;
create trigger drafts_remove_changed_type_links after update of record_type on public.record_drafts
for each row execute function public.remove_changed_type_links();
commit;
