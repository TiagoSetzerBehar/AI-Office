# Especificação — Relatório semanal de status (CoFind)

Ferramenta Node: `report --business <id> [--now <ISO>] [--out <arquivo>]`. Lê só `office/businesses/<id>/tasks/*.json` (via `listTasks`), imprime Markdown em stdout (ou `--out`). Somente leitura. `--now` (padrão: relógio atual) existe para testes determinísticos. Idioma: pt-BR. Meta: leitura em ~2 minutos (máx. ~60 linhas; listas truncadas em 10 itens com "… +N").

## 1. Definições (campos reais da tarefa)
Campos usados: `id, title, project, parent, depth, assignee, created_by, status, requires_approval, external_action, revisions, approval{requested_at,decision}, created_at, updated_at, history[]`.
- **Aberta** = `status` fora de `done|rejected|cancelled`.
- **Entrada no status atual** (`since`) = `at` do último evento de `history` com `type=="status"` e `to==status`; se não existir (ex.: `pending`, `awaiting_approval` já criado), usa `created_at`.
- **Idade em dias** = `floor((now − instante) / 86400000)`. Datas em UTC, exibidas `AAAA-MM-DD`.
- Tarefa-mãe/filha: `parent` (id ou null).

## 2. Seções (nesta ordem)
1. **Cabeçalho**: `# Relatório semanal — <id> — <AAAA-MM-DD>` e linha de resumo: `Abertas: N | Concluídas (7 dias): N | Alertas: N`.
2. **Decisões do fundador** — tarefas `status=="awaiting_approval"`; colunas: id, título, aguardando há (dias desde `approval.requested_at`, senão `since`). Ordem: mais antiga primeiro. Vazio: "Nenhuma decisão pendente."
3. **Alertas** — resultado das regras da seção 3, ordenado por severidade (ALTA, MÉDIA) e depois por id. Vazio: "Nenhum alerta."
4. **Em andamento** — `status in_progress|changes_requested|review`; colunas: id, título, responsável, status, dias no status. Ordem: dias no status decrescente.
5. **Bloqueadas** — `status=="blocked"`; colunas: id, título, responsável, dias bloqueada, última `note` do evento de status que levou a `blocked` (ou "—").
6. **Pendentes (não iniciadas)** — `status=="pending"`; id, título, responsável, dias desde `created_at`.
7. **Concluídas nos últimos 7 dias** — `status=="done"` e `since >= now−7d`; id, título, data.
8. **Contagem por status** — uma linha: `pending N · in_progress N · …` para os 9 status (inclui zeros).
Seção sem itens mostra a frase de vazio; nunca é omitida. Tarefas `rejected|cancelled` só entram na contagem.

## 3. Regras de alerta (testáveis; limiares em constantes configuráveis)
| Cód. | Sev. | Condição (tarefa aberta, salvo indicação) | Mensagem |
|---|---|---|---|
| A1 | ALTA | `status=="awaiting_approval"` e idade ≥ 2 dias | `<id> aguarda decisão do fundador há N dias` |
| A2 | ALTA | `status=="blocked"` (qualquer idade) | `<id> bloqueada há N dias` |
| A3 | ALTA | `revisions >= 2` e `status != done` | `<id> atingiu limite de revisões; escalar` |
| A4 | MÉDIA | `status=="in_progress"` e dias no status ≥ 3 | `<id> parada em andamento há N dias` |
| A5 | MÉDIA | `status=="review"` e dias no status ≥ 2 | `<id> aguarda revisão há N dias` |
| A6 | MÉDIA | `status=="changes_requested"` e dias no status ≥ 2 | `<id> aguarda ajustes há N dias` |
| A7 | MÉDIA | `status=="pending"` e idade desde `created_at` ≥ 3 dias | `<id> não iniciada há N dias` |
| A8 | MÉDIA | tarefa-mãe aberta cujas filhas (`parent==id`) estão todas encerradas e há ≥ 1 filha | `<id>: subtarefas concluídas, mãe ainda aberta` |
Uma tarefa pode disparar mais de uma regra; cada disparo é uma linha. Limiares: A1=2, A4=3, A5=2, A6=2, A7=3 dias (inclusivo, ≥). **[suposição]** os limiares são pontos de partida a validar pelo fundador.

## 4. Casos-limite
Negócio sem tarefas: cabeçalho + todas as seções com frase de vazio, exit 0. Negócio inexistente: erro e exit 1. Campo ausente (`history` vazio) → usar `created_at`. Título longo: truncar em 60 caracteres com "…". Saída determinística (sem horário além de `--now`).

## 5. Exemplo de saída (`--now 2026-11-10T12:00:00Z`)
```
# Relatório semanal — cofind — 2026-11-10
Abertas: 3 | Concluídas (7 dias): 1 | Alertas: 3

## Decisões do fundador
| ID | Título | Aguardando há |
|---|---|---|
| T-0001 | Relatório semanal de status do CoFind | 3 dias |

## Alertas
- [ALTA] A1 T-0001 aguarda decisão do fundador há 3 dias
- [ALTA] A2 T-0005 bloqueada há 4 dias
- [MÉDIA] A4 T-0004 parada em andamento há 3 dias

## Em andamento
| ID | Título | Responsável | Status | Dias |
|---|---|---|---|---|
| T-0004 | Integrar cadastro | director-automation | in_progress | 3 |

## Bloqueadas
| ID | Título | Responsável | Dias | Motivo |
|---|---|---|---|---|
| T-0005 | Definir cidades | director-strategy | 4 | falta dado do fundador |

## Pendentes (não iniciadas)
Nenhuma.

## Concluídas nos últimos 7 dias
| ID | Título | Data |
|---|---|---|
| T-0002 | Especificar relatório | 2026-11-07 |

## Contagem por status
pending 0 · in_progress 1 · blocked 1 · review 0 · changes_requested 0 · awaiting_approval 1 · done 1 · rejected 0 · cancelled 0
```

## 6. Critérios de conclusão (para a implementação)
Testes automatizados cobrem: cada regra A1–A8 (limiar−1 não dispara, limiar dispara), cálculo de `since`, negócio vazio, ordenação, truncamento e isolamento por negócio.
