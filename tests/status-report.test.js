import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { sandbox } from './helpers.js';
import * as T from '../src/lib/tasks.js';
import { run } from '../src/cli.js';
import { buildReport, computeAlerts, since, truncateTitle, statusReport } from '../src/tools/status-report.js';

let sb;
beforeEach(() => { sb = sandbox(); });
afterEach(() => sb.cleanup());

const NOW = Date.parse('2026-11-10T12:00:00Z');
const DAY = 86400000;
const ago = (d) => new Date(NOW - d * DAY).toISOString();

// Tarefa em memória; `age` = dias desde a entrada no status atual (e criação).
function mk(id, status, age, extra = {}) {
  const at = ago(age);
  const history = [{ at, by: 'x', type: 'created' }];
  if (status !== 'pending') history.push({ at, by: 'x', type: 'status', from: 'pending', to: status, note: '' });
  return {
    id, title: `Tarefa ${id}`, parent: null, assignee: 'director-automation', status,
    revisions: 0, approval: null, created_at: at, history, ...extra,
  };
}
const codes = (tasks) => computeAlerts(tasks, NOW).map((a) => `${a.code}:${a.id}`);
const has = (tasks, code) => codes(tasks).some((c) => c.startsWith(`${code}:`));

// limiar-1 não dispara; limiar dispara
const RULES = [
  ['A1', 'awaiting_approval', 2, (a) => ({ approval: { requested_at: ago(a) } })],
  ['A4', 'in_progress', 3],
  ['A5', 'review', 2],
  ['A6', 'changes_requested', 2],
  ['A7', 'pending', 3],
];
for (const [code, status, th, extra] of RULES) {
  test(`${code}: limiar-1 não dispara, limiar dispara`, () => {
    const f = (a) => [mk('T-0001', status, a, extra ? extra(a) : {})];
    assert.equal(has(f(th - 1), code), false);
    assert.equal(has(f(th), code), true);
    assert.equal(has(f(th + 2), code), true);
  });
}

test('A2: bloqueada dispara em qualquer idade, ALTA', () => {
  const a = computeAlerts([mk('T-0001', 'blocked', 0)], NOW);
  assert.deepEqual(a.map((x) => [x.code, x.sev]), [['A2', 'ALTA']]);
  assert.match(a[0].text, /T-0001 bloqueada há 0 dias/);
});

test('A3: revisions>=2 dispara; 1 não; encerrada não', () => {
  assert.equal(has([mk('T-0001', 'in_progress', 0, { revisions: 1 })], 'A3'), false);
  assert.equal(has([mk('T-0001', 'in_progress', 0, { revisions: 2 })], 'A3'), true);
  assert.equal(has([mk('T-0001', 'done', 0, { revisions: 2 })], 'A3'), false);
});

test('A8: mãe aberta com todas as filhas encerradas dispara', () => {
  const mae = mk('T-0001', 'in_progress', 0);
  const f1 = mk('T-0002', 'done', 0, { parent: 'T-0001' });
  const f2 = mk('T-0003', 'cancelled', 0, { parent: 'T-0001' });
  assert.equal(has([mae, f1, f2], 'A8'), true);
  assert.equal(has([mae, f1, mk('T-0003', 'review', 0, { parent: 'T-0001' })], 'A8'), false); // filha aberta
  assert.equal(has([mae], 'A8'), false); // sem filhas
  assert.equal(has([{ ...mae, status: 'done' }, f1], 'A8'), false); // mãe encerrada
});

test('alertas: ALTA antes de MÉDIA, depois por id; uma tarefa pode disparar várias regras', () => {
  const ts = [
    mk('T-0004', 'in_progress', 5),
    mk('T-0002', 'blocked', 1, { revisions: 2 }),
    mk('T-0001', 'in_progress', 4),
  ];
  assert.deepEqual(codes(ts), ['A2:T-0002', 'A3:T-0002', 'A4:T-0001', 'A4:T-0004']);
});

test('since: último status igual ao atual; fallback para created_at', () => {
  const t = mk('T-0001', 'in_progress', 9);
  t.history.push({ at: ago(5), type: 'status', to: 'blocked' }, { at: ago(2), type: 'status', to: 'in_progress' });
  assert.equal(since(t), ago(2));
  assert.equal(since(mk('T-0002', 'pending', 3)), ago(3));
  assert.equal(since({ status: 'review', created_at: ago(1), history: [] }), ago(1));
  assert.equal(since({ status: 'review', created_at: ago(1) }), ago(1));
});

test('truncamento de título em 60 caracteres com reticências', () => {
  assert.equal(truncateTitle('a'.repeat(60)), 'a'.repeat(60));
  const t = truncateTitle('b'.repeat(61));
  assert.equal(t.length, 60);
  assert.ok(t.endsWith('…'));
});

test('listas truncadas em 10 itens com "… +N"', () => {
  const ts = Array.from({ length: 13 }, (_, i) => mk(`T-${String(i + 1).padStart(4, '0')}`, 'pending', 0));
  const md = buildReport(ts, { business: 'alpha', now: NOW });
  assert.match(md, /\n… \+3\n/);
  assert.equal((md.match(/^\| T-/gm) || []).length, 10);
});

test('negócio vazio: todas as seções com frase de vazio', () => {
  const md = buildReport([], { business: 'alpha', now: '2026-11-10T12:00:00Z' });
  assert.match(md, /^# Relatório semanal — alpha — 2026-11-10/);
  assert.match(md, /Abertas: 0 \| Concluídas \(7 dias\): 0 \| Alertas: 0/);
  assert.match(md, /Nenhuma decisão pendente\./);
  assert.match(md, /Nenhum alerta\./);
  assert.equal((md.match(/^Nenhuma\.$/gm) || []).length, 4);
  assert.match(md, /pending 0 · in_progress 0 · blocked 0 · review 0 · changes_requested 0 · awaiting_approval 0 · done 0 · rejected 0 · cancelled 0/);
});

test('seções, ordenação, concluídas em 7 dias e contagem', () => {
  const ts = [
    mk('T-0001', 'awaiting_approval', 3, { approval: { requested_at: ago(3) } }),
    mk('T-0002', 'done', 7), // exatamente 7 dias: entra
    mk('T-0003', 'done', 8), // fora
    mk('T-0004', 'in_progress', 1),
    mk('T-0005', 'review', 4),
    mk('T-0006', 'blocked', 4, { history: [
      { at: ago(4), type: 'status', to: 'blocked', note: 'falta dado | do fundador' }] }),
    mk('T-0007', 'cancelled', 0),
  ];
  const md = buildReport(ts, { business: 'alpha', now: NOW });
  assert.match(md, /Abertas: 4 \| Concluídas \(7 dias\): 1 \| Alertas: 3/);
  assert.match(md, /\| T-0001 \| Tarefa T-0001 \| 3 dias \|/);
  assert.ok(md.indexOf('| T-0005 |') < md.indexOf('| T-0004 |')); // mais dias primeiro
  assert.match(md, /\| T-0006 \| Tarefa T-0006 \| director-automation \| 4 \| falta dado \\\| do fundador \|/);
  assert.match(md, /\| T-0002 \| Tarefa T-0002 \| 2026-11-03 \|/);
  assert.ok(!md.includes('| T-0003 |'));
  assert.match(md, /pending 0 · in_progress 1 · blocked 1 · review 1 · changes_requested 0 · awaiting_approval 1 · done 2 · rejected 0 · cancelled 1/);
  assert.ok(md.indexOf('[ALTA] A1') < md.indexOf('[MÉDIA] A5'));
});

test('saída determinística e no máximo ~60 linhas no caso típico', () => {
  const ts = [mk('T-0001', 'in_progress', 4), mk('T-0002', 'pending', 0)];
  const a = buildReport(ts, { business: 'alpha', now: NOW });
  assert.equal(a, buildReport(ts, { business: 'alpha', now: NOW }));
  assert.ok(a.split('\n').length <= 60);
});

test('--now inválido gera erro', () => {
  assert.throws(() => buildReport([], { business: 'alpha', now: 'xx' }), /inválida/);
});

// ------------------------------------------------ integração com a API real e a CLI

function realTasks() {
  const m = T.createTask('alpha', { title: 'Missão', assignee: 'chief-of-staff', createdBy: 'founder' });
  const s = T.createTask('alpha', { title: 'Sub', assignee: 'director-operations', createdBy: 'chief-of-staff', parent: m.id });
  T.moveTask('alpha', m.id, 'in_progress', 'chief-of-staff');
  T.moveTask('alpha', s.id, 'in_progress', 'director-operations');
  const rel = sb.write(`office/businesses/alpha/deliverables/${s.id}/o.md`, 'x');
  T.deliver('alpha', s.id, { agent: 'director-operations', file: rel });
  T.moveTask('alpha', s.id, 'review', 'director-operations');
  T.moveTask('alpha', s.id, 'done', 'chief-of-staff');
  const rel2 = sb.write(`office/businesses/alpha/deliverables/${m.id}/o.md`, 'y');
  T.deliver('alpha', m.id, { agent: 'chief-of-staff', file: rel2 });
  T.moveTask('alpha', m.id, 'review', 'chief-of-staff');
  T.requestApproval('alpha', m.id, { by: 'chief-of-staff', summary: 'ok' });
  return { m, s };
}

test('wrapper lê via listTasks e respeita --now (passagem de tempo)', () => {
  realTasks();
  const later = new Date(Date.now() + 3 * DAY).toISOString();
  const md = statusReport('alpha', { now: later });
  assert.match(md, /A1 T-0001 aguarda decisão do fundador há 3 dias/);
  assert.match(md, /Concluídas \(7 dias\): 1/);
  const soon = statusReport('alpha', { now: new Date(Date.now() + 1 * DAY).toISOString() });
  assert.ok(!/A1 /.test(soon)); // só A8 (mãe com filha concluída)
});

test('isolamento: relatório de um negócio não inclui tarefas de outro', () => {
  realTasks();
  const b = T.createTask('beta', { title: 'Só do beta', assignee: 'chief-of-staff', createdBy: 'founder' });
  const alpha = statusReport('alpha', {});
  const beta = statusReport('beta', {});
  assert.ok(!alpha.includes('Só do beta'));
  assert.ok(!beta.includes('Sub'));
  assert.match(beta, /pending 1 /);
  assert.equal(b.id, 'T-0001');
});

test('somente leitura: arquivos de tarefas não mudam', () => {
  realTasks();
  const dir = path.join(sb.data, 'businesses', 'alpha', 'tasks');
  const snap = () => fs.readdirSync(dir).map((f) => fs.readFileSync(path.join(dir, f), 'utf8'));
  const before = snap();
  statusReport('alpha', {});
  assert.deepEqual(snap(), before);
});

test('CLI: report imprime; --out grava dentro do repositório', () => {
  realTasks();
  const md = run(['report', '--business', 'alpha', '--now', '2030-01-01T00:00:00Z']);
  assert.match(md, /^# Relatório semanal — alpha — 2030-01-01/);
  const msg = run(['report', '--business', 'alpha', '--out', 'saida/r.md']);
  assert.match(msg, /gravado/);
  assert.match(fs.readFileSync(path.join(sb.root, 'saida', 'r.md'), 'utf8'), /^# Relatório semanal/);
  assert.throws(() => run(['report', '--business', 'alpha', '--out', '../fora.md']), /dentro do repositório/);
});

test('CLI: negócio inexistente gera OfficeError; sem --business também', () => {
  assert.throws(() => run(['report', '--business', 'nada']), { name: 'OfficeError' });
  assert.throws(() => run(['report']), /faltando --business/);
});
