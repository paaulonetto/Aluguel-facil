# Cadastro de imóvel em 3 etapas: pendência de banco (27/11/2026)

Branch `design/ux-ui` (Claude). O formulário "Novo imóvel" passou a coletar, em 3 etapas:

| Etapa | Campos |
|---|---|
| Identificação | nome*, tipo*, finalidade (Residencial/Comercial), área m², quartos, banheiros, vagas, mobiliado, aceita animais, foto da fachada (opcional), matrícula/inscrição IPTU |
| Localização | CEP* (busca ViaCEP com BrasilAPI de reserva), rua*, número* ou "Sem número" (grava `S/N`), complemento, bairro*, cidade*, UF*, ponto de referência |
| Valores | aluguel pretendido*, condomínio/mês, IPTU/ano, quem paga condomínio e IPTU (Locatário/Locador) |

Valores em centavos (`rent`, `condo`, `iptu`). A foto é reduzida no navegador para no máximo 960 px em WebP (≈25–90 KB) e guardada como data URL.

## O que já funciona
- Carteiras local e demonstração: tudo é salvo no `localStorage`.
- Carteira online: continua chamando `af_add_property(t,n,k,addr,pid)` com o endereço completo montado em `addr`. **Os demais campos não são gravados online** e o formulário avisa isso na etapa Valores.

## Proposta para o Codex (hipótese, precisa de aprovação e migração com RLS)
1. Colunas novas em `public.properties`: `purpose text`, `area numeric`, `bedrooms int`, `bathrooms int`, `parking int`, `furnished bool`, `pets bool`, `registry text`, `cep text`, `number text`, `complement text`, `district text`, `uf char(2)`, `reference text`, `rent_cents bigint`, `condo_cents bigint`, `iptu_year_cents bigint`, `fees_payer text check in ('tenant','owner')`.
2. Foto: bucket privado no Supabase Storage por tenant (`tenant_id/property_id.webp`) com política de leitura/escrita só para membros ativos do tenant; guardar só o caminho em `properties.photo_path`. Não gravar data URL no banco.
3. Atualizar `af_add_property` (ou criar `af_add_property_v2`) recebendo um `jsonb` validado no servidor, e incluir os campos em `loadOnline`.
4. Testes: isolamento entre tenants nas novas colunas e no bucket.

Arquivos: `app.js` (bloco "Cadastro de imóvel em 3 etapas", `propertyList`, submit), `model.js` (demo), `style.css` (blocos `.pf-*` e `.pl-*`).

---

# Cadastro de locatário em 3 etapas (27/11/2026)

O formulário "Novo locatário" usa o mesmo esquema de etapas (código compartilhado `pf*`; endereço reaproveitado em `pfAddr`).

| Etapa | Campos |
|---|---|
| Dados pessoais | pessoa física/jurídica, nome* (ou razão social), CPF/CNPJ (máscara e dígito verificador), nascimento, estado civil, RG, profissão (só PF), responsável legal (só PJ), renda/faturamento mensal |
| Contato | WhatsApp (máscara), e-mail, melhor forma de contato, contato de emergência (nome e telefone) |
| Endereço e garantia | endereço atual opcional com busca por CEP (número obrigatório se a rua for preenchida, ou "Sem número"), garantia (sem garantia, caução com valor, fiador com nome/CPF/telefone, seguro fiança ou título com empresa/apólice), observações |

Na carteira online continua indo só `name` e `phone` para `renters`. Proposta para o Codex (hipótese, precisa de aprovação):
1. Colunas em `public.renters`: `kind text check in ('PF','PJ')`, `doc text`, `birth date`, `marital text`, `rg text`, `job text`, `rep text`, `income_cents bigint`, `email text`, `contact_pref text`, `emergency_name text`, `emergency_phone text`, endereço (mesmas colunas do imóvel), `notes text`.
2. Garantia: tabela `renter_guarantees` (ou no contrato, que é onde juridicamente ela pertence) com `type`, `value_cents`, `guarantor_name`, `guarantor_doc`, `guarantor_phone`, `policy_ref`.
3. **CPF/CNPJ e dados do fiador são dados pessoais (LGPD)**: RLS por tenant, nada em logs, mostrar mascarado na interface (a lista já mostra `***.456.789-**`).

---

# Cadastro de contrato em 3 etapas (27/11/2026)

| Etapa | Campos |
|---|---|
| Partes | imóvel* (mostra "alugado até" ou "disponível"; na carteira online, unidade disponível), locatário* (puxa a garantia do cadastro) |
| Prazo e valor | duração (12/24/30/36 meses ou outro), início*, término* calculado, aluguel* (vem do aluguel pretendido), dia do vencimento* com aviso da primeira cobrança; bloqueia término antes do início e sobreposição com outro contrato do mesmo imóvel |
| Condições | reajuste (IGP-M, IPCA, IVAR, sem reajuste) com data do primeiro reajuste, multa %, juros % ao mês, garantia (+ valor da caução), observações, resumo com total do contrato |

Na carteira online continuam indo só os campos atuais de `rental_contracts`. Proposta para o Codex (hipótese, precisa de aprovação): colunas `adjustment_index text`, `late_fee_pct numeric(5,2)`, `interest_month_pct numeric(5,2)`, `guarantee_type text`, `guarantee_cents bigint`, `notes text` em `rental_contracts` (a garantia pertence ao contrato; o cadastro do locatário só sugere), e validação no servidor de sobreposição de vigência por unidade (`exclude using gist` com `daterange`).
