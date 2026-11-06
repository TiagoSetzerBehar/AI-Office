# AI Office

Empresa digital operada por agentes de IA. O fundador fala com um **Chief of
Staff** de IA, que delega a **diretores** de departamento (subagentes do
Claude Code), supervisiona, verifica e devolve resultados para aprovação.

**Fase 1 — Fundação:** tudo local, sem dependências, sem APIs pagas.

## Começar
Requisitos: Node 20+ e Claude Code.

```bash
npm test
```

```bash
npm run office -- registry
```

```bash
npm run office -- task list --business cofind
```

```bash
npm run office -- report --business cofind
```

Conversar com o Chief of Staff: abra o Claude Code nesta pasta. O `CLAUDE.md`
faz a sessão agir como CoS. Ou inicie explicitamente:

```bash
claude --agent chief-of-staff
```

Aprovar ou rejeitar (somente você, no seu terminal):

```bash
npm run office -- approval list --business cofind
```

```bash
npm run office -- approve --business cofind --id T-0001 --note "ok"
```

Ativar as regras de permissão recomendadas (bloqueiam os agentes de aprovar
ou de editar tarefas à mão):

```bash
cp docs/templates/settings.recommended.json .claude/settings.json
```

## Documentação
- [Visão](docs/VISION.md) · [Arquitetura](docs/ARCHITECTURE.md) · [Protocolo](docs/PROTOCOL.md)
- [Status: real / simulado / não implementado](docs/STATUS.md) · [Roadmap e dependências](docs/ROADMAP.md) · [Skills](docs/SKILLS.md)

## Estrutura
```
CLAUDE.md                 instruções da sessão (CoS)
.claude/agents/           chief-of-staff + 3 diretores ativos
office/registry/          departamentos, agentes, negócios
office/businesses/cofind/ dados isolados do CoFind (tarefas, entregas, logs)
office/agents-planned/    diretores de Finanças, Comercial, Marketing
office/templates/         modelo de novo negócio
src/                      CLI + biblioteca + ferramentas (report)
tests/                    node:test
docs/                     documentação e modelos
```
