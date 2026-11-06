# Revisão de código — T-0005 (cofind) — 2ª revisão

**Veredito: PASS** (sem problemas bloqueantes; os 2 pontos importantes da 1ª revisão foram corrigidos)

## Como foi verificado
- `npm test`: 62 pass / 0 fail.
- `node src/cli.js verify --business cofind`: OK, 5 tarefas, nenhum problema; lista 2 versões substituídas (T-0003 status-report.js e seu teste, substituídas por T-0005), como esperado.
- Leitura de `git diff` (src/cli.js, src/lib/tasks.js, src/lib/verify.js, src/tools/status-report.js, tests/*) e dos arquivos novos.
- Teste manual: `report --out` com `deliverables/../tasks/x.md` e `docs/../src/x.md` foram recusados; nada foi criado.
- Skills `code-review` e `security-review` NÃO foram executadas; revisão manual equivalente.

## Conferido em especial
- `report --out`: só aceita `office/businesses/<mesmo negócio>/deliverables/` ou `docs/`; `..` é normalizado por `path.resolve`; outro negócio, registry, tasks/, runs, approvals, src/, .claude/ são recusados. Teste cobre os casos (9 caminhos ruins). Corrigido.
- `removeDeliverable` / `deliver --remove`: só o responsável (ou fundador), só `in_progress`, falha se não for entrega, grava evento `deliverable_removed`, usa a biblioteca. Teste cobre. Ok.
- `verify.js`: uma entrega alterada só vira "substituída" se existe registro mais novo do MESMO arquivo em OUTRA tarefa; a versão mais nova é checada no seu próprio laço, então se ela não confere vira problema (teste cobre "v3 sem registro"). Ok.
- `writeAutomations` agora usa `isInside` + `OfficeError`; docs/AUTOMATIONS.md saiu das entregas. Corrigido.

## Problemas
### Bloqueante
nenhum.

### Importante
nenhum.

### Sugestão
1. `src/lib/verify.js` (~linha 44): "substituída" é aceita se a versão mais nova confere, mesmo que o arquivo tenha sido adulterado antes de ser re-registrado por outra tarefa (a adulteração fica "lavada"). É inerente ao desenho; a lista de substituídas na saída do `verify` serve para o CoS conferir. Se quiser mais rigor, exigir que a tarefa nova esteja revisada/concluída.
2. `verify.js`: duas entregas do MESMO arquivo dentro da MESMA tarefa com hashes diferentes geram "alterada" mesmo sendo versão antiga (newer.task === t.id). Falso positivo raro; considerar tratar também esse caso.
3. `report --out` em `docs/` ainda pode sobrescrever docs existentes (ex.: docs/PROTOCOL.md). Opcional: recusar sobrescrever arquivo existente que não tenha o cabeçalho do relatório.
4. `assertNotOtherBusiness` não resolve symlinks (padrão preexistente).
