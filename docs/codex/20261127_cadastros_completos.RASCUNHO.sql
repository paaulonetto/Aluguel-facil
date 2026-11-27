-- RASCUNHO para o Codex revisar (Claude · 27/11/2026). NÃO APLICAR sem:
--   1) conferir o esquema real (\d public.properties, public.renters, public.rental_contracts, public.property_units);
--   2) reaproveitar colunas que já existam com outro nome (ex.: zip/postal_code, state/uf, district/neighborhood);
--   3) aprovação humana do responsável antes de rodar em produção;
--   4) testes de isolamento entre tenants passando (ver docs/CODEX-BANCO-ONLINE.md, seção 6).
-- Depois de revisado, mover para supabase/migrations/ com a data real.

begin;

-- 1. Imóveis ---------------------------------------------------------------
alter table public.properties
  add column if not exists purpose          text     check (purpose in ('Residencial','Comercial')),
  add column if not exists area_m2          numeric(10,2) check (area_m2 >= 0),
  add column if not exists bedrooms         smallint check (bedrooms  between 0 and 999),
  add column if not exists bathrooms        smallint check (bathrooms between 0 and 999),
  add column if not exists parking          smallint check (parking   between 0 and 999),
  add column if not exists furnished        boolean  not null default false,
  add column if not exists pets_allowed     boolean  not null default false,
  add column if not exists registry         text     check (length(registry) <= 40),
  add column if not exists zip              text     check (zip ~ '^\d{5}-\d{3}$'),
  add column if not exists complement       text     check (length(complement) <= 60),
  add column if not exists district         text     check (length(district) <= 80),
  add column if not exists state            char(2)  check (state ~ '^[A-Z]{2}$'),
  add column if not exists reference        text     check (length(reference) <= 100),
  add column if not exists rent_cents       bigint   check (rent_cents >= 0),
  add column if not exists condo_cents      bigint   check (condo_cents >= 0),
  add column if not exists iptu_year_cents  bigint   check (iptu_year_cents >= 0),
  add column if not exists fees_payer       text     not null default 'tenant' check (fees_payer in ('tenant','owner')),
  add column if not exists photo_path       text     check (photo_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(webp|jpg)$');
-- "Sem número": o front grava number = 'S/N'. Conferir se a coluna number é text.

-- 2. Locatários -----------------------------------------------------------
alter table public.renters
  add column if not exists kind              text not null default 'PF' check (kind in ('PF','PJ')),
  add column if not exists doc               text check (doc ~ '^(\d{11}|\d{14})$'),          -- só dígitos; CPF 11, CNPJ 14
  add column if not exists birth_date        date check (birth_date between '1900-01-01' and current_date),
  add column if not exists marital_status    text check (marital_status in ('Solteiro(a)','Casado(a)','União estável','Divorciado(a)','Viúvo(a)')),
  add column if not exists rg                text check (length(rg) <= 20),
  add column if not exists occupation        text check (length(occupation) <= 60),
  add column if not exists legal_rep         text check (length(legal_rep) <= 100),
  add column if not exists income_cents      bigint check (income_cents >= 0),
  add column if not exists email             text check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' and length(email) <= 120),
  add column if not exists contact_pref      text not null default 'WhatsApp' check (contact_pref in ('WhatsApp','Ligação','E-mail')),
  add column if not exists emergency_name    text check (length(emergency_name) <= 100),
  add column if not exists emergency_phone   text check (emergency_phone ~ '^\d{10,11}$'),
  add column if not exists zip               text check (zip ~ '^\d{5}-\d{3}$'),
  add column if not exists street            text check (length(street) <= 120),
  add column if not exists number            text check (length(number) <= 10),
  add column if not exists complement        text check (length(complement) <= 60),
  add column if not exists district          text check (length(district) <= 80),
  add column if not exists city              text check (length(city) <= 80),
  add column if not exists state             char(2) check (state ~ '^[A-Z]{2}$'),
  -- garantia preferida (sugestão para novos contratos; a garantia vale de fato no contrato)
  add column if not exists guarantee_type    text not null default 'Sem garantia'
       check (guarantee_type in ('Sem garantia','Caução','Fiador','Seguro fiança','Título de capitalização')),
  add column if not exists guarantee_cents   bigint check (guarantee_cents >= 0),
  add column if not exists guarantor_name    text check (length(guarantor_name) <= 100),
  add column if not exists guarantor_doc     text check (guarantor_doc ~ '^\d{11}$'),
  add column if not exists guarantor_phone   text check (guarantor_phone ~ '^\d{10,11}$'),
  add column if not exists policy_ref        text check (length(policy_ref) <= 80),
  add column if not exists notes             text check (length(notes) <= 500);
-- Mesmo CPF/CNPJ duas vezes na mesma carteira é quase sempre erro de digitação.
create unique index if not exists renters_tenant_doc_uq on public.renters(tenant_id, doc) where doc is not null;
-- A validação de dígito verificador já existe no front; recomendável repetir no servidor (função private.valid_cpf_cnpj).

-- 3. Contratos -------------------------------------------------------------
alter table public.rental_contracts
  add column if not exists adjustment_index    text check (adjustment_index in ('IGP-M','IPCA','IVAR','Sem reajuste')),
  add column if not exists late_fee_pct        numeric(5,2) check (late_fee_pct between 0 and 100),
  add column if not exists interest_month_pct  numeric(5,2) check (interest_month_pct between 0 and 10),
  add column if not exists guarantee_type      text not null default 'Sem garantia'
       check (guarantee_type in ('Sem garantia','Caução','Fiador','Seguro fiança','Título de capitalização')),
  add column if not exists guarantee_cents     bigint check (guarantee_cents >= 0),
  add column if not exists notes               text check (length(notes) <= 500);

-- Impede dois contratos ativos sobrepostos na mesma unidade (o front já bloqueia; o servidor precisa garantir).
create extension if not exists btree_gist;
alter table public.rental_contracts
  add constraint rental_contracts_no_overlap
  exclude using gist (unit_id with =, daterange(start_date, end_date, '[]') with &&)
  where (status = 'active');
-- ATENÇÃO: falha se já houver sobreposição nos dados atuais. Rodar antes:
--   select a.id, b.id from public.rental_contracts a join public.rental_contracts b
--     on a.unit_id = b.unit_id and a.id < b.id and a.status = 'active' and b.status = 'active'
--    and daterange(a.start_date,a.end_date,'[]') && daterange(b.start_date,b.end_date,'[]');

-- 4. Cadastro de imóvel completo (substitui af_add_property, que segue existindo por compatibilidade)
create or replace function public.af_add_property_v2(t uuid, p jsonb) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare pid uuid := coalesce((p->>'id')::uuid, gen_random_uuid());
begin
  if coalesce(trim(p->>'name'),'') = '' then raise exception 'Informe o nome do imóvel'; end if;
  insert into public.properties(
    id, tenant_id, name, property_type, street, number, city, created_by,
    purpose, area_m2, bedrooms, bathrooms, parking, furnished, pets_allowed, registry,
    zip, complement, district, state, reference, rent_cents, condo_cents, iptu_year_cents, fees_payer)
  values (
    pid, t, trim(p->>'name'), (p->>'type')::public.property_type, p->>'street', p->>'number', p->>'city', auth.uid(),
    p->>'purpose', (p->>'area_m2')::numeric, (p->>'bedrooms')::smallint, (p->>'bathrooms')::smallint, (p->>'parking')::smallint,
    coalesce((p->>'furnished')::boolean,false), coalesce((p->>'pets_allowed')::boolean,false), nullif(p->>'registry',''),
    p->>'zip', nullif(p->>'complement',''), p->>'district', p->>'state', nullif(p->>'reference',''),
    (p->>'rent_cents')::bigint, (p->>'condo_cents')::bigint, (p->>'iptu_year_cents')::bigint, coalesce(p->>'fees_payer','tenant'));
  insert into public.property_units(tenant_id, property_id, name, created_by) values (t, pid, 'Unidade principal', auth.uid());
  return pid;
end $$;
revoke all on function public.af_add_property_v2(uuid, jsonb) from public, anon;
grant execute on function public.af_add_property_v2(uuid, jsonb) to authenticated;

-- 5. Permissões de coluna: conferir se renters/rental_contracts/properties usam GRANT por coluna.
--    Se sim, incluir as colunas novas em "grant insert (...)" e "grant select (...)" para authenticated.
--    RLS existente por tenant (private.is_tenant_member / private.can_edit_tenant) continua valendo para as colunas novas.

commit;

-- 6. Foto da fachada (Storage) — executar à parte, depois de criar o bucket privado "property-photos".
-- Caminho do arquivo: <tenant_id>/<property_id>.webp
-- create policy "membros leem fotos" on storage.objects for select to authenticated
--   using (bucket_id = 'property-photos' and private.is_tenant_member(((storage.foldername(name))[1])::uuid));
-- create policy "editores enviam fotos" on storage.objects for insert to authenticated
--   with check (bucket_id = 'property-photos' and private.can_edit_tenant(((storage.foldername(name))[1])::uuid));
-- create policy "editores trocam fotos" on storage.objects for update to authenticated
--   using (bucket_id = 'property-photos' and private.can_edit_tenant(((storage.foldername(name))[1])::uuid));
-- create policy "editores apagam fotos" on storage.objects for delete to authenticated
--   using (bucket_id = 'property-photos' and private.can_edit_tenant(((storage.foldername(name))[1])::uuid));
-- Limites do bucket: file_size_limit 300 KB; allowed_mime_types {image/webp,image/jpeg}.
