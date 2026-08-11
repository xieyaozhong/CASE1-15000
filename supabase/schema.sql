-- 週結算中心 / Supabase schema
-- 在 Supabase SQL Editor 執行本檔，再依 README 將第一個帳號升級為 admin。

create extension if not exists pgcrypto;

create table if not exists public.app_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'investor' check (role in ('admin','investor')),
  created_at timestamptz not null default now()
);

create table if not exists public.investors (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users(id) on delete set null,
  code text not null unique,
  display_name text not null,
  email text unique,
  opening_paid_amount numeric(16,4) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  source text,
  case_amount numeric(16,4) not null default 0,
  start_date date,
  status text not null default 'active' check (status in ('active','closed')),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.participations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  investor_id uuid not null references public.investors(id) on delete cascade,
  amount numeric(16,4) not null check (amount > 0),
  start_date date not null default current_date,
  end_date date,
  status text not null default 'active' check (status in ('active','closed')),
  created_at timestamptz not null default now()
);

create table if not exists public.settlement_batches (
  id uuid primary key default gen_random_uuid(),
  week_start date not null,
  week_end date not null,
  status text not null default 'draft' check (status in ('draft','confirmed','paid')),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique(week_start, week_end),
  check (week_end >= week_start)
);

create table if not exists public.project_settlements (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.settlement_batches(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  gross_profit numeric(16,4) not null default 0,
  fee_amount numeric(16,4) not null default 0,
  distributable_profit numeric(16,4) generated always as (gross_profit - fee_amount) stored,
  created_at timestamptz not null default now(),
  unique(batch_id, project_id)
);

create table if not exists public.weekly_settlements (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.settlement_batches(id) on delete cascade,
  project_settlement_id uuid references public.project_settlements(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  investor_id uuid not null references public.investors(id) on delete cascade,
  participation_id uuid references public.participations(id) on delete set null,
  invested_amount numeric(16,4) not null default 0,
  profit_amount numeric(16,4) not null default 0,
  payout_status text not null default 'pending' check (payout_status in ('pending','paid')),
  paid_at timestamptz,
  note text,
  created_at timestamptz not null default now(),
  unique(batch_id, project_id, investor_id)
);

create index if not exists idx_investors_user_id on public.investors(user_id);
create index if not exists idx_participations_investor on public.participations(investor_id);
create index if not exists idx_participations_project on public.participations(project_id);
create index if not exists idx_weekly_investor on public.weekly_settlements(investor_id);
create index if not exists idx_weekly_project on public.weekly_settlements(project_id);
create index if not exists idx_weekly_batch on public.weekly_settlements(batch_id);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.app_users(user_id, role) values (new.id, 'investor') on conflict (user_id) do nothing;
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.app_users where user_id = (select auth.uid()) and role = 'admin');
$$;

create or replace function public.can_view_project(p_project_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin() or exists(
    select 1 from public.participations p
    join public.investors i on i.id=p.investor_id
    where p.project_id=p_project_id and i.user_id=(select auth.uid())
  );
$$;

create or replace function public.claim_my_investor()
returns void language plpgsql security definer set search_path = public as $$
declare v_email text := lower(coalesce((select auth.jwt()->>'email'),''));
begin
  if (select auth.uid()) is null or v_email = '' then return; end if;
  update public.investors set user_id=(select auth.uid()), updated_at=now()
  where user_id is null and email is not null and lower(email)=v_email;
end; $$;

create or replace function public.allocate_project_week(
  p_week_start date, p_week_end date, p_project_id uuid, p_gross_profit numeric, p_fee_amount numeric default 0
)
returns setof public.weekly_settlements
language plpgsql security definer set search_path = public as $$
declare v_batch uuid; v_ps uuid; v_total numeric; v_net numeric;
begin
  if not public.is_admin() then raise exception 'admin only'; end if;
  if p_week_end < p_week_start then raise exception 'invalid week range'; end if;
  v_net := p_gross_profit - coalesce(p_fee_amount,0);
  if v_net < 0 then raise exception 'fee exceeds gross profit'; end if;

  insert into public.settlement_batches(week_start,week_end,status,created_by)
  values(p_week_start,p_week_end,'draft',(select auth.uid()))
  on conflict(week_start,week_end) do update set week_end=excluded.week_end
  returning id into v_batch;

  insert into public.project_settlements(batch_id,project_id,gross_profit,fee_amount)
  values(v_batch,p_project_id,p_gross_profit,coalesce(p_fee_amount,0))
  on conflict(batch_id,project_id) do update set gross_profit=excluded.gross_profit,fee_amount=excluded.fee_amount
  returning id into v_ps;

  select coalesce(sum(amount),0) into v_total from public.participations
  where project_id=p_project_id and status='active' and start_date<=p_week_end and (end_date is null or end_date>=p_week_start);
  if v_total <= 0 then raise exception 'no active participation'; end if;

  delete from public.weekly_settlements where batch_id=v_batch and project_id=p_project_id;
  insert into public.weekly_settlements(batch_id,project_settlement_id,project_id,investor_id,participation_id,invested_amount,profit_amount,payout_status)
  select v_batch,v_ps,p_project_id,p.investor_id,p.id,p.amount,round(v_net*p.amount/v_total,4),'pending'
  from public.participations p
  where p.project_id=p_project_id and p.status='active' and p.start_date<=p_week_end and (p.end_date is null or p.end_date>=p_week_start);

  return query select * from public.weekly_settlements where batch_id=v_batch and project_id=p_project_id order by created_at;
end; $$;

create or replace function public.import_legacy_payload(p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare inv jsonb; proj jsonb; alloc jsonb; v_inv uuid; v_proj uuid; v_code text; c_proj int:=0; c_inv int:=0; c_part int:=0;
begin
  if not public.is_admin() then raise exception 'admin only'; end if;
  for inv in select * from jsonb_array_elements(coalesce(p_payload->'investors','[]'::jsonb)) loop
    v_code := 'LEG-' || upper(substr(encode(digest(inv->>'display_name','sha256'),'hex'),1,16));
    insert into public.investors(code,display_name,opening_paid_amount)
      values(v_code,inv->>'display_name',coalesce((inv->>'opening_paid_amount')::numeric,0))
      on conflict(code) do update set display_name=excluded.display_name, opening_paid_amount=excluded.opening_paid_amount, updated_at=now()
      returning id into v_inv;
    c_inv:=c_inv+1;
  end loop;

  for proj in select * from jsonb_array_elements(coalesce(p_payload->'projects','[]'::jsonb)) loop
    v_code := 'LEGACY-' || upper(substr(encode(digest(coalesce(proj->>'name','')||coalesce(proj->>'start_date','')||gen_random_uuid()::text,'sha256'),'hex'),1,12));
    insert into public.projects(code,name,source,case_amount,start_date,status,note)
      values(v_code,proj->>'name',proj->>'source',coalesce((proj->>'case_amount')::numeric,0),nullif(proj->>'start_date','')::date,'active',proj->>'note')
      returning id into v_proj;
    c_proj:=c_proj+1;
    for alloc in select * from jsonb_array_elements(coalesce(proj->'allocations','[]'::jsonb)) loop
      select id into v_inv from public.investors where code='LEG-' || upper(substr(encode(digest(alloc->>'investor','sha256'),'hex'),1,16));
      if v_inv is not null then
        insert into public.participations(project_id,investor_id,amount,start_date,status)
          values(v_proj,v_inv,(alloc->>'amount')::numeric,coalesce(nullif(proj->>'start_date','')::date,current_date),'active');
        c_part:=c_part+1;
      end if;
    end loop;
  end loop;
  return jsonb_build_object('projects',c_proj,'investors',c_inv,'participations',c_part);
end; $$;

alter table public.app_users enable row level security;
alter table public.investors enable row level security;
alter table public.projects enable row level security;
alter table public.participations enable row level security;
alter table public.settlement_batches enable row level security;
alter table public.project_settlements enable row level security;
alter table public.weekly_settlements enable row level security;

create policy "self role read" on public.app_users for select to authenticated using ((select auth.uid())=user_id or public.is_admin());
create policy "admin app_users all" on public.app_users for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "investor self read" on public.investors for select to authenticated using (user_id=(select auth.uid()) or public.is_admin());
create policy "admin investors all" on public.investors for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "authorized projects read" on public.projects for select to authenticated using (public.can_view_project(id));
create policy "admin projects all" on public.projects for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "own participations read" on public.participations for select to authenticated using (public.is_admin() or investor_id in (select id from public.investors where user_id=(select auth.uid())));
create policy "admin participations all" on public.participations for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "authenticated batches read" on public.settlement_batches for select to authenticated using (true);
create policy "admin batches all" on public.settlement_batches for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin project settlements all" on public.project_settlements for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "own weekly settlements read" on public.weekly_settlements for select to authenticated using (public.is_admin() or investor_id in (select id from public.investors where user_id=(select auth.uid())));
create policy "admin weekly settlements all" on public.weekly_settlements for all to authenticated using (public.is_admin()) with check (public.is_admin());

grant select on public.app_users,public.investors,public.projects,public.participations,public.settlement_batches,public.weekly_settlements to authenticated;
grant select,insert,update,delete on public.app_users,public.investors,public.projects,public.participations,public.settlement_batches,public.project_settlements,public.weekly_settlements to authenticated;
grant execute on function public.claim_my_investor() to authenticated;
grant execute on function public.allocate_project_week(date,date,uuid,numeric,numeric) to authenticated;
grant execute on function public.import_legacy_payload(jsonb) to authenticated;
