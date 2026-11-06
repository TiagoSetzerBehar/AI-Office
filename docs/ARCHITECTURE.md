# Arquitetura — Fase 1 (Fundação)

## Em linguagem simples
- **Você conversa com o Chief of Staff.** Ele é a própria sessão do Claude
  Code, configurada pelo `CLAUDE.md`. Também pode ser iniciado explicitamente
  com `claude --agent chief-of-staff`.
- **Os diretores são subagentes do Claude Code.** O CoS os chama com uma tarefa
  registrada. Cada diretor faz o trabalho, salva as entregas e devolve um
  relatório padronizado.
- **O "sistema nervoso" é um registro em arquivos locais** (`office/`). Ele é
  manipulado por uma CLI pequena (`src/cli.js`), que valida as regras: quem
  pode delegar a quem, estados válidos, aprovações, limites anti-loop e
  isolamento entre negócios.
- **Nada roda sozinho.** Os agentes só trabalham enquanto há uma sessão do
  Claude Code aberta. Isso é intencional nesta fase: custo zero além do Claude
  Pro, e controle total.

## Componentes

```
┌──────────── Sessão Claude Code (thread principal = Chief of Staff) ───────────┐
│  CLAUDE.md + .claude/agents/chief-of-staff.md                                  │
│        │ Agent tool (única camada de delegação; subagentes não aninham)        │
│        ├──► director-operations   (sonnet)                                      │
│        ├──► director-automation   (sonnet)                                      │
│        └──► director-strategy     (sonnet, + WebSearch/WebFetch)                │
│                    │                                                           │
│                    ▼ todos escrevem SÓ via CLI                                 │
│              src/cli.js  ──►  src/lib/{tasks,registry,states,verify}.js        │
│                                     │                                          │
│                                     ▼  src/lib/store.js (único ponto de I/O)   │
└──────────────────────────────────── office/ ───────────────────────────────────┘
   registry/  departments.json · agents.json · businesses.json   (global)
   businesses/<id>/  business.json · context.md · projects.json
                     tasks/T-xxxx.json · runs.jsonl · approvals.jsonl
                     deliverables/T-xxxx/…                        (isolado por negócio)
```

## Decisões e porquês

| Decisão | Por quê | Como evolui |
|---|---|---|
| Arquivos JSON/JSONL locais | Zero custo, auditável no git, suficiente para 1 usuário | Trocar `store.js` por SQLite → Postgres; o modelo de dados já é relacional (business → project → task → deliverable/approval/run) |
| CLI sem dependências (Node 20+) | Nada para instalar; testável com `node:test` | A mesma biblioteca vira o backend de uma API HTTP |
| CoS = thread principal | Subagentes do Claude Code não podem invocar subagentes | Com o Agent SDK, o CoS vira um processo orquestrador próprio |
| Colaboração entre departamentos via CoS | Evita loops e mantém o controle de custo/prioridade | Pode virar um barramento de mensagens com as mesmas regras |
| Mensagens ancoradas em tarefas (`thread`) | Histórico auditável; um só modelo serve dashboard, chat e escritório 3D | Tabela `messages` |
| Uma pasta por negócio + validação de caminhos | Isolamento real de dados e permissões por negócio | `business_id` em todas as tabelas + row-level security |
| Diretores em `sonnet` | Menor consumo do plano | Configurável por agente |
| Diretores planejados fora de `.claude/agents/` | Ficam documentados, mas não invocáveis | Ativação = mover o arquivo + mudar o status (com aprovação) |

## Como adicionar coisas sem reconstruir
- **Novo negócio:** copiar `office/templates/business/` e adicionar a entrada em `businesses.json`.
- **Novo diretor/departamento:** usar `docs/templates/director-template.md`, mudar o status para
  `active` em `departments.json` e `agents.json`, e adicionar `Agent(<id>)` às ferramentas do CoS.
- **Novo especialista:** adicionar ao `agents.json` com `role: specialist`, `department` e
  `status: active`, e criar `.claude/agents/<id>.md`. O diretor do departamento passa a poder
  delegar a ele; o CoS faz a invocação.
- **Nova ferramenta interna:** `src/tools/<nome>.js` + teste + comando na CLI (exemplo: `report`).

## Guardrails
Ver a tabela em `docs/PROTOCOL.md` §2. Resumo: transições validadas;
aprovação obrigatória para missões do fundador e ações externas; profundidade
de delegação ≤ 2; ≤ 5 subtarefas por tarefa; ≤ 10 tarefas abertas por agente;
≤ 2 rodadas de ajustes; entregas com SHA-256 conferidas por `verify`; agentes
não ativos não recebem tarefas.

**Limite honesto:** a CLI impede erros e desvios acidentais, mas **não é uma
fronteira de segurança**. Um agente com acesso a Bash poderia editar arquivos
diretamente. Para mitigar: as regras de permissão em
`docs/templates/settings.recommended.json` (bloqueiam `approve`/`reject` e a
edição manual de tarefas pelos agentes) e o `verify`, que detecta `done` sem
aprovação e entregas adulteradas. A segurança real virá com o backend (fase 3).
