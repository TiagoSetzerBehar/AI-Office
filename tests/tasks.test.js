import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { sandbox } from './helpers.js';
import * as T from '../src/lib/tasks.js';
import { verifyBusiness } from '../src/lib/verify.js';
import { run, parseArgs } from '../src/cli.js';

let sb;
beforeEach(() => { sb = sandbox(); });
afterEach(() => sb.cleanup());

function mission(biz = 'alpha') {
  return T.createTask(biz, { title: 'Missão', assignee: 'chief-of-staff', createdBy: 'founder' });
}
function delegate(parent, assignee = 'director-operations', biz = 'alpha') {
  return T.createTask(biz, { title: 'Sub', assignee, createdBy: 'chief-of-staff', parent: parent.id });
}
function deliverFile(task, biz = 'alpha', agent = task.assignee) {
  const rel = sb.write(`office/businesses/${biz}/deliverables/${task.id}/out.md`, `resultado ${task.id}`);
  return T.deliver(biz, task.id, { agent, file: rel, summary: 'ok' });
}

// ------------------------------------------------------------ criação e delegação

test('missão do fundador exige aprovação e tem profundidade 0', () => {
  const m = mission();
  assert.equal(m.id, 'T-0001');
  assert.equal(m.depth, 0);
  assert.equal(m.requires_approval, true);
  assert.equal(m.status, 'pending');
});

test('CoS delega a diretor; ids são sequenciais por negócio', () => {
  const m = mission();
  const s = delegate(m);
  assert.equal(s.id, 'T-0002');
  assert.equal(s.depth, 1);
  assert.equal(s.parent, 'T-0001');
  assert.equal(mission('beta').id, 'T-0001'); // numeração independente
});

test('diretor não delega para diretor de outro departamento', () => {
  const s = delegate(mission());
  assert.throws(
    () => T.createTask('alpha', { title: 'x', assignee: 'director-automation', createdBy: 'director-operations', parent: s.id }),
    /delegação não permitida.*Chief of Staff/
  );
});

test('diretor delega a especialista ativo do próprio departamento', () => {
  const s = delegate(mission());
  const sp = T.createTask('alpha', { title: 'x', assignee: 'ops-analyst', createdBy: 'director-operations', parent: s.id });
  assert.equal(sp.depth, 2);
});

test('diretor não delega a especialista de outro departamento', () => {
  const s = delegate(mission());
  assert.throws(
    () => T.createTask('alpha', { title: 'x', assignee: 'auto-dev', createdBy: 'director-operations', parent: s.id }),
    /delegação não permitida/
  );
});

test('agentes não ativos (planejados/propostos) não recebem tarefas', () => {
  const m = mission();
  assert.throws(() => delegate(m, 'director-finance'), /não está ativo/);
  const s = delegate(m);
  assert.throws(
    () => T.createTask('alpha', { title: 'x', assignee: 'ops-proposed', createdBy: 'director-operations', parent: s.id }),
    /não está ativo/
  );
});

test('especialista não delega e a profundidade máxima é respeitada', () => {
  const s = delegate(mission());
  const sp = T.createTask('alpha', { title: 'x', assignee: 'ops-analyst', createdBy: 'director-operations', parent: s.id });
  assert.throws(
    () => T.createTask('alpha', { title: 'y', assignee: 'ops-analyst', createdBy: 'ops-analyst', parent: sp.id }),
    /profundidade máxima/
  );
});

test('só o responsável pela tarefa-mãe pode dividi-la', () => {
  const s = delegate(mission());
  assert.throws(
    () => T.createTask('alpha', { title: 'x', assignee: 'director-automation', createdBy: 'chief-of-staff', parent: s.id }),
    /só o responsável/
  );
});

test('limite de subtarefas por tarefa', () => {
  const m = mission();
  for (let i = 0; i < 5; i++) delegate(m, ['director-operations', 'director-automation', 'director-strategy'][i % 3]);
  assert.throws(() => delegate(m), /limite de 5 subtarefas/);
});

test('departamento desabilitado no negócio não recebe tarefas', () => {
  const m = mission('beta'); // beta só tem "strategy"
  assert.throws(() => delegate(m, 'director-operations', 'beta'), /não está habilitado/);
  assert.equal(delegate(m, 'director-strategy', 'beta').depth, 1);
});

// ------------------------------------------------------------ estados

test('ciclo completo: diretor entrega, CoS aceita, fundador aprova a missão', () => {
  const m = mission();
  T.moveTask('alpha', m.id, 'in_progress', 'chief-of-staff');
  const s = delegate(m);
  T.moveTask('alpha', s.id, 'in_progress', 'director-operations');
  assert.throws(() => T.moveTask('alpha', s.id, 'review', 'director-operations'), /não há entregas/);
  deliverFile(s);
  T.moveTask('alpha', s.id, 'review', 'director-operations');
  assert.throws(() => T.moveTask('alpha', s.id, 'done', 'director-operations'), /não pode mover/);
  T.moveTask('alpha', s.id, 'done', 'chief-of-staff');

  deliverFile(m);
  T.moveTask('alpha', m.id, 'review', 'chief-of-staff');
  assert.throws(() => T.moveTask('alpha', m.id, 'done', 'founder'), /exige aprovação/);
  T.requestApproval('alpha', m.id, { by: 'chief-of-staff', summary: 'pronto' });
  assert.throws(() => T.moveTask('alpha', m.id, 'done', 'chief-of-staff'), /somente o fundador/);
  const done = T.decide('alpha', m.id, { decision: 'approved', note: 'ok' });
  assert.equal(done.status, 'done');
  assert.equal(done.approval.decided_by, 'founder');
  assert.equal(verifyBusiness('alpha').ok, true);
});

test('transições inválidas são recusadas', () => {
  const s = delegate(mission());
  assert.throws(() => T.moveTask('alpha', s.id, 'done', 'chief-of-staff'), /transição inválida pending -> done/);
  assert.throws(() => T.moveTask('alpha', s.id, 'voando', 'chief-of-staff'), /estado inválido/);
});

test('missão não fecha com subtarefas abertas', () => {
  const m = mission();
  T.moveTask('alpha', m.id, 'in_progress', 'chief-of-staff');
  delegate(m);
  deliverFile(m);
  T.moveTask('alpha', m.id, 'review', 'chief-of-staff');
  T.requestApproval('alpha', m.id, { by: 'chief-of-staff', summary: 'x' });
  assert.throws(() => T.decide('alpha', m.id, { decision: 'approved' }), /subtarefas abertas/);
});

test('limite de revisões bloqueia e escala ao fundador', () => {
  const s = delegate(mission());
  T.moveTask('alpha', s.id, 'in_progress', 'director-operations');
  deliverFile(s);
  for (let i = 0; i < 2; i++) {
    T.moveTask('alpha', s.id, 'review', 'director-operations');
    T.moveTask('alpha', s.id, 'changes_requested', 'chief-of-staff');
    T.moveTask('alpha', s.id, 'in_progress', 'director-operations');
  }
  T.moveTask('alpha', s.id, 'review', 'director-operations');
  assert.throws(() => T.moveTask('alpha', s.id, 'changes_requested', 'chief-of-staff'), /limite de 2 revisões/);
  assert.equal(T.loadTask('alpha', s.id).status, 'blocked');
});

test('ação externa sempre exige aprovação, mesmo criada pelo CoS', () => {
  const m = mission();
  const s = T.createTask('alpha', {
    title: 'Enviar e-mail', assignee: 'director-operations', createdBy: 'chief-of-staff', parent: m.id, external: true,
  });
  assert.equal(s.requires_approval, true);
  T.moveTask('alpha', s.id, 'in_progress', 'director-operations');
  deliverFile(s);
  T.moveTask('alpha', s.id, 'review', 'director-operations');
  assert.throws(() => T.moveTask('alpha', s.id, 'done', 'chief-of-staff'), /exige aprovação/);
});

// ------------------------------------------------------------ isolamento

test('negócios são isolados: tarefa-mãe, entregas e caminhos', () => {
  const ma = mission('alpha');
  mission('beta');
  // tarefa-mãe de outro negócio não é encontrada
  assert.throws(
    () => T.createTask('beta', { title: 'x', assignee: 'director-strategy', createdBy: 'chief-of-staff', parent: 'T-0002' }),
    /não existe no negócio "beta"/
  );
  // entrega apontando para a pasta de outro negócio é recusada
  const rel = sb.write('office/businesses/beta/deliverables/T-0001/segredo.md', 'dados de beta');
  assert.throws(() => T.deliver('alpha', ma.id, { agent: 'chief-of-staff', file: rel }), /outro negócio/);
  // path traversal / fora do repositório
  assert.throws(() => T.deliver('alpha', ma.id, { agent: 'chief-of-staff', file: '../../etc/passwd' }), /dentro do repositório/);
  assert.throws(() => T.listTasks('../alpha'), /business inválido/);
  assert.throws(() => T.listTasks('gamma'), /não registrado/);
});

test('verify detecta entrega alterada após o registro', () => {
  const m = mission();
  const d = deliverFile(m);
  fs.writeFileSync(path.join(sb.root, d.path), 'adulterado');
  const r = verifyBusiness('alpha');
  assert.equal(r.ok, false);
  assert.match(r.problems[0], /alterada após registro/);
});

test('verify detecta "done" sem aprovação do fundador (edição manual)', () => {
  const m = mission();
  const file = path.join(sb.data, 'businesses', 'alpha', 'tasks', `${m.id}.json`);
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  raw.status = 'done';
  fs.writeFileSync(file, JSON.stringify(raw));
  assert.match(verifyBusiness('alpha').problems.join(), /sem aprovação registrada/);
});

// ------------------------------------------------------------ execuções e mensagens

test('run log exige modo real|simulated e tarefa do mesmo negócio', () => {
  const m = mission();
  assert.throws(() => T.logRun('alpha', { task: m.id, agent: 'chief-of-staff', mode: 'talvez', summary: 'x' }), /real.*simulated/);
  T.logRun('alpha', { task: m.id, agent: 'chief-of-staff', mode: 'simulated', summary: 'teste' });
  assert.equal(T.listRuns('alpha')[0].mode, 'simulated');
  assert.equal(T.listRuns('beta').length, 0);
});

test('mensagens ficam ancoradas na tarefa', () => {
  const s = delegate(mission());
  T.addNote('alpha', s.id, { from: 'director-operations', to: 'chief-of-staff', body: 'preciso de apoio de automação' });
  assert.equal(T.loadTask('alpha', s.id).thread[0].to, 'chief-of-staff');
  assert.throws(() => T.addNote('alpha', s.id, { from: 'fantasma', body: 'oi' }), /desconhecido/);
});

// ------------------------------------------------------------ CLI

test('CLI: parseArgs repete flags e aceita booleanos', () => {
  const { positional, flags } = parseArgs(['task', 'create', '--acceptance', 'a', '--acceptance', 'b', '--external']);
  assert.deepEqual(positional, ['task', 'create']);
  assert.deepEqual(flags.acceptance, ['a', 'b']);
  assert.equal(flags.external, true);
});

test('CLI: fluxo básico e erros legíveis', () => {
  assert.match(run(['task', 'create', '--business', 'alpha', '--title', 'M', '--assignee', 'chief-of-staff', '--created-by', 'founder']), /T-0001/);
  assert.match(run(['inbox', '--business', 'alpha', '--agent', 'chief-of-staff']), /T-0001/);
  assert.match(run(['registry']), /director-finance \(director, planned\)/);
  assert.throws(() => run(['task', 'create', '--business', 'alpha']), /faltando --title/);
  assert.match(run(['verify', '--business', 'alpha']), /^OK/);
});

// ------------------------------------------------------------ controle de qualidade (Automação)

function automationTaskInReview() {
  const m = mission();
  const s = delegate(m, 'director-automation');
  assert.equal(s.quality_gate, 'code-reviewer');
  T.moveTask('alpha', s.id, 'in_progress', 'director-automation');
  deliverFile(s);
  T.moveTask('alpha', s.id, 'review', 'director-automation');
  return s;
}
function qaReport(task, text = 'revisão') {
  return sb.write(`office/businesses/alpha/deliverables/${task.id}/code-review.md`, text);
}

test('automação não conclui sem revisão do code-reviewer', () => {
  const s = automationTaskInReview();
  assert.throws(() => T.moveTask('alpha', s.id, 'done', 'chief-of-staff'), /falta revisão de code-reviewer/);
});

test('revisão aprovada libera a conclusão', () => {
  const s = automationTaskInReview();
  T.recordQualityCheck('alpha', s.id, { by: 'code-reviewer', verdict: 'pass', file: qaReport(s) });
  assert.equal(T.moveTask('alpha', s.id, 'done', 'chief-of-staff').status, 'done');
});

test('revisão reprovada bloqueia; correção exige nova revisão', () => {
  const s = automationTaskInReview();
  T.recordQualityCheck('alpha', s.id, { by: 'code-reviewer', verdict: 'fail', file: qaReport(s) });
  assert.throws(() => T.moveTask('alpha', s.id, 'done', 'chief-of-staff'), /reprovada/);
  T.moveTask('alpha', s.id, 'changes_requested', 'chief-of-staff');
  T.moveTask('alpha', s.id, 'in_progress', 'director-automation');
  sb.write(`office/businesses/alpha/deliverables/${s.id}/out.md`, 'versão corrigida');
  T.deliver('alpha', s.id, { agent: 'director-automation', file: `office/businesses/alpha/deliverables/${s.id}/out.md` });
  T.moveTask('alpha', s.id, 'review', 'director-automation');
  assert.throws(() => T.moveTask('alpha', s.id, 'done', 'chief-of-staff'), /reprovada/);
  T.recordQualityCheck('alpha', s.id, { by: 'code-reviewer', verdict: 'pass', file: qaReport(s, 'ok agora') });
  assert.equal(T.moveTask('alpha', s.id, 'done', 'chief-of-staff').status, 'done');
});

test('entrega alterada depois do "pass" invalida a revisão', () => {
  const s = automationTaskInReview();
  T.recordQualityCheck('alpha', s.id, { by: 'code-reviewer', verdict: 'pass', file: qaReport(s) });
  sb.write(`office/businesses/alpha/deliverables/${s.id}/out.md`, 'mudou escondido');
  T.deliver('alpha', s.id, { agent: 'director-automation', file: `office/businesses/alpha/deliverables/${s.id}/out.md` });
  assert.throws(() => T.moveTask('alpha', s.id, 'done', 'chief-of-staff'), /mudaram depois da revisão/);
});

test('só o revisor designado registra revisão, e só em "review"', () => {
  const m = mission();
  const s = delegate(m, 'director-automation');
  assert.throws(() => T.recordQualityCheck('alpha', s.id, { by: 'code-reviewer', verdict: 'pass', file: qaReport(s) }), /só é registrada com a tarefa em "review"/);
  T.moveTask('alpha', s.id, 'in_progress', 'director-automation');
  deliverFile(s);
  T.moveTask('alpha', s.id, 'review', 'director-automation');
  assert.throws(() => T.recordQualityCheck('alpha', s.id, { by: 'director-automation', verdict: 'pass', file: qaReport(s) }), /somente code-reviewer/);
  assert.throws(() => T.recordQualityCheck('alpha', s.id, { by: 'code-reviewer', verdict: 'talvez', file: qaReport(s) }), /pass ou fail/);
  // departamentos sem revisor obrigatório não exigem revisão
  assert.equal(delegate(m, 'director-strategy').quality_gate, null);
});

// ------------------------------------------------------------ decisão do fundador registrada pelo CoS

function missionAwaiting() {
  const m = mission();
  T.moveTask('alpha', m.id, 'in_progress', 'chief-of-staff');
  deliverFile(m);
  T.moveTask('alpha', m.id, 'review', 'chief-of-staff');
  T.requestApproval('alpha', m.id, { by: 'chief-of-staff', summary: 'pronto' });
  return m;
}

test('CoS registra decisão do fundador dada no chat, com citação', () => {
  const m = missionAwaiting();
  const t = T.decide('alpha', m.id, { decision: 'approved', recordedBy: 'chief-of-staff', channel: 'chat', quote: 'aprovo' });
  assert.equal(t.status, 'done');
  assert.equal(t.approval.decided_by, 'founder');
  assert.equal(t.approval.recorded_by, 'chief-of-staff');
  assert.equal(t.approval.quote, 'aprovo');
  assert.equal(verifyBusiness('alpha').ok, true);
});

test('registro em nome do fundador exige citação e só o CoS pode fazê-lo', () => {
  const m = missionAwaiting();
  assert.throws(() => T.decide('alpha', m.id, { decision: 'approved', recordedBy: 'chief-of-staff' }), /exige --quote/);
  assert.throws(() => T.decide('alpha', m.id, { decision: 'approved', recordedBy: 'director-operations', quote: 'x' }), /somente o fundador ou o Chief of Staff/);
  assert.equal(T.loadTask('alpha', m.id).status, 'awaiting_approval');
});
