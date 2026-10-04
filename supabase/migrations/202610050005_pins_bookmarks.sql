begin;
create table public.project_pins (
  owner_id uuid not null references public.profiles(id) on delete cascade,
  record_id uuid not null references public.records(id) on delete cascade,
  sort_order integer not null check (sort_order between 1 and 3),
  primary key(owner_id,record_id), unique(owner_id,sort_order)
);
create table public.bookmarks (
  owner_id uuid not null references public.profiles(id) on delete cascade,
  record_id uuid not null references public.records(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(owner_id,record_id)
);
create index bookmarks_owner_created_idx on public.bookmarks(owner_id,created_at desc,record_id);
alter table public.project_pins enable row level security;
alter table public.bookmarks enable row level security;
revoke all on public.project_pins,public.bookmarks from anon,authenticated;
grant select on public.project_pins to anon,authenticated;
grant select on public.bookmarks to authenticated;
create policy project_pins_public_read on public.project_pins for select to anon,authenticated
using (exists(select 1 from public.records r where r.id=record_id and r.owner_id=project_pins.owner_id
  and r.record_type='project' and r.visibility='public' and r.deleted_at is null));
create policy bookmarks_owner_read on public.bookmarks for select to authenticated
using (owner_id=(select auth.uid()));

create function public.list_pins(p_owner uuid)
returns table(id uuid,owner_id uuid,record_type text,title text,excerpt text,tags text[],version integer,sort_order integer)
language sql stable security invoker set search_path='' as $$
  select r.id,r.owner_id,r.record_type,r.title,left(r.body,200),r.tags,r.version,p.sort_order
  from public.project_pins p join public.records r on r.id=p.record_id
  where p.owner_id=p_owner and r.owner_id=p_owner and r.record_type='project' and r.visibility='public' and r.deleted_at is null
  order by p.sort_order;
$$;
revoke all on function public.list_pins(uuid) from public;
grant execute on function public.list_pins(uuid) to anon,authenticated;

create function public.replace_pins(p_ids uuid[])
returns table(id uuid,owner_id uuid,record_type text,title text,excerpt text,tags text[],version integer,sort_order integer)
language plpgsql security definer set search_path='' as $$
declare actor uuid;
begin
  actor=auth.uid();
  if actor is null then raise exception 'authentication required' using errcode='42501'; end if;
  if p_ids is null or cardinality(p_ids)>3 or array_position(p_ids,null) is not null
    or cardinality(p_ids)<>(select count(distinct x) from unnest(p_ids) x) then
    raise exception 'invalid pins' using errcode='22023';
  end if;
  -- 회원별 교체 요청을 직렬화한다. 레코드 잠금은 비공개 전환과 핀 등록의 경합을 막는다.
  perform 1 from public.profiles p where p.id=actor for update;
  if not found then raise exception 'profile required' using errcode='P0005'; end if;
  perform 1 from public.records r where r.id=any(p_ids) order by r.id for share;
  if (select count(*) from public.records r where r.id=any(p_ids) and r.owner_id=actor
    and r.record_type='project' and r.visibility='public' and r.deleted_at is null)<>cardinality(p_ids) then
    raise exception 'eligible project not found' using errcode='P0002';
  end if;
  delete from public.project_pins where project_pins.owner_id=actor;
  insert into public.project_pins(owner_id,record_id,sort_order)
    select actor,x.id,x.n::integer from unnest(p_ids) with ordinality x(id,n);
  return query select * from public.list_pins(actor);
end;
$$;
revoke all on function public.replace_pins(uuid[]) from public,anon;
grant execute on function public.replace_pins(uuid[]) to authenticated;

create function public.remove_ineligible_pins()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.visibility<>'public' or new.deleted_at is not null or new.record_type<>'project' then
    delete from public.project_pins where record_id=new.id;
  end if;
  return new;
end;
$$;
revoke all on function public.remove_ineligible_pins() from public,anon,authenticated;
create trigger records_remove_pins after update of visibility,deleted_at,record_type on public.records
for each row execute function public.remove_ineligible_pins();

create function public.set_bookmark(p_record_id uuid,p_saved boolean)
returns table(record_id uuid,saved boolean)
language plpgsql security definer set search_path='' as $$
declare actor uuid; target public.records;
begin
  actor=auth.uid();
  if actor is null then raise exception 'authentication required' using errcode='42501'; end if;
  if p_record_id is null or p_saved is null then raise exception 'invalid bookmark' using errcode='22023'; end if;
  if p_saved then
    perform 1 from public.profiles where id=actor;
    if not found then raise exception 'profile required' using errcode='P0005'; end if;
    select * into target from public.records r where r.id=p_record_id and r.visibility='public' and r.deleted_at is null for share;
    if not found then raise exception 'record not found' using errcode='P0002'; end if;
    if target.owner_id=actor then raise exception 'own record' using errcode='22023'; end if;
    insert into public.bookmarks(owner_id,record_id) values(actor,p_record_id) on conflict do nothing;
  else
    delete from public.bookmarks b where b.owner_id=actor and b.record_id=p_record_id;
  end if;
  return query select p_record_id,p_saved;
end;
$$;
revoke all on function public.set_bookmark(uuid,boolean) from public,anon;
grant execute on function public.set_bookmark(uuid,boolean) to authenticated;

create function public.list_bookmarks(p_offset integer)
returns table(id uuid,owner_id uuid,record_type text,title text,excerpt text,tags text[],version integer,saved_at timestamptz)
language plpgsql stable security invoker set search_path='' as $$
begin
  if p_offset is null or p_offset not between 0 and 999999 then raise exception 'invalid offset' using errcode='22023'; end if;
  return query select r.id,r.owner_id,r.record_type,r.title,left(r.body,200),r.tags,r.version,b.created_at
  from public.bookmarks b join public.records r on r.id=b.record_id
  where b.owner_id=(select auth.uid()) and r.owner_id<>b.owner_id and r.visibility='public' and r.deleted_at is null
  order by b.created_at desc,b.record_id limit 21 offset p_offset;
end;
$$;
revoke all on function public.list_bookmarks(integer) from public,anon;
grant execute on function public.list_bookmarks(integer) to authenticated;
commit;
