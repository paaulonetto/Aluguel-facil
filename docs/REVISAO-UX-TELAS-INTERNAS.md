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
