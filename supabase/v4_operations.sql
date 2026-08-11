-- CASE1-15000 V4 operations
-- Run AFTER supabase/schema.sql and supabase/production.sql.
-- Safe to rerun.

create or replace function public.close_project_safe(p_project_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project public.projects;
  v_closed_participations int := 0;
begin
  if not public.is_admin() then raise exception 'admin only'; end if;

  select * into v_project
  from public.projects
  where id = p_project_id
  for update;

  if v_project.id is null then
    raise exception '找不到投資案。';
  end if;

  if v_project.status = 'closed' then
    return jsonb_build_object(
      'project_id', v_project.id,
      'status', v_project.status,
      'closed_participations', 0
    );
  end if;

  update public.participations
  set status = 'closed',
      end_date = coalesce(end_date, current_date)
  where project_id = p_project_id
    and status = 'active';

  get diagnostics v_closed_participations = row_count;

  update public.projects
  set status = 'closed',
      updated_at = now()
  where id = p_project_id
  returning * into v_project;

  perform public.write_audit(
    'close_project',
    'project',
    p_project_id,
    jsonb_build_object('closed_participations', v_closed_participations)
  );

  return jsonb_build_object(
    'project_id', v_project.id,
    'status', v_project.status,
    'closed_participations', v_closed_participations
  );
end;
$$;

grant execute on function public.close_project_safe(uuid) to authenticated;
