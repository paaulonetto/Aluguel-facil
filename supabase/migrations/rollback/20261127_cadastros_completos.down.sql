-- Desfaz 20261127_cadastros_completos.sql. ATENÇÃO: apaga os dados gravados nessas colunas novas.
begin;
drop function if exists public.af_add_property_v2(uuid, jsonb);
alter table public.properties
  drop column if exists purpose, drop column if exists bedrooms, drop column if exists bathrooms,
  drop column if exists parking, drop column if exists furnished, drop column if exists pets_allowed,
  drop column if exists registry, drop column if exists reference, drop column if exists condo_fee,
  drop column if exists iptu_yearly, drop column if exists fees_payer;
alter table public.renters
  drop column if exists birth_date, drop column if exists marital_status, drop column if exists rg,
  drop column if exists occupation, drop column if exists legal_rep, drop column if exists monthly_income,
  drop column if exists contact_pref, drop column if exists guarantee_type, drop column if exists guarantee_amount,
  drop column if exists guarantor_name, drop column if exists guarantor_document, drop column if exists guarantor_phone,
  drop column if exists guarantee_ref;
update storage.buckets set file_size_limit = 5242880, allowed_mime_types = null where id = 'property-photos';
commit;
