create table public.af_payments (
 tenant_id uuid not null references public.tenants(id), contract_id uuid not null, period date not null check(extract(day from period)=1),
 received date not null, cents bigint not null check(cents>0), primary key(tenant_id,contract_id,period),
 foreign key(tenant_id,contract_id) references public.rental_contracts(tenant_id,id)
);
create table public.af_jobs (
 id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id), property_id uuid not null,
 name text not null check(length(trim(name))>0), scheduled date not null, completed date, unique(tenant_id,id),
 foreign key(tenant_id,property_id) references public.properties(tenant_id,id)
);
create table public.af_expenses (
 id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id), name text not null check(length(trim(name))>0),
 paid date not null, cents bigint not null check(cents>0), job_id uuid unique, foreign key(tenant_id,job_id) references public.af_jobs(tenant_id,id)
);
create index af_jobs_tenant_property on public.af_jobs(tenant_id,property_id);
create index af_expenses_tenant_date on public.af_expenses(tenant_id,paid);
alter table public.af_payments enable row level security;
revoke all on public.af_payments from public,anon,authenticated;
grant select,insert on public.af_payments to authenticated;
create policy member_read on public.af_payments for select to authenticated using(private.is_tenant_member(tenant_id));
create policy editor_insert on public.af_payments for insert to authenticated with check(private.can_edit_tenant(tenant_id));
alter table public.af_jobs enable row level security;
revoke all on public.af_jobs from public,anon,authenticated;
grant select,insert on public.af_jobs to authenticated;
create policy member_read on public.af_jobs for select to authenticated using(private.is_tenant_member(tenant_id));
create policy editor_insert on public.af_jobs for insert to authenticated with check(private.can_edit_tenant(tenant_id));
alter table public.af_expenses enable row level security;
revoke all on public.af_expenses from public,anon,authenticated;
grant select,insert on public.af_expenses to authenticated;
create policy member_read on public.af_expenses for select to authenticated using(private.is_tenant_member(tenant_id));
create policy editor_insert on public.af_expenses for insert to authenticated with check(private.can_edit_tenant(tenant_id));
grant update(completed) on public.af_jobs to authenticated;
create policy editor_update on public.af_jobs for update to authenticated using(private.can_edit_tenant(tenant_id)) with check(private.can_edit_tenant(tenant_id));
create function public.af_add_property(t uuid, n text, k public.property_type, addr text, pid uuid) returns void
language plpgsql security invoker set search_path='' as $$
begin
 insert into public.properties(id,tenant_id,name,property_type,street,created_by) values(pid,t,n,k,addr,auth.uid());
 insert into public.property_units(tenant_id,property_id,name,created_by) values(t,pid,'Unidade principal',auth.uid());
end $$;
create function public.af_finish_job(t uuid, j uuid, dt date, cost bigint) returns void
language plpgsql security invoker set search_path='' as $$
declare title text;
begin
 if dt is null or dt>(now() at time zone 'America/Sao_Paulo')::date or cost is null or cost<0 then raise exception 'Data ou custo inválido'; end if;
 update public.af_jobs set completed=dt where tenant_id=t and id=j and completed is null returning name into title;
 if not found then raise exception 'Serviço indisponível ou já concluído'; end if;
 if cost>0 then insert into public.af_expenses(tenant_id,name,paid,cents,job_id) values(t,title,dt,cost,j); end if;
end $$;
revoke all on function public.af_add_property(uuid,text,public.property_type,text,uuid), public.af_finish_job(uuid,uuid,date,bigint) from public,anon;
grant execute on function public.af_add_property(uuid,text,public.property_type,text,uuid), public.af_finish_job(uuid,uuid,date,bigint) to authenticated;
