# Escritório 3D (protótipo)

- `office.template.html`: a cena (three.js via CDN) com o marcador `__DATA__`.
- `build.cjs`: lê o registro e as tarefas do CoFind e gera `office.html` com
  um retrato dos dados naquele momento:
  `node office/views/build.cjs . office/views/office.html`

**Status:** protótipo feito pelo Chief of Staff. **Ainda não revisado pelo Revisor
de Código.** Para virar automação oficial (atualização automática e vários
negócios), deve passar pelo departamento de Automação e pelo `code-reviewer`.
A barra mostra a etapa da tarefa atual (na fila 10%, trabalhando 50%, em
revisão 85%, esperando o fundador 92%, concluída 100%), não um percentual
medido de esforço.
