// Operações sobre tarefas, execuções, entregas e aprovações de UM negócio.
// Todas as funções recebem o businessId e só leem/escrevem dentro da pasta dele.
import fs from 'node:fs';
import path from 'node:path';
import { businessDir, rootDir, dataDir, assertTaskId, assertId, isInside, OfficeError } from './paths.js';
import { readJSON, writeJSON, appendJSONL, readJSONL, listFiles, sha256File, now } from './store.js';
import {
  getBusiness,
  getAgent,
  assertActiveAgent,
  assertAgentAllowedInBusiness,
  assertCanDelegate,
  loadDepartments,
  FOUNDER,
  CHIEF_OF_STAFF,
} from './registry.js';
import { STATES, TERMINAL, TRANSITIONS, LIMITS } from './states.js';

const RUN_MODES = new Set(['real', 'simulated']);

function tasksDir(biz) {
  return path.join(businessDir(biz), 'tasks');
}
function taskFile(biz, id) {
  return path.join(tasksDir(biz), `${assertTaskId(id)}.json`);
}

export function loadTask(biz, id) {
  getBusiness(biz);
  const file = taskFile(biz, id);
  if (!fs.existsSync(file)) throw new OfficeError(`tarefa ${id} não existe no negócio "${biz}"`);
  return readJSON(file);
}

function saveTask(biz, task) {
  task.updated_at = now();
  writeJSON(taskFile(biz, task.id), task);
}

export function listTasks(biz, filter = {}) {
  getBusiness(biz);
  return listFiles(tasksDir(biz), '.json')
    .map((f) => readJSON(path.join(tasksDir(biz), f)))
    .filter((t) => !filter.status || t.status === filter.status)
    .filter((t) => !filter.assignee || t.assignee === filter.assignee)
    .filter((t) => !filter.project || t.project === filter.project);
}

function nextTaskId(biz) {
  const nums = listFiles(tasksDir(biz), '.json').map((f) => parseInt(f.slice(2), 10));
  const n = (nums.length ? Math.max(...nums) : 0) + 1;
  return `T-${String(n).padStart(4, '0')}`;
}

function event(task, by, type, data = {}) {
  task.history.push({ at: now(), by, type, ...data });
}

// ---------------------------------------------------------------- projetos

export function listProjects(biz) {
  getBusiness(biz);
  return readJSON(path.join(businessDir(biz), 'projects.json'), { projects: [] }).projects;
}

export function createProject(biz, { id, title, owner, goal = '' }) {
  getBusiness(biz);
  assertId(id, 'project');
  if (!title) throw new OfficeError('projeto precisa de --title');
  assertActiveAgent(owner);
  const file = path.join(businessDir(biz), 'projects.json');
  const data = readJSON(file, { projects: [] });
  if (data.projects.some((p) => p.id === id)) throw new OfficeError(`projeto "${id}" já existe`);
  const project = { id, title, goal, owner, status: 'active', created_at: now() };
  data.projects.push(project);
  writeJSON(file, data);
  return project;
}

// ---------------------------------------------------------------- tarefas

export function createTask(biz, opts) {
  const business = getBusiness(biz);
  const { title, assignee, createdBy, parent, project, description = '', acceptance = [] } = opts;
  if (!title) throw new OfficeError('tarefa precisa de --title');
  const creator = assertActiveAgent(createdBy);
  const target = assertActiveAgent(assignee);
  assertAgentAllowedInBusiness(target, business);
  assertCanDelegate(creator, target);

  let depth = 0;
  if (parent) {
    const p = loadTask(biz, parent); // garante que o pai pertence ao MESMO negócio
    if (TERMINAL.has(p.status)) throw new OfficeError(`tarefa-mãe ${parent} já está encerrada`);
    if (creator.id !== FOUNDER && p.assignee !== creator.id) {
      throw new OfficeError(`só o responsável por ${parent} (${p.assignee}) pode dividi-la em subtarefas`);
    }
    depth = p.depth + 1;
    if (depth > LIMITS.MAX_DEPTH) {
      throw new OfficeError(`profundidade máxima de delegação (${LIMITS.MAX_DEPTH}) atingida`);
    }
    const siblings = listTasks(biz).filter((t) => t.parent === parent);
    if (siblings.length >= LIMITS.MAX_CHILDREN) {
      throw new OfficeError(`limite de ${LIMITS.MAX_CHILDREN} subtarefas por tarefa atingido em ${parent}`);
    }
  }
  if (project && !listProjects(biz).some((p) => p.id === project)) {
    throw new OfficeError(`projeto "${project}" não existe no negócio "${biz}"`);
  }
  const open = listTasks(biz, { assignee }).filter((t) => !TERMINAL.has(t.status));
  if (open.length >= LIMITS.MAX_OPEN_TASKS_PER_AGENT) {
    throw new OfficeError(`${assignee} já tem ${open.length} tarefas abertas (limite ${LIMITS.MAX_OPEN_TASKS_PER_AGENT})`);
  }

  const external = Boolean(opts.external);
  const task = {
    id: nextTaskId(biz),
    business: biz,
    project: project || null,
    parent: parent || null,
    depth,
    title,
    description,
    acceptance_criteria: Array.isArray(acceptance) ? acceptance : [acceptance],
    assignee,
    created_by: createdBy,
    status: 'pending',
    external_action: external,
    // ações externas (publicar, enviar, gastar, alterar sistemas) SEMPRE exigem aprovação
    requires_approval: external || Boolean(opts.requiresApproval) || createdBy === FOUNDER,
    revisions: 0,
    // revisor obrigatório do departamento do responsável, fixado na criação
    quality_gate: qualityGateFor(assignee),
    quality_checks: [],
    deliverables: [],
    thread: [],
    approval: null,
    history: [],
    created_at: now(),
    updated_at: now(),
  };
  event(task, createdBy, 'created', { assignee });
  saveTask(biz, task);
  return task;
}

function resolveActor(task, actorKind, by) {
  if (by === FOUNDER) return true; // o fundador pode tudo, exceto pular a máquina de estados
  switch (actorKind) {
    case 'assignee':
      return by === task.assignee;
    case 'reviewer':
      return by === task.created_by;
    case 'assignee_or_reviewer':
      return by === task.assignee || by === task.created_by;
    case 'founder':
      return false;
    default:
      return false;
  }
}

export function moveTask(biz, id, to, by, note = '') {
  if (!STATES.includes(to)) throw new OfficeError(`estado inválido: ${to}`);
  assertActiveAgent(by);
  const task = loadTask(biz, id);
  const allowed = TRANSITIONS[task.status];
  if (!(to in allowed)) {
    throw new OfficeError(
      `transição inválida ${task.status} -> ${to}. Permitidas: ${Object.keys(allowed).join(', ') || 'nenhuma'}`
    );
  }
  const actorKind = allowed[to];
  if (actorKind === 'founder' && by !== FOUNDER) {
    throw new OfficeError('somente o fundador decide tarefas em awaiting_approval (use approve/reject)');
  }
  if (!resolveActor(task, actorKind, by)) {
    throw new OfficeError(`${by} não pode mover ${id} para ${to} (exige: ${actorKind})`);
  }
  if (to === 'review' && task.deliverables.length === 0) {
    throw new OfficeError('não há entregas registradas: use "deliver" antes de enviar para revisão');
  }
  if (to === 'done' || to === 'awaiting_approval') {
    const qa = qualityStatus(task);
    if (!qa.ok) throw new OfficeError(`controle de qualidade pendente em ${id}: ${qa.reason}`);
  }
  if (to === 'done') {
    if (task.requires_approval && task.status !== 'awaiting_approval') {
      throw new OfficeError('esta tarefa exige aprovação do fundador: mova para awaiting_approval');
    }
    const openChildren = listTasks(biz).filter((t) => t.parent === id && !TERMINAL.has(t.status));
    if (openChildren.length) {
      throw new OfficeError(`subtarefas abertas: ${openChildren.map((t) => t.id).join(', ')}`);
    }
  }
  if (to === 'changes_requested') {
    if (task.revisions >= LIMITS.MAX_REVISIONS) {
      task.status = 'blocked';
      event(task, by, 'revision_limit', { note: 'limite de revisões atingido; escalar ao fundador' });
      saveTask(biz, task);
      throw new OfficeError(
        `limite de ${LIMITS.MAX_REVISIONS} revisões atingido; tarefa bloqueada e escalada ao fundador`
      );
    }
    task.revisions += 1;
  }
  const from = task.status;
  task.status = to;
  event(task, by, 'status', { from, to, note });
  saveTask(biz, task);
  return task;
}

export function addNote(biz, id, { from, to = null, body }) {
  if (!body) throw new OfficeError('mensagem vazia');
  assertActiveAgent(from);
  if (to) assertActiveAgent(to);
  const task = loadTask(biz, id);
  const msg = { at: now(), from, to, body };
  task.thread.push(msg);
  saveTask(biz, task);
  return msg;
}

// ---------------------------------------------------------------- execuções

export function logRun(biz, { task, agent, action, summary, mode }) {
  getBusiness(biz);
  if (!RUN_MODES.has(mode)) throw new OfficeError('--mode deve ser "real" ou "simulated"');
  if (!summary) throw new OfficeError('registro de execução precisa de --summary');
  assertActiveAgent(agent);
  if (task) loadTask(biz, task);
  const entry = { at: now(), business: biz, task: task || null, agent, action: action || 'work', mode, summary };
  appendJSONL(path.join(businessDir(biz), 'runs.jsonl'), entry);
  return entry;
}

export function listRuns(biz) {
  getBusiness(biz);
  return readJSONL(path.join(businessDir(biz), 'runs.jsonl'));
}

// ---------------------------------------------------------------- entregas

/** Isolamento: recusa caminhos dentro da pasta de OUTRO negócio. */
export function assertNotOtherBusiness(biz, abs, label = 'entrega') {
  const businessesRoot = path.join(dataDir(), 'businesses');
  if (isInside(businessesRoot, abs) && !isInside(businessDir(biz), abs)) {
    throw new OfficeError(`a ${label} pertence a outro negócio: dados de negócios são isolados`);
  }
}

/**
 * Registra um arquivo como entrega verificável (caminho + hash SHA-256).
 * O arquivo deve estar no repositório e NÃO pode estar na pasta de outro negócio.
 */
function resolveRepoFile(biz, file, label = 'entrega') {
  if (!file || file === true) throw new OfficeError(`${label} precisa de --file`);
  const abs = path.resolve(rootDir(), file);
  if (!isInside(rootDir(), abs)) throw new OfficeError(`a ${label} deve estar dentro do repositório`);
  assertNotOtherBusiness(biz, abs, label);
  if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) throw new OfficeError(`arquivo não existe: ${file}`);
  return { abs, rel: path.relative(rootDir(), abs).split(path.sep).join('/') };
}

export function deliver(biz, id, { agent, file, summary }) {
  assertActiveAgent(agent);
  const task = loadTask(biz, id);
  if (agent !== task.assignee && agent !== FOUNDER) {
    throw new OfficeError(`só o responsável (${task.assignee}) registra entregas em ${id}`);
  }
  const { abs, rel } = resolveRepoFile(biz, file);
  const item = { path: rel, sha256: sha256File(abs), summary: summary || '', by: agent, at: now() };
  task.deliverables = task.deliverables.filter((d) => d.path !== rel).concat(item);
  event(task, agent, 'deliverable', { path: rel });
  saveTask(biz, task);
  return item;
}

/** Remove uma entrega registrada (ex.: arquivo gerado). Só o responsável, com a tarefa em in_progress. */
export function removeDeliverable(biz, id, { agent, file }) {
  assertActiveAgent(agent);
  const task = loadTask(biz, id);
  if (agent !== task.assignee && agent !== FOUNDER) {
    throw new OfficeError(`só o responsável (${task.assignee}) remove entregas de ${id}`);
  }
  if (task.status !== 'in_progress') {
    throw new OfficeError(`entregas só são removidas com a tarefa em "in_progress" (está ${task.status})`);
  }
  if (!file || file === true) throw new OfficeError('remoção precisa de --file');
  const rel = path.relative(rootDir(), path.resolve(rootDir(), file)).split(path.sep).join('/');
  const item = task.deliverables.find((d) => d.path === rel);
  if (!item) throw new OfficeError(`${rel} não é entrega de ${id}`);
  task.deliverables = task.deliverables.filter((d) => d.path !== rel);
  event(task, agent, 'deliverable_removed', { path: rel });
  saveTask(biz, task);
  return item;
}

// ---------------------------------------------------------------- controle de qualidade

/** Agente revisor obrigatório do departamento (ex.: code-reviewer em Automação), ou null. */
export function qualityGateFor(agentId) {
  const agent = getAgent(agentId);
  if (!agent.department) return null;
  const dep = loadDepartments().find((d) => d.id === agent.department);
  return dep?.quality_gate || null;
}

const snapshot = (task) => task.deliverables.map((d) => `${d.path}:${d.sha256}`).sort().join('|');

/** Situação do controle de qualidade: { required, ok, reason }. */
export function qualityStatus(task) {
  if (!task.quality_gate) return { required: false, ok: true, reason: 'sem revisor obrigatório' };
  const last = (task.quality_checks || []).at(-1);
  if (!last) return { required: true, ok: false, reason: `falta revisão de ${task.quality_gate}` };
  if (last.verdict !== 'pass') return { required: true, ok: false, reason: `reprovada por ${last.by}` };
  if (last.snapshot !== snapshot(task)) {
    return { required: true, ok: false, reason: 'entregas mudaram depois da revisão; revisar de novo' };
  }
  return { required: true, ok: true, reason: `aprovada por ${last.by}` };
}

/**
 * O revisor registra o veredito sobre as entregas atuais de uma tarefa em "review".
 * O veredito fica preso ao hash das entregas: se mudarem, a revisão perde a validade.
 */
export function recordQualityCheck(biz, id, { by, verdict, file, summary = '' }) {
  assertActiveAgent(by);
  const task = loadTask(biz, id);
  if (!task.quality_gate) throw new OfficeError(`${id} não exige revisão de qualidade`);
  if (by !== task.quality_gate) throw new OfficeError(`somente ${task.quality_gate} registra a revisão de ${id}`);
  if (task.status !== 'review') throw new OfficeError(`revisão só é registrada com a tarefa em "review" (está ${task.status})`);
  if (!['pass', 'fail'].includes(verdict)) throw new OfficeError('--verdict deve ser pass ou fail');
  const { abs, rel } = resolveRepoFile(biz, file, 'relatório de revisão');
  const check = {
    at: now(), by, verdict, summary,
    report: { path: rel, sha256: sha256File(abs) },
    snapshot: snapshot(task),
  };
  task.quality_checks = (task.quality_checks || []).concat(check);
  event(task, by, 'quality_check', { verdict, report: rel });
  saveTask(biz, task);
  return check;
}

// ---------------------------------------------------------------- aprovações

export function requestApproval(biz, id, { by, summary }) {
  const task = moveTask(biz, id, 'awaiting_approval', by, summary);
  task.approval = { requested_by: by, requested_at: now(), summary: summary || '', decision: null };
  saveTask(biz, task);
  appendJSONL(path.join(businessDir(biz), 'approvals.jsonl'), {
    at: now(), task: id, type: 'requested', by, summary: summary || '',
  });
  return task;
}

const DECISIONS = { approved: 'done', rejected: 'rejected', changes_requested: 'changes_requested' };

/**
 * Registra a decisão do fundador. Duas formas:
 * - o próprio fundador executa o comando (recordedBy omitido);
 * - o fundador decide no chat e o Chief of Staff registra em seu nome
 *   (recordedBy = chief-of-staff, channel = chat, quote = palavras exatas do fundador).
 * Em ambos os casos a decisão é do fundador; quem registrou fica auditado.
 */
export function decide(biz, id, { decision, note = '', recordedBy = FOUNDER, channel = 'cli', quote = '' }) {
  if (!(decision in DECISIONS)) throw new OfficeError('decisão: approved | rejected | changes_requested');
  if (recordedBy !== FOUNDER) {
    if (recordedBy !== CHIEF_OF_STAFF) {
      throw new OfficeError('somente o fundador ou o Chief of Staff (em nome dele) registram decisões');
    }
    if (!quote || quote === true) {
      throw new OfficeError('registro em nome do fundador exige --quote com as palavras exatas dele');
    }
  }
  const task = moveTask(biz, id, DECISIONS[decision], FOUNDER, note);
  task.approval = {
    ...(task.approval || {}), decision, decided_by: FOUNDER, decided_at: now(), note,
    recorded_by: recordedBy, channel, quote: quote || null,
  };
  saveTask(biz, task);
  appendJSONL(path.join(businessDir(biz), 'approvals.jsonl'), {
    at: now(), task: id, type: 'decision', decision, by: FOUNDER,
    recorded_by: recordedBy, channel, quote: quote || null, note,
  });
  return task;
}

export function pendingApprovals(biz) {
  return listTasks(biz, { status: 'awaiting_approval' });
}

export { getAgent };
