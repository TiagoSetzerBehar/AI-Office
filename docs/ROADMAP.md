# Roadmap e dependências futuras

Princípio: cada fase só começa quando a anterior estiver sendo usada de verdade.
Nenhuma fase é necessária para a Fase 1 funcionar.

| Fase | Entrega | Depende de | Custo esperado |
|---|---|---|---|
| **1. Fundação** (atual) | Registro local, CLI, CoS + 3 diretores no Claude Code, demo | Claude Pro | já pago |
| **2. Operação real** | Usar no dia a dia; ativar especialistas sob demanda; diretores 4–6; primeiras missões de Estratégia com web | Claude Pro | já pago |
| **3. Backend** | Trocar `store.js` por SQLite (local) → Postgres (ex.: Supabase); API HTTP sobre `src/lib` | **banco de dados** | baixo/grátis no início |
| **4. Autonomia** | CoS e diretores rodando fora da sua máquina: tarefas agendadas e por evento, fila de jobs, notificações | **Claude Agent SDK** + **Claude API** (paga, por token) + **hospedagem** | variável: limitar com orçamento por tarefa |
| **5. Dashboard web** | Projetos, departamentos, tarefas, aprovações, histórico, multi-negócio | Fase 3 + hospedagem + autenticação | baixo |
| **6. App mobile** | Chat com o CoS, aprovações, notificações push, falar com diretores | Fases 3–5 + push | baixo/médio |
| **7. Voz** | Ligação com o CoS (fala ↔ texto, baixa latência) | Claude API + serviço de voz (STT/TTS ou realtime) | médio |
| **8. Escritório 3D** | Visualização navegável conectada aos eventos reais (tarefas, threads, runs) | Fases 3–5 (stream de eventos) | baixo (front-end) |

## O que depende de quê

- **Claude Agent SDK:** rodar o CoS e os diretores como processos próprios,
  fora do Claude Code interativo. Permite orquestração programática (inclusive
  diretores chamando especialistas diretamente), agendamentos e gatilhos. As
  definições em `.claude/agents/*.md` e o `docs/PROTOCOL.md` são reaproveitados
  como prompts de sistema.
- **Claude API:** necessária assim que algo rodar sem você no Claude Code
  (autonomia, app, voz). Cobrada por uso, separada do Claude Pro. Exigirá
  orçamento por tarefa/agente no registro.
- **Banco de dados:** necessário com múltiplos acessos simultâneos (app +
  agentes autônomos + dashboard), com autenticação e permissões por negócio. O
  modelo atual (negócio → projeto → tarefa → entrega/aprovação/execução/mensagem)
  já é o esquema relacional.
- **Hospedagem:** para os agentes funcionarem com seu computador desligado,
  para a API, o dashboard e o webhook de notificações.

## Por que a arquitetura atual já prepara isso
- Toda escrita passa pela biblioteca (`src/lib`), que vira o backend.
- Os eventos já são registrados (`history`, `thread`, `runs.jsonl`,
  `approvals.jsonl`): é o que o dashboard, o app e o escritório 3D vão exibir.
- Os estados `awaiting_approval` e as aprovações viram as notificações do app.
- O isolamento por negócio já existe no nível de dados e de regras.
