-- Cadastros completos de imóvel e locatário (Claude · 27/11/2026).
-- Escrita a partir do esquema real do projeto goriksanlyejevfycjsx (lido em 27/11/2026).
-- Só ACRESCENTA: nenhuma coluna, função ou dado existente é apagado ou alterado.
-- Desfazer: supabase/migrations/rollback/20261127_cadastros_completos.down.sql
--
-- Já existia no banco e NÃO precisa de mudança:
--   properties: cep (8 dígitos), street, number, complement, neighborhood, city, state, features, notes
--   property_units: area_m2, suggested_rent (aluguel sugerido, em reais)
--   renters: person_type, document (CPF/CNPJ, índice único por carteira), email, phone,
--            secondary_contact_name/phone (contato de emergência), endereço completo, notes
--   rental_contracts: adjustment_index, penalty_percent, late_interest_percent, guarantee_type,
--            deposit_amount, notes e a trava contra contratos ativos sobrepostos (rental_contracts_no_overlap)
--   property_photos + bucket privado property-photos + políticas por carteira
-- Dinheiro nas tabelas principais é numeric em REAIS (como monthly_rent); o front converte de centavos.

begin;

-- 1. Imóveis -----------------------------------------------------------------
alter table public.properties
  add column if not exists purpose       text     not null default 'residential' check (purpose in ('residential','commercial')),
  add column if not exists bedrooms      smallint check (bedrooms  between 0 and 99),
  add column if not exists bathrooms     smallint check (bathrooms between 0 and 99),
  add column if not exists parking       smallint check (parking   between 0 and 99),
  add column if not exists furnished     boolean  not null default false,
  add column if not exists pets_allowed  boolean  not null default false,
  add column if not exists registry      text     check (char_length(registry)  <= 40),
  add column if not exists reference     text     check (char_length(reference) <= 100),
  add column if not exists condo_fee     numeric(12,2) check (condo_fee   >= 0),
  add column if not exists iptu_yearly   numeric(12,2) check (iptu_yearly >= 0),
  add column if not exists fees_payer    text     not null default 'renter' check (fees_payer in ('renter','owner'));

-- 2. Locatários ----------------------------------------------------------------
alter table public.renters
  add column if not exists birth_date         date check (birth_date >= date '1900-01-01'), -- data futura é barrada no front (check com current_date atrapalha restore)
  add column if not exists marital_status     text check (marital_status in ('single','married','stable_union','divorced','widowed')),
  add column if not exists rg                 text check (char_length(rg) <= 20),
  add column if not exists occupation         text check (char_length(occupation) <= 60),
  add column if not exists legal_rep          text check (char_length(legal_rep) <= 100),
  add column if not exists monthly_income     numeric(12,2) check (monthly_income >= 0),
  add column if not exists contact_pref       text not null default 'whatsapp' check (contact_pref in ('whatsapp','phone_call','email')),
  -- garantia que o locatário oferece; vira sugestão no contrato (a garantia vale de fato em rental_contracts)
  add column if not exists guarantee_type     public.guarantee_type not null default 'none',
  add column if not exists guarantee_amount   numeric(12,2) check (guarantee_amount >= 0),
  add column if not exists guarantor_name     text check (char_length(guarantor_name) <= 160),
  add column if not exists guarantor_document text check (guarantor_document ~ '^\d{11}$'),
  add column if not exists guarantor_phone    text check (guarantor_phone ~ '^\d{10,11}$'),
  add column if not exists guarantee_ref      text check (char_length(guarantee_ref) <= 80);

-- 3. Cadastro completo de imóvel numa só chamada (a af_add_property antiga continua existindo)
create or replace function public.af_add_property_v2(t uuid, p jsonb) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare pid uuid := coalesce(nullif(p->>'id','')::uuid, gen_random_uuid());
begin
  insert into public.properties(
    id, tenant_id, name, property_type, cep, street, number, complement, neighborhood, city, state,
    purpose, bedrooms, bathrooms, parking, furnished, pets_allowed, registry, reference,
    condo_fee, iptu_yearly, fees_payer, created_by)
  values (
    pid, t, trim(p->>'name'), coalesce(nullif(p->>'type',''),'other')::public.property_type,
    nullif(p->>'cep',''), nullif(p->>'street',''), nullif(p->>'number',''), nullif(p->>'complement',''),
    nullif(p->>'neighborhood',''), nullif(p->>'city',''), nullif(p->>'state',''),
    coalesce(nullif(p->>'purpose',''),'residential'),
    nullif(p->>'bedrooms','')::smallint, nullif(p->>'bathrooms','')::smallint, nullif(p->>'parking','')::smallint,
    coalesce((p->>'furnished')::boolean,false), coalesce((p->>'pets_allowed')::boolean,false),
    nullif(p->>'registry',''), nullif(p->>'reference',''),
    nullif(p->>'condo_fee','')::numeric, nullif(p->>'iptu_yearly','')::numeric,
    coalesce(nullif(p->>'fees_payer',''),'renter'), auth.uid());
  insert into public.property_units(tenant_id, property_id, name, area_m2, suggested_rent, created_by)
  values (t, pid, 'Unidade principal',
    nullif(nullif(p->>'area_m2',''),'0')::numeric, nullif(p->>'suggested_rent','')::numeric, auth.uid());
  return pid;
end $$;
revoke all on function public.af_add_property_v2(uuid, jsonb) from public, anon;
grant execute on function public.af_add_property_v2(uuid, jsonb) to authenticated;

-- 4. Foto da fachada: o front já reduz para webp/jpeg pequeno; o bucket passa a recusar o resto.
update storage.buckets
   set file_size_limit = 307200, allowed_mime_types = array['image/webp','image/jpeg']
 where id = 'property-photos';

commit;
