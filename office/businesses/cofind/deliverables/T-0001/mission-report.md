# Relatório da missão T-0001 — Relatório semanal de status do CoFind

**Para:** Fundador · **De:** Chief of Staff · **Data:** 2026-11-06

## Resultado
Já existe um comando que gera, a partir dos dados reais do registro, um
relatório semanal de status que se lê em 2 minutos:

    npm run office -- report --business cofind

Ele mostra as decisões que dependem de você, os alertas operacionais (8 regras
objetivas, A1–A8), o que está em andamento, bloqueado ou pendente, o que foi
concluído nos últimos 7 dias e a contagem por status.

## Como foi feito (delegação real)
| Tarefa | Responsável | Entrega | Verificação do CoS |
|---|---|---|---|
| T-0002 Especificação | Diretor de Gestão & Operações | `deliverables/T-0002/spec.md` | Conferi os campos e eventos citados contra `src/lib/tasks.js` |
| T-0003 Implementação | Diretor de Automação & Tecnologia | `src/tools/status-report.js`, `tests/status-report.test.js`, `deliverables/T-0003/report-sample.md` | `npm test` 43/43; execução real; `--now` futuro dispara A4/A5; `verify` OK |

## Critérios de aceitação
- [x] Comando único gera o relatório a partir dos dados reais do registro
- [x] Mostra pendências de aprovação do fundador e alertas operacionais
- [x] Coberto por testes automatizados que passam (43/43)

## Real vs. simulado
- **Real:** os dois diretores rodaram como subagentes do Claude Code (modelo
  sonnet) e executaram a CLI, escreveram os arquivos, registraram entregas com
  SHA-256 e os testes passaram.
- **Diferença em relação ao uso normal:** os arquivos `.claude/agents/` foram
  criados no meio desta sessão, e o Claude Code só os carrega quando a sessão
  inicia. Por isso, os diretores foram invocados como subagentes genéricos
  recebendo o texto exato de sua definição. Numa nova sessão, eles são
  invocados pelo nome.
- **Simulado:** apenas a passagem do tempo nos testes (parâmetro `--now`).

## Decisões para você
1. **Aprovar esta missão:** `npm run office -- approve --business cofind --id T-0001`
2. **Limiares dos alertas** (suposições do Diretor de Operações): aguardando
   aprovação ≥ 2 dias, parada em andamento ≥ 3, em revisão ≥ 2, aguardando
   ajustes ≥ 2, não iniciada ≥ 3. Manter?
3. **Pendência menor:** `report --out` deveria recusar gravar dentro da pasta
   de outro negócio. Posso pedir a correção ao Diretor de Automação.
