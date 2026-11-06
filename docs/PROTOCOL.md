# Protocolo de comunicação e delegação

Este documento é a "constituição operacional" dos agentes. Todo agente da AI
Office segue estas regras. A CLI (`npm run office -- ...`) faz valer as regras
que podem ser verificadas por código. As demais dependem das instruções dos agentes.

## 1. Hierarquia e canais

```
Fundador ──► Chief of Staff ──► Diretores ──► (futuro) Especialistas
   │                ▲                │
   └── fala direto ─┼────────────────┘   (permitido; o CoS é avisado)
                    └── colaboração entre departamentos passa pelo CoS
```

| Quem cria a tarefa | Para quem pode delegar                          |
|--------------------|-------------------------------------------------|
| `founder`          | qualquer agente ativo                           |
| `chief-of-staff`   | diretores (ou a si mesmo)                       |
| diretor            | especialistas **ativos** do próprio departamento |
| especialista       | ninguém                                         |

**Por que a colaboração entre departamentos passa pelo CoS?** Assim o CoS
controla prioridades e custo, e evita que dois diretores fiquem trocando
tarefas entre si sem fim. Um diretor que precisa de outro departamento escreve
o pedido em `pedidos_ao_cos` no relatório. O CoS decide e cria a tarefa.

**Limitação técnica (Claude Code):** subagentes não podem invocar outros
subagentes. Por isso:
- o CoS é a **thread principal** da sessão, e só ele invoca diretores;
- um diretor que queira usar um especialista pede ao CoS. O CoS invoca o
  especialista em nome do diretor, numa subtarefa criada pelo diretor.

## 2. Ciclo de vida da tarefa

```
pending ─► in_progress ─► review ─► done
               │  ▲          │  └─► awaiting_approval ─► done | rejected | changes_requested
               ▼  │          ▼                            (somente o fundador)
             blocked     changes_requested ─► in_progress
(pending, in_progress, blocked, changes_requested) ─► cancelled  (quem criou)
```

| Regra | Aplicada por |
|-------|--------------|
| Só o responsável inicia, entrega e bloqueia | CLI |
| Só quem criou a tarefa revisa (done / changes_requested) | CLI |
| `review` exige ao menos uma entrega registrada (arquivo + SHA-256) | CLI |
| Tarefa com ação externa ou criada pelo fundador exige aprovação do fundador | CLI |
| `done` exige todas as subtarefas encerradas | CLI |
| Profundidade máxima de delegação: 2 (missão → diretor → especialista) | CLI |
| Máx. 5 subtarefas por tarefa; máx. 10 tarefas abertas por agente | CLI |
| Máx. 2 rodadas de ajustes; na 3ª a tarefa é bloqueada e escalada | CLI |
| Dados/entregas de um negócio não podem ser usados em outro | CLI |
| `approve`/`reject` não executáveis por agentes | `.claude/settings.json` (deny) |
| Nenhuma ação externa sem aprovação | instruções + permissões |

## 3. Protocolo do Diretor (passo a passo)

Ao receber `negócio=<id>` e `tarefa=<T-xxxx>`:

1. `npm run office -- task show --business <id> --id <T-xxxx>`. Leia a tarefa,
   a tarefa-mãe e `office/businesses/<id>/context.md`.
2. `npm run office -- task move --business <id> --id <T-xxxx> --to in_progress --by <seu-id>`
3. Execute o trabalho. Se for impossível (falta de dado, fora do escopo), mova
   para `blocked` com `--note` explicando e pule para o passo 7.
4. Salve as entregas em `office/businesses/<id>/deliverables/<T-xxxx>/`
   (código interno pode ficar em `src/tools/` e `tests/`).
5. Registre cada entrega:
   `npm run office -- deliver --business <id> --id <T-xxxx> --agent <seu-id> --file <caminho> --summary "..."`
6. Registre a execução, de forma honesta:
   `npm run office -- run log --business <id> --task <T-xxxx> --agent <seu-id> --mode real --summary "..."`
   (`--mode simulated` se algo foi suposto/simulado em vez de executado).
7. `npm run office -- task move --business <id> --id <T-xxxx> --to review --by <seu-id>`
8. Responda **somente** com o relatório abaixo:

```
## RELATÓRIO DO DIRETOR
tarefa: T-xxxx
negócio: <id>
status_final: review | blocked
resumo: <3–5 linhas>
entregas:
- <caminho> — <o que é>
como_verificar: <comandos ou passos objetivos>
executado_vs_simulado: <o que foi real; o que foi suposto/simulado>
pedidos_ao_cos: <colaboração com outro departamento, especialista, aprovação — ou "nenhum">
riscos_e_pendencias: <ou "nenhum">
```

Regras do diretor:
- Não invente dados. Marque suposições como **[suposição]**.
- Não execute ações externas, nem instale dependências ou crie contas.
- Não altere o registro (`office/registry/`) nem as tarefas de outros agentes.
- Não edite JSON de tarefas à mão: use a CLI.
- Faça uma única passada, bem feita. Não fique em ciclos de autorrevisão.

## 4. Protocolo do Chief of Staff (missão completa)

1. Registrar a missão: `task create --assignee chief-of-staff --created-by founder`
   (fica `requires_approval` automaticamente).
2. `task move --to in_progress --by chief-of-staff`.
3. Criar 1+ subtarefas (`--parent`) para o(s) diretor(es) **estritamente necessários**.
4. Invocar cada diretor (subagente) com negócio + id da tarefa.
5. Verificar as entregas de verdade (abrir arquivos, rodar testes/comandos).
6. Aceitar (`--to done`) ou pedir ajustes (`--to changes_requested` + `task note`).
7. Consolidar um relatório da missão em `deliverables/<missão>/`, registrar
   com `deliver`, mover para `review` e então `approval request`.
8. Reportar ao fundador: resultado, como verificar, real vs. simulado, decisões pendentes.

## 4.1 Controle de qualidade (Automação)

```
diretor entrega (review) ─► CoS invoca code-reviewer ─► qa record pass ─► CoS: done
                                                   └─► qa record fail ─► CoS: changes_requested ─► diretor corrige ─► nova revisão
```
O revisor só confere; não altera código. O veredito fica preso ao SHA-256 das
entregas: qualquer mudança posterior exige nova revisão. Aplicado pela CLI
(`quality_gate` do departamento em `departments.json`).

## 5. Mensagens

Toda comunicação fica **ancorada numa tarefa** (`task note --from --to --body`),
para que o histórico seja auditável e possa no futuro alimentar o dashboard, o
chat do app e o escritório 3D sem mudança de modelo de dados.

## 6. Propostas de novos agentes ou departamentos

Agentes **não** criam funcionários nem departamentos. Para propor:
uma tarefa `--requires-approval` com a justificativa (problema, por que um
agente existente não resolve, custo esperado, definição sugerida). Só após
`approve` do fundador o arquivo é criado e o registro é atualizado.
