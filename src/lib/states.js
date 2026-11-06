// Máquina de estados das tarefas e limites de segurança.

export const STATES = [
  'pending', // criada e atribuída, ainda não iniciada
  'in_progress', // em execução pelo responsável
  'blocked', // impedida (falta informação, dependência, limite atingido)
  'review', // entregue; aguardando revisão de quem delegou
  'changes_requested', // revisor pediu ajustes
  'awaiting_approval', // aguardando decisão do fundador
  'done', // concluída
  'rejected', // fundador rejeitou
  'cancelled', // cancelada
];

export const TERMINAL = new Set(['done', 'rejected', 'cancelled']);

// actor: quem pode executar a transição
//   assignee = responsável pela tarefa, reviewer = quem a criou, founder = só o fundador
export const TRANSITIONS = {
  pending: { in_progress: 'assignee', cancelled: 'reviewer' },
  in_progress: { review: 'assignee', blocked: 'assignee', cancelled: 'reviewer' },
  blocked: { in_progress: 'assignee', cancelled: 'reviewer' },
  review: {
    done: 'reviewer',
    changes_requested: 'reviewer',
    awaiting_approval: 'assignee_or_reviewer',
  },
  changes_requested: { in_progress: 'assignee', cancelled: 'reviewer' },
  awaiting_approval: { done: 'founder', rejected: 'founder', changes_requested: 'founder' },
  done: {},
  rejected: {},
  cancelled: {},
};

export const LIMITS = {
  MAX_DEPTH: 2, // missão (0) -> diretor (1) -> especialista (2)
  MAX_CHILDREN: 5, // subtarefas diretas por tarefa
  MAX_REVISIONS: 2, // rodadas de "changes_requested" antes de escalar ao fundador
  MAX_OPEN_TASKS_PER_AGENT: 10,
};
