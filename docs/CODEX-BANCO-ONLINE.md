# Banco online: cadastros completos (Supabase `goriksanlyejevfycjsx`)

Atualizado por Claude em 27/11/2026. Desde esta data, **Claude implementa app e banco**; o **Codex atua como QA** (testes e revisão de desempenho).

## 1. O que o banco já tinha (lido em 27/11/2026)
O esquema real já cobria a maior parte dos campos novos, com outros nomes:

| Front | Banco (já existia) |
|---|---|
| CEP, rua, número, complemento, bairro, cidade, UF | `cep` (8 dígitos, sem hífen), `street`, `number`, `complement`, `neighborhood`, `city`, `state` em `properties` e `renters` |
| Área e aluguel do imóvel | `property_units.area_m2`, `property_units.suggested_rent` (reais) |
| PF/PJ, CPF/CNPJ, e-mail, contato de emergência, observações | `renters.person_type`, `document` (índice único por carteira), `email`, `secondary_contact_name/phone`, `notes` |
| Reajuste, multa, juros, garantia, valor da caução, observações | `rental_contracts.adjustment_index`, `penalty_percent`, `late_interest_percent`, `guarantee_type`, `deposit_amount`, `notes` |
| Bloqueio de contratos sobrepostos | `rental_contracts_no_overlap` (exclude gist, só status `active`) |
| Foto da fachada | tabela `property_photos` + bucket privado `property-photos` com políticas por carteira |

Dados no momento da leitura: 1 carteira, 0 imóveis, 0 locatários, 0 contratos.

## 2. Migração nova
[`supabase/migrations/20261127_cadastros_completos.sql`](../supabase/migrations/20261127_cadastros_completos.sql), só acréscimos:
- `properties`: `purpose`, `bedrooms`, `bathrooms`, `parking`, `furnished`, `pets_allowed`, `registry`, `reference`, `condo_fee`, `iptu_yearly`, `fees_payer`.
- `renters`: `birth_date`, `marital_status`, `rg`, `occupation`, `legal_rep`, `monthly_income`, `contact_pref`, `guarantee_type`, `guarantee_amount`, `guarantor_name`, `guarantor_document`, `guarantor_phone`, `guarantee_ref`.
- RPC `af_add_property_v2(t uuid, p jsonb) returns uuid` (security invoker; cria imóvel + unidade principal). A `af_add_property` antiga continua.
- Bucket `property-photos`: limite 300 KB e só `image/webp`/`image/jpeg` (antes 5 MB, qualquer tipo).

Desfazer: [`supabase/migrations/rollback/20261127_cadastros_completos.down.sql`](../supabase/migrations/rollback/20261127_cadastros_completos.down.sql).

### Ensaio em produção com rollback (27/11/2026)
A migração foi executada dentro de uma transação desfeita no final (nenhuma mudança ficou). Resultados, rodando como `authenticated` com um owner/manager real:

| Teste | Resultado |
|---|---|
| `af_add_property_v2` grava os campos novos | ok (`commercial/2/450.50`) |
| Cria a unidade com área e aluguel | ok (`62.00/2500.00`) |
| Locatário completo com fiador | ok |
| Estado civil inválido | bloqueado (check) |
| CPF do fiador inválido | bloqueado (check) |
| Gravar em outra carteira | bloqueado (`42501`, RLS) |

Depois do rollback: coluna nova ausente, 0 imóveis, bucket ainda em 5 MB, função inexistente.

## 3. Códigos usados no banco (o front traduz)
- `property_type`: house, apartment, warehouse, commercial_room, store, land, other (mapa `types` do front)
- `purpose`: residential / commercial · `fees_payer`: renter / owner
- `marital_status`: single, married, stable_union, divorced, widowed
- `contact_pref`: whatsapp, phone_call, email
- `guarantee_type`: none, deposit (Caução), guarantor (Fiador), surety_insurance (Seguro fiança), capitalization_bond (Título de capitalização)
- `adjustment_index`: igpm, ipca, ivar, none
- Dinheiro: centavos no front → reais (`/100`) no banco.

## 4. Andamento
- 27/11/2026: migração **aplicada em produção** com aprovação do responsável (`cadastros_completos`); conferido: 11 colunas em `properties`, 13 em `renters`, bucket 300 KB webp/jpeg, RPC só para `authenticated`. Avisos do advisor de segurança são anteriores (funções security definer de convite/carteira e proteção de senha vazada desligada).
- 27/11/2026: front ajustado (itens 2 e 3 abaixo) na branch `design/ux-ui`. Payloads gerados pelo front ensaiados no banco real com rollback: imóvel + foto, locatário, contrato ok; sobreposição → `23P01`; CPF repetido → `renters_document_uidx` (ambos com mensagem amigável). Upload real no Storage ainda não testado (exige login de usuário).

Itens:
1. ~~Aplicar a migração em produção após aprovação do responsável.~~
2. Ajustar `writeOnline`/`loadOnline` em `app.js` com o mapeamento acima; foto: upload em `property-photos/<tenant>/<property>.webp` + linha em `property_photos`; URL assinada ao carregar; erro `23P01` → "Este imóvel já tem contrato nesse período."
3. Remover os avisos `.pf-note` dos três formulários.
4. Codex (QA): testes de isolamento entre carteiras, papéis (viewer não grava), foto acima de 300 KB/PNG recusada, `npm test`, desempenho.

## 5. Dados pessoais (LGPD)
CPF/CNPJ, RG, nascimento, renda e dados do fiador ficam isolados por carteira pela RLS existente e entram na trilha `audit_logs` (gatilhos já existentes). Não exibir em logs, mensagens de erro ou `console`. A lista mostra o CPF mascarado. Decisão pendente do responsável: limitar a leitura de documento/RG a quem pode editar.
