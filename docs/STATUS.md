# Status da implementação — o que é real, simulado e inexistente

_Atualizado em 2026-11-06 (fim da Fase 1)._

## ✅ Executado de verdade
| Item | Evidência |
|---|---|
| Registro de 6 departamentos (3 ativos, 3 planejados) e 8 agentes | `npm run office -- registry` |
| CLI de tarefas, estados, delegação, entregas, execuções, aprovações | `npm run office -- help` |
| Guardrails aplicados por código (delegação, profundidade, limites, aprovação, isolamento) | `npm test` → 43 testes passando |
| Isolamento entre negócios (pastas, validação de ids/caminhos, recusa de referências cruzadas) | testes "negócios são isolados" |
| Verificação de integridade com SHA-256 | `npm run office -- verify --business cofind` |
| **Demonstração:** missão T-0001 → CoS delegou a 2 diretores (T-0002, T-0003) → subagentes reais executaram, entregaram e registraram → CoS verificou e enviou para aprovação | `task list`, `run list`, `deliverables/T-000{1,2,3}/` |
| Ferramenta real produzida pelos agentes: `report` (relatório semanal) | `npm run office -- report --business cofind` |

## ⚠️ Diferenças e simulações (declaradas)
- **Forma de invocação dos diretores na demo:** como os arquivos
  `.claude/agents/*.md` foram criados durante a sessão, e o Claude Code só os
  carrega na inicialização, os diretores foram executados como subagentes
  genéricos (`general-purpose`, modelo `sonnet`) recebendo **o texto exato** da
  sua definição. O trabalho foi real; só o mecanismo de carregamento foi
  diferente. Em uma sessão nova, são invocados pelo nome.
- **O CoS da demo** foi a própria sessão principal seguindo o `CLAUDE.md`, que
  é exatamente o desenho da arquitetura.
- **Tempo** nos testes do relatório é simulado com `--now`.
- **O `.claude/settings.json` não foi criado:** a escrita desse arquivo, que
  altera as permissões do próprio agente, foi bloqueada pelo sistema de
  permissões, de forma correta. As regras recomendadas estão em
  `docs/templates/settings.recommended.json`; ative-as copiando o arquivo (veja o README).

## ❌ Ainda não implementado
- Execução autônoma (agendada ou por evento) e agentes 24/7.
- Especialistas (nenhum ativo; o mecanismo de delegação a eles existe e está testado).
- Diretores de Finanças, Comercial e Marketing (definidos, não ativos).
- Uso da busca na web pelo Diretor de Estratégia (configurado, mas não exercitado na demo).
- Banco de dados, API, autenticação, dashboard, app mobile, voz, escritório 3D.
- Memória de conversa do CoS entre sessões além do que está nos arquivos
  (`context.md`, tarefas, threads).
- Integrações externas (e-mail, CRM, calendário, pagamentos): nenhuma; todas exigirão aprovação.

## Pendências conhecidas
- `report --out` deveria recusar caminhos na pasta de outro negócio (anotado em T-0003).
- Limiares dos alertas A1–A8 são suposições, aguardando a validação do fundador.
- Concorrência: duas sessões gravando ao mesmo tempo podem gerar ids
  duplicados (aceitável com um usuário; resolvido com o banco de dados).
