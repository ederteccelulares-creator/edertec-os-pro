-- Commission rules and immutable sale-time commission snapshots.
alter table public.employees
 add column if not exists commission_percent numeric(5,2) not null default 0
 check (commission_percent >= 0 and commission_percent <= 100);

alter table public.company_pos_sales
 add column if not exists seller_employee_id uuid,
 add column if not exists commission_rate numeric(5,2) not null default 0,
 add column if not exists commission_amount numeric(12,2) not null default 0;

do $$
begin
 if not exists(select 1 from pg_constraint where conname='company_pos_sales_seller_employee_company_fk') then
  alter table public.company_pos_sales add constraint company_pos_sales_seller_employee_company_fk
   foreign key(seller_employee_id,company_id) references public.employees(id,company_id);
 end if;
end $$;

create index if not exists company_pos_sales_seller_period_idx
 on public.company_pos_sales(company_id,seller_employee_id,created_at desc)
 where status='completed';

create or replace function public.snapshot_company_pos_sale_commission()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare v_employee_id uuid; v_rate numeric(5,2);
begin
 if new.created_by is null or new.status <> 'completed' then return new; end if;
 select e.id,e.commission_percent into v_employee_id,v_rate
 from public.employees e
 where e.company_id=new.company_id and e.user_id=new.created_by and e.is_active
   and (e.branch_id is null or e.branch_id is not distinct from new.branch_id)
 order by e.created_at asc
 limit 1;
 if v_employee_id is not null and coalesce(v_rate,0)>0 then
  new.seller_employee_id:=v_employee_id;
  new.commission_rate:=v_rate;
  new.commission_amount:=round(new.total*v_rate/100,2);
 end if;
 return new;
end;
$$;

drop trigger if exists company_pos_sale_commission_snapshot on public.company_pos_sales;
create trigger company_pos_sale_commission_snapshot
 before insert on public.company_pos_sales
 for each row execute function public.snapshot_company_pos_sale_commission();

revoke all on function public.snapshot_company_pos_sale_commission() from public,anon,authenticated;
