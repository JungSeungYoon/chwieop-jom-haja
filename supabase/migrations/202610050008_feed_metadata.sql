begin;
-- 공개 기록 최대 한 페이지의 표시 정보만 반환한다. 보관 여부는 현재 회원으로 제한한다.
create function public.feed_metadata(p_ids uuid[])
returns table(id uuid,author jsonb,is_pinned boolean,is_bookmarked boolean,linked_study_count bigint)
language plpgsql stable security definer set search_path='' as $$
begin
  if p_ids is null or cardinality(p_ids)>20 or array_position(p_ids,null) is not null then
    raise exception 'invalid feed ids' using errcode='22023';
  end if;
  return query select r.id,jsonb_build_object('handle',p.handle,'nickname',p.nickname),
    exists(select 1 from public.project_pins pin where pin.record_id=r.id and pin.owner_id=r.owner_id),
    exists(select 1 from public.bookmarks b where b.record_id=r.id and b.owner_id=auth.uid()),
    (select count(*) from public.record_links l join public.records s on s.id=l.study_id
      where l.project_id=r.id and l.owner_id=r.owner_id and s.owner_id=r.owner_id
        and r.record_type='project' and s.record_type='study' and s.visibility='public' and s.deleted_at is null)
  from public.records r join public.profiles p on p.id=r.owner_id
  where r.id=any(p_ids) and r.visibility='public' and r.deleted_at is null;
end;
$$;
revoke all on function public.feed_metadata(uuid[]) from public;
grant execute on function public.feed_metadata(uuid[]) to anon,authenticated;
commit;
