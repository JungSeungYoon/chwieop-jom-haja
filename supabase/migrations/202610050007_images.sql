begin;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('record-images','record-images',false,5242880,array['image/jpeg','image/png','image/webp']);

create table public.images (
  id uuid primary key default gen_random_uuid(),
  draft_id uuid not null references public.record_drafts(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  mime_type text not null check (mime_type in ('image/jpeg','image/png','image/webp')),
  byte_size integer not null check (byte_size between 1 and 5242880),
  ready boolean not null default false,
  attached boolean not null default true,
  created_at timestamptz not null default now()
);
create index images_draft_idx on public.images(draft_id);
create table public.record_images (
  record_id uuid not null references public.records(id) on delete cascade,
  image_id uuid not null references public.images(id),
  primary key(record_id,image_id)
);
create index record_images_image_idx on public.record_images(image_id);
alter table public.images enable row level security;
alter table public.record_images enable row level security;
revoke all on public.images,public.record_images from anon,authenticated;
grant select on public.images,public.record_images to anon,authenticated;
create policy record_images_read on public.record_images for select to anon,authenticated
using (exists(select 1 from public.records r where r.id=record_id and
  (r.owner_id=(select auth.uid()) or (r.visibility='public' and r.deleted_at is null))));
create policy images_read on public.images for select to anon,authenticated
using (owner_id=(select auth.uid()) or (ready and exists(select 1 from public.record_images ri where ri.image_id=id)));

-- 원본은 소유자만 업로드한다. 검증된 WebP는 서버의 service_role만 쓴다.
create policy image_source_insert on storage.objects for insert to authenticated
with check (bucket_id='record-images' and exists(select 1 from public.images i
  join public.record_drafts d on d.id=i.draft_id where i.owner_id=(select auth.uid())
  and not i.ready and i.attached and d.deleted_at is null
  and name=i.owner_id::text||'/'||i.draft_id::text||'/'||i.id::text||'.upload'));
create policy image_object_read on storage.objects for select to anon,authenticated
using (bucket_id='record-images' and exists(select 1 from public.images i where
  (name=i.owner_id::text||'/'||i.draft_id::text||'/'||i.id::text||'.webp' and (i.ready or i.owner_id=(select auth.uid())))
  or (name=i.owner_id::text||'/'||i.draft_id::text||'/'||i.id::text||'.upload' and i.owner_id=(select auth.uid()))));
create policy image_object_delete on storage.objects for delete to authenticated
using (bucket_id='record-images' and exists(select 1 from public.images i where i.owner_id=(select auth.uid())
  and (name=i.owner_id::text||'/'||i.draft_id::text||'/'||i.id::text||'.upload'
  or (name=i.owner_id::text||'/'||i.draft_id::text||'/'||i.id::text||'.webp'
    and not i.attached and not exists(select 1 from public.record_images ri where ri.image_id=i.id)))));

create function public.reserve_image(p_draft_id uuid,p_draft_version integer,p_mime_type text,p_byte_size integer)
returns setof public.images language plpgsql security definer set search_path='' as $$
declare d public.record_drafts; item public.images;
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode='42501'; end if;
  select * into d from public.record_drafts where id=p_draft_id and owner_id=auth.uid() and deleted_at is null for update;
  if not found then raise exception 'draft not found' using errcode='P0002'; end if;
  if p_draft_version is null or p_draft_version<>d.version then raise exception 'draft conflict' using errcode='P0003'; end if;
  if p_mime_type is null or p_mime_type not in ('image/jpeg','image/png','image/webp')
    or p_byte_size is null or p_byte_size not between 1 and 5242880 then raise exception 'invalid file' using errcode='22023'; end if;
  if (select count(*) from public.images where draft_id=d.id and attached)>=10 then
    raise exception 'image limit' using errcode='P0005'; end if;
  insert into public.images(draft_id,owner_id,mime_type,byte_size) values(d.id,d.owner_id,p_mime_type,p_byte_size) returning * into item;
  return next item;
end;
$$;

create function public.complete_image(p_image_id uuid,p_owner_id uuid)
returns table(id uuid,draft_version integer) language plpgsql security definer set search_path='' as $$
declare item public.images; d public.record_drafts;
begin
  select * into item from public.images where images.id=p_image_id and owner_id=p_owner_id;
  if not found then raise exception 'image not found' using errcode='P0002'; end if;
  select * into d from public.record_drafts where record_drafts.id=item.draft_id and owner_id=p_owner_id and deleted_at is null for update;
  if not found then raise exception 'draft not found' using errcode='P0002'; end if;
  select * into item from public.images where images.id=p_image_id for update;
  if not item.attached then raise exception 'image detached' using errcode='P0002'; end if;
  if not exists(select 1 from storage.objects where bucket_id='record-images'
    and name=item.owner_id::text||'/'||item.draft_id::text||'/'||item.id::text||'.webp') then
    raise exception 'object not found' using errcode='P0002'; end if;
  if not item.ready then
    update public.images set ready=true where images.id=item.id;
    update public.record_drafts set updated_at=now() where record_drafts.id=d.id returning version into d.version;
  end if;
  return query select item.id,d.version;
end;
$$;

create function public.detach_image(p_image_id uuid,p_draft_version integer)
returns table(id uuid,draft_version integer,retained boolean) language plpgsql security definer set search_path='' as $$
declare item public.images; d public.record_drafts;
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode='42501'; end if;
  select * into item from public.images where images.id=p_image_id and owner_id=auth.uid();
  if not found then raise exception 'image not found' using errcode='P0002'; end if;
  select * into d from public.record_drafts where record_drafts.id=item.draft_id and owner_id=auth.uid() for update;
  if p_draft_version is null or p_draft_version<>d.version then raise exception 'draft conflict' using errcode='P0003'; end if;
  select * into item from public.images where images.id=p_image_id for update;
  if item.attached then
    update public.images set attached=false where images.id=item.id;
    if item.ready then update public.record_drafts set updated_at=now() where record_drafts.id=d.id returning version into d.version; end if;
  end if;
  return query select item.id,d.version,exists(select 1 from public.record_images ri where ri.image_id=item.id);
end;
$$;

create function public.purge_image(p_image_id uuid)
returns boolean language plpgsql security definer set search_path='' as $$
declare item public.images;
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode='42501'; end if;
  select * into item from public.images where id=p_image_id and owner_id=auth.uid() for update;
  if not found then return true; end if;
  if item.attached or exists(select 1 from public.record_images ri where ri.image_id=item.id)
    or exists(select 1 from storage.objects where bucket_id='record-images' and name in (
      item.owner_id::text||'/'||item.draft_id::text||'/'||item.id::text||'.upload',
      item.owner_id::text||'/'||item.draft_id::text||'/'||item.id::text||'.webp')) then return false; end if;
  delete from public.images where id=item.id;
  return true;
end;
$$;
revoke all on function public.reserve_image(uuid,integer,text,integer),public.detach_image(uuid,integer),public.purge_image(uuid) from public,anon;
grant execute on function public.reserve_image(uuid,integer,text,integer),public.detach_image(uuid,integer),public.purge_image(uuid) to authenticated;
revoke all on function public.complete_image(uuid,uuid) from public,anon,authenticated;
grant execute on function public.complete_image(uuid,uuid) to service_role;

-- 기존 발행 검사를 재사용하고 같은 트랜잭션 안에서 사진 참조도 복사한다.
alter function public.apply_record(uuid,integer,integer,text) rename to apply_record_content;
revoke all on function public.apply_record_content(uuid,integer,integer,text) from public,anon,authenticated;
create function public.apply_record(p_draft_id uuid,p_draft_version integer,p_record_version integer,p_visibility text)
returns setof public.records language plpgsql security definer set search_path='' as $$
declare saved public.records;
begin
  select * into saved from public.apply_record_content(p_draft_id,p_draft_version,p_record_version,p_visibility);
  delete from public.record_images where record_id=saved.id;
  insert into public.record_images(record_id,image_id) select saved.id,i.id from public.images i
    where i.draft_id=saved.id and i.owner_id=saved.owner_id and i.attached and i.ready;
  return next saved;
end;
$$;
revoke all on function public.apply_record(uuid,integer,integer,text) from public,anon;
grant execute on function public.apply_record(uuid,integer,integer,text) to authenticated;
commit;
