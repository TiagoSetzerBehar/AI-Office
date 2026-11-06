# Revisão de código — T-0005 (cofind)

**Veredito: PASS** (sem problemas bloqueantes)

## Como foi verificado
- `npm test`: 59 pass / 0 fail.
- Leitura de `git diff` (src/cli.js, src/lib/tasks.js, src/tools/status-report.js, tests/status-report.test.js) e dos arquivos novos (src/tools/automations.js, tests/automations.test.js, docs/AUTOMATIONS.md).
- Skills `code-review` (medium) e `security-review`: NÃO foram executadas; revisão manual equivalente (bugs, caminhos, isolamento, credenciais, execução de comandos, rede, dependências).
- Teste manual: `report --out office/businesses/cofind/../../registry/zz.md` é aceito (arquivo criado e removido por mim em seguida; registry confere limpo).

## Checklist
- Critérios de aceitação: ok (testes passam; `automations` lista as 2; `report --out` recusa outro negócio, com teste).
- Testes para o principal e casos-limite: ok.
- Sem dependências, rede ou APIs pagas: ok. Sem credenciais: ok. Sem execução de comandos: ok.
- Isolamento: `assertNotOtherBusiness` é a mesma regra de antes, apenas extraída; `resolveRepoFile` mantém o comportamento. Ok.

## Problemas
### Bloqueante
nenhum.

### Importante
1. `src/tools/status-report.js:~173-176` — `--out` (já era assim antes) aceita qualquer arquivo do repositório fora de `office/businesses/`: `office/registry/*.json` (só o fundador altera), `src/`, `.claude/agents/`, e também `office/businesses/<mesmo negócio>/tasks/*.json`, `runs.jsonl`, `approvals.jsonl`. Um `--out` errado sobrescreve esses arquivos e burla a regra "nunca editar tasks/ à mão". Correção sugerida: restringir `--out` a `office/businesses/<id>/deliverables/` (ou a `docs/`), ou recusar sobrescrever arquivos existentes que não sejam .md.
2. `docs/AUTOMATIONS.md` (entrega registrada com hash) mostra a vitrine como "pendente". Depois do `pass`, o arquivo gerado muda ("aprovada pelo revisor") e o hash registrado deixa de bater (`verify` aponta); re-registrar a entrega invalida o veredito (snapshot por hash). Correção sugerida: o CoS regenera e re-registra só depois do pass e aciona nova revisão curta, ou tirar docs/AUTOMATIONS.md da lista de entregas (é arquivo gerado).

### Sugestão
1. `src/lib/tasks.js:~246-249` — o comentário "Registra um arquivo como entrega verificável..." ficou solto acima de `assertNotOtherBusiness`; mover para `resolveRepoFile`.
2. `src/tools/automations.js:82` — usa `startsWith('..')` e lança `Error` comum; usar `isInside` e `OfficeError` (como em status-report). Hoje `--out` não é exposto na CLI, então o impacto é baixo.
3. `assertNotOtherBusiness` não resolve symlinks (padrão preexistente em todo o código); só relevante se alguém criar symlinks no repositório.
4. `tests/automations.test.js` "todo arquivo de src/tools" só compara contagem; comparar nomes dos arquivos com os ids/lista daria mensagem de erro melhor.
5. Teste do `--out` não cobre caminhos com `..` (ex.: `office/businesses/alpha/../beta/x.md`); a implementação trata (path.resolve), vale um caso.
