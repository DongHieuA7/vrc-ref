-- Update commission_status enum to include 'confirmed' and 'paid'
do $$ 
begin
  -- Check if enum already has new values
  if exists (
    select 1 from pg_type t 
    join pg_enum e on t.oid = e.enumtypid 
    where t.typname = 'commission_status' 
    and e.enumlabel = 'confirmed'
  ) then
    -- Already updated, skip
    return;
  end if;
  
  -- Drop policy and view that depend on status column
  drop policy if exists commissions_user_update_requested on public.commissions;
  drop view if exists public.commission_stats;
  
  -- Create new enum type
  create type public.commission_status_new as enum ('requested', 'confirmed', 'paid');
  
  -- Drop default constraint on status column
  alter table public.commissions alter column status drop default;
  
  -- Migrate existing data: convert column to text first
  alter table public.commissions alter column status type text using status::text;
  
  -- Update data
  update public.commissions 
  set status = case status
    when 'approved' then 'confirmed'
    when 'claimed' then 'paid'
    else status
  end;
  
  -- Change column to new enum type
  alter table public.commissions alter column status type public.commission_status_new using status::public.commission_status_new;
  
  -- Drop old enum and rename new one
  drop type if exists public.commission_status;
  alter type public.commission_status_new rename to commission_status;
  
  -- Set default again with renamed enum type
  alter table public.commissions alter column status set default 'requested'::public.commission_status;
  
  -- Recreate the policy with updated status value
  create policy commissions_user_update_requested on public.commissions 
    for update to authenticated 
    using (user_id = auth.uid() and status = 'requested') 
    with check (user_id = auth.uid() and status = 'requested');
end $$;

-- Recreate commission_stats view with updated status values
create or replace view public.commission_stats as
select 
  user_id,
  project_id,
  sum(case when status = 'confirmed' then value else 0 end) as total_confirmed,
  sum(case when status = 'paid' then value else 0 end) as total_paid,
  count(*) filter (where status = 'requested') as requested_count,
  count(*) filter (where status = 'confirmed') as confirmed_count,
  count(*) filter (where status = 'paid') as paid_count
from public.commissions
group by user_id, project_id;

alter view public.commission_stats owner to postgres;
grant select on public.commission_stats to authenticated;

-- Add contract_amount and commission_rate to commissions table
alter table public.commissions
  add column if not exists contract_amount numeric,
  add column if not exists commission_rate numeric(5,2) check (commission_rate >= 0 and commission_rate <= 100);

-- Update value to be calculated as contract_amount * commission_rate when both are present
-- For existing records, keep the current value if contract_amount and commission_rate are not set

