# Codex: levar os cadastros novos para a carteira online (Supabase)

Preparado por Claude em 27/11/2026. Telas publicadas em produção no commit `5077012` (branch `main`).
Este documento substitui as propostas soltas em `docs/HANDOFF-CADASTRO-IMOVEL.md`.

## 1. Situação hoje
As telas de imóvel, locatário e contrato coletam muitos campos novos. Nas carteiras **local** e **demonstração** tudo já é salvo (localStorage). Na **carteira online** só vão os campos antigos, e o formulário avisa isso ao usuário (`.pf-note`):

| Cadastro | Vai para o Supabase hoje | Fica só no navegador / é descartado online |
|---|---|---|
| Imóvel | nome, tipo, endereço montado em uma string (`af_add_property`) | finalidade, características, foto, matrícula, CEP e endereço separado, valores |
| Locatário | nome, telefone (`renters`) | PF/PJ, CPF/CNPJ, dados pessoais, e-mail, emergência, endereço, garantia, observações |
| Contrato | unidade, locatário, datas, valor, vencimento (`rental_contracts`) | reajuste, multa, juros, garantia, observações |

O projeto Supabase do app é `goriksanlyejevfycjsx`. Claude **não tem acesso** a ele, por isso tudo abaixo é proposta a validar.

## 2. Banco: o que fazer
Rascunho completo e comentado: [`docs/codex/20261127_cadastros_completos.RASCUNHO.sql`](codex/20261127_cadastros_completos.RASCUNHO.sql). Resumo:

1. **Colunas novas** em `properties`, `renters` e `rental_contracts`, com limites (`check`) iguais aos do front.
2. **Índice único** `(tenant_id, doc)` em `renters`, para não cadastrar o mesmo CPF/CNPJ duas vezes.
3. **Restrição de sobreposição** de contratos ativos por unidade (`exclude using gist`). Antes, rode a consulta do rascunho para achar conflitos já existentes.
4. **RPC `af_add_property_v2(t uuid, p jsonb) returns uuid`**, que grava o imóvel completo e cria a unidade principal. A `af_add_property` antiga continua por compatibilidade.
5. **Bucket privado `property-photos`** com políticas por tenant (`<tenant_id>/<property_id>.webp`, até 300 KB, só webp/jpeg). No banco fica só o caminho, em `properties.photo_path`; nunca a imagem em base64.
6. Confira se as tabelas usam **GRANT por coluna**. Se usarem, inclua as colunas novas nos grants de `insert`/`select` de `authenticated`.

Antes de escrever a migração, rode `\d` nas quatro tabelas. O front já lê `properties.street, number, city`; reaproveite colunas que já existam com outro nome (CEP, UF, bairro) em vez de duplicar.

## 3. Front-end: o que mudar em `app.js`
O nome dos campos no front está entre parênteses. Valores em dinheiro já estão em **centavos** no front.

### 3.1 `writeOnline`
- **`property`**: chamar `rpc/af_add_property_v2` com `{t, p}`. Mapeamento:
  - `id` = `crypto.randomUUID()`
  - `name`, `type` (chave do mapa `types`), `purpose`, `area_m2` (area), `bedrooms`, `bathrooms`, `parking`, `furnished`, `pets_allowed` (pets)
  - `registry`, `zip` (cep), `street`, `number` ("S/N" quando `noNumber`), `complement`, `district`, `city`, `state` (uf), `reference`
  - `rent_cents` (rent), `condo_cents` (condo), `iptu_year_cents` (iptu), `fees_payer` (payer: Locatário → `tenant`, Locador → `owner`)
  - **Foto**: se `photo` vier preenchido (data URL), depois da RPC converter para Blob e enviar com `POST /storage/v1/object/property-photos/<tenant>/<pid>.webp` (token do usuário). Em seguida `PATCH properties?id=eq.<pid>` com `photo_path`. Se o upload falhar, o imóvel fica salvo sem foto e o usuário vê um aviso; **não** desfazer o cadastro.
- **`person`**: incluir no `post('renters', …)`:
  - `kind`, `doc`, `birth_date` (birth), `marital_status` (marital), `rg`, `occupation` (job), `legal_rep` (rep), `income_cents` (income)
  - `email`, `contact_pref` (pref), `emergency_name` (emName), `emergency_phone` (emPhone)
  - `zip` (cep), `street`, `number`, `complement`, `district`, `city`, `state` (uf)
  - `guarantee_type` (guarantee), `guarantee_cents` (gValue), `guarantor_name` (gName), `guarantor_doc` (gDoc), `guarantor_phone` (gPhone), `policy_ref` (gRef), `notes`
  - Mandar `null` para string vazia.
- **`lease`**: incluir `adjustment_index` (index), `late_fee_pct` (fine), `interest_month_pct` (interest), `guarantee_type` (guarantee), `guarantee_cents` (gValue) e `notes`. Tratar o erro de sobreposição (`23P01`) com a mensagem "Este imóvel já tem contrato nesse período."

### 3.2 `loadOnline`
- Ampliar os `select` das três tabelas com as colunas novas e mapear de volta para os nomes do front (o inverso da lista acima). `address` continua montado como `rua, número · complemento – bairro, cidade/UF`.
- **Foto**: para cada `photo_path`, gerar URL assinada (`POST /storage/v1/object/sign/property-photos/...`, validade de 1 h) e pôr em `photo`. Pode ser em lote, depois do primeiro `render()`.

### 3.3 Avisos
- Apagar os três `<p class="pf-note">` (em `propertyForm`, `tenantForm` e `leaseForm`) quando os campos estiverem gravando online.

## 4. Ordem sugerida
1. Conferir o esquema e ajustar o rascunho SQL.
2. Aplicar em uma **branch do Supabase** (ou num projeto de teste), nunca direto em produção.
3. Rodar os testes da seção 6.
4. Mudar o front (seção 3) numa branch própria; testar com a carteira online da branch.
5. Pedir aprovação do responsável, aplicar a migração em produção e depois publicar o front. Não inverter a ordem: front novo com banco antigo quebra o cadastro.

## 5. Dados pessoais (LGPD)
- CPF/CNPJ, RG, nascimento, renda e dados do fiador são dados pessoais. Eles ficam isolados por tenant pela RLS que já existe. Não podem aparecer em logs, mensagens de erro nem no `console`.
- A interface já mostra o CPF mascarado na lista (`***.456.789-**`). Mantenha isso.
- Hipótese a decidir com o responsável: limitar a leitura de `doc`/`rg`/`guarantor_doc` a quem pode editar (`can_edit_tenant`).

## 6. Testes obrigatórios antes de produção
1. **Isolamento**: um usuário do tenant A não lê nem grava colunas novas, linhas ou fotos do tenant B (`select`, `insert`, `update`, `storage` get/put).
2. **Papéis**: um membro só-leitura não grava; um editor grava.
3. **Checks**: CPF com letras, UF minúscula, CEP sem hífen, multa acima de 100 e juros acima de 10 são rejeitados.
4. **Sobreposição**: um segundo contrato ativo sobreposto na mesma unidade falha com `23P01`; um contrato encerrado sobreposto passa.
5. **Foto**: arquivo acima de 300 KB ou PNG é recusado; caminho com tenant de outra carteira é recusado.
6. **Compatibilidade**: `af_add_property` antiga continua funcionando; carteiras com dados antigos carregam sem erro (colunas novas nulas).
7. `npm test` continua passando.

## 7. Fora de escopo (não fazer sem aprovação)
- Migrar dados das carteiras locais para o online.
- Serviços pagos, chaves reais ou mudança de plano do Supabase.
- Apagar colunas ou funções antigas.
