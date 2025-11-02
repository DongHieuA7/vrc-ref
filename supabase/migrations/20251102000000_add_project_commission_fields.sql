-- Add commission_rate_min, commission_rate_max, and policy to projects table
alter table public.projects 
  add column if not exists commission_rate_min numeric(5,2) check (commission_rate_min >= 0 and commission_rate_min <= 100),
  add column if not exists commission_rate_max numeric(5,2) check (commission_rate_max >= 0 and commission_rate_max <= 100),
  add column if not exists policy text;

-- Add check constraint to ensure min <= max
alter table public.projects
  add constraint projects_commission_rate_check 
  check (commission_rate_min is null or commission_rate_max is null or commission_rate_min <= commission_rate_max);

