# Revisão de UX das telas internas · 25/11/2026

Revisão feita no app rodando localmente (modo demonstração), no celular (375 px), comparando com `handoff/ESPECIFICACAO.md`.
Status: etapas 1 (tokens), 2 (barra inferior + Mais) e 3 (Início) aplicadas. Etapas 4 a 9 ainda não.

## Prioridade alta (mais impacto no uso diário)

| # | Tela | Problema | Correção proposta |
|---|---|---|---|
| A1 | Formulários (todos) | Abrem num diálogo pequeno no meio da tela do celular. O botão "Salvar" é pequeno e fica à esquerda. | Tela cheia no celular, com título à esquerda, "X" à direita e botão grande no rodapé (spec §4). No desktop, diálogo com o novo visual. |
| A2 | Cobranças | Filtro em `select` "Situação" e mês com rótulo solto. O valor e o selo ficam apertados, e "Registrar pagamento" tem cara de botão secundário cinza. | Chips de situação, totais no topo e cartões por cobrança com dias de atraso e o botão `.af-btn--suave` (spec 03). Manter o botão WhatsApp. |
| A3 | Imóveis | É uma lista única dentro de um painel ("Imóveis cadastrados" repete o título), sem busca, sem ícone por tipo e sem locatário ou valor. | Cartões por imóvel com ícone do tipo, locatário e valor/mês, busca e chips (spec 02), mais detalhe do imóvel (spec 16). |
| A4 | Registrar pagamento | O campo de data funciona, mas não aparece nem o nome do imóvel em destaque nem os dias de atraso. | Resumo da cobrança no topo (imóvel, locatário, atraso, valor) e estado de sucesso depois de salvar (spec 09, só a data). |

## Prioridade média

| # | Tela | Problema | Correção proposta |
|---|---|---|---|
| M1 | Financeiro | Cartões de resumo antigos, sem comparação visual entre entradas e saídas. | Cartão escuro com saldo e barras (spec 04). |
| M2 | Contratos | O valor fica centralizado, solto entre as linhas. Falta noção de quanto tempo resta. | Cartão com barra de vigência e "N meses restantes" (spec 06). Abrir o detalhe do contrato (spec 17). |
| M3 | Manutenções | Não há abas Agendadas/Concluídas. O botão "Concluir" é pequeno e sobra um vazio grande. | Abas, bloco de data, botão de largura total e estado vazio (spec 08). |
| M4 | Locatários | Lista mínima ("Sem telefone" repetido). | Avatar com iniciais, imóvel do contrato e aviso só se faltar telefone (spec 07). |
| M5 | Todas | O título da página aparece duas vezes: no topo e no painel interno ("Imóveis" / "Imóveis cadastrados", "Contratos" / "Locações"). | Deixar só o título da página e tirar os títulos internos. |

## Prioridade baixa / acabamento

- Os cartões de resumo aparecem com animação de entrada, que deixa o conteúdo apagado por um instante ao trocar de aba. Encurtar para 150 ms ou tirar dentro do app.
- Padronizar os selos (Pago / Em atraso / A vencer) com `.af-badge` em todas as telas.
- Conferir o desktop (≥ 900 px): a barra lateral já usa o novo visual, mas o conteúdo ainda segue o layout antigo nas telas 4 a 9.

## Ideias vindas de concorrentes do nicho (para fase 2, a validar)

- Foto do imóvel no cartão e no detalhe (exige armazenar imagens).
- Calendário de vencimentos e manutenções do mês.
- Lista de primeiros passos para carteira nova (cadastrar imóvel → locatário → contrato).

## Ordem sugerida
A1 → A2 → A4 → A3 → M2 → M3 → M1 → M4 → M5 → acabamentos.

---

## Referência de mercado: o que observar num CRM imobiliário do nicho (25/11/2026)

Observado em modo leitura numa conta vazia de um CRM imobiliário concorrente. **Não copiar layout, textos nem marca**, só a ideia por trás de cada item. Cada item diz se dá para fazer só no front (fase 1) ou se exige dado novo (fase 2/3, **hipótese a validar** com usuários).

### Dá para fazer só no front (entra na fase 1)
| Ideia | Onde no AlugaFácil | Por quê |
|---|---|---|
| **Contratos vencendo nos próximos 60 dias** dentro de "Precisa de atenção" | Início e Detalhe do contrato | A data de término já existe. Renovar no prazo é dor real de quem aluga. |
| Nomear o atraso como **Inadimplência**, com valor e nº de contratos | Início / Cobranças | É o termo que locadores e administradoras usam. |
| **Estados vazios que ensinam** ("Cadastre o primeiro imóvel para…", com botão) | Todas as listas | Carteira nova hoje vê listas em branco e não sabe por onde começar. |
| Financeiro com alternância **Mês / Ano** e gráfico dos 12 meses | Financeiro | Os pagamentos e despesas já têm data. |
| Agenda única de **vencimentos + manutenções** (visão lista, depois mês) | Nova aba ou dentro de Manutenções | Junta dados que já existem e mostra a semana do locador. |
| Barra inferior com 5 itens e "Mais" | (já feito) | Confirma a escolha da etapa 2. |

### Exige dado novo (fase 2, com aprovação)
| Ideia | Dado novo |
|---|---|
| **Valores padrão da locação**: multa (ex.: 2%), juros ao mês (ex.: 1%), índice de reajuste, taxa de administração | Configuração por carteira; cálculo de multa e juros no Registrar pagamento |
| **Garantia do contrato** (caução, fiador, seguro-fiança) e **seguro do imóvel com vencimento** | Campos no contrato |
| **Proprietários** e **repasses** (quanto repassar a cada dono, já descontada a taxa) | Tabela de proprietários e de repasses; essencial para administradoras |
| **Categorias de despesa** (condomínio, IPTU, manutenção…) e saldo inicial de caixa | Categoria no lançamento |
| **Controle de chaves** (quem está com a chave de qual imóvel) | Registro simples de retirada/devolução |

### Ideias maiores (fase 3, validar demanda antes)
- **Vistoria de entrada e saída** com fotos por cômodo e laudo em PDF.
- **Ajuda com obrigações fiscais** (ex.: DIMOB para pessoa jurídica, informe de aluguéis recebidos para pessoa física). Exige validação com contador antes de qualquer promessa.
- **Cobrança digital** (boleto/Pix com aviso automático ao inquilino): envolve gateway de pagamento e custos, decisão do responsável.
