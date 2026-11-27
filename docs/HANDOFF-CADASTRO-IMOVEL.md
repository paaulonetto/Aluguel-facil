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
