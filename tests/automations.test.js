import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { sandbox } from './helpers.js';
import { run } from '../src/cli.js';
import {
  TOOLS, REVIEW, reviewState, listAutomations, buildAutomations, writeAutomations,
} from '../src/tools/automations.js';

let sb;
beforeEach(() => { sb = sandbox(); });
afterEach(() => sb.cleanup());

const approved = { quality_gate: 'code-reviewer', deliverables: [], quality_checks: [{ verdict: 'pass', by: 'code-reviewer', snapshot: '' }] };
const waiting = { quality_gate: 'code-reviewer', deliverables: [], quality_checks: [] };
const legacy = { quality_gate: null, deliverables: [], quality_checks: [] };

test('reviewState: três estados', () => {
  assert.equal(reviewState(approved), REVIEW.approved);
  assert.equal(reviewState(waiting), REVIEW.pending);
  assert.equal(reviewState(legacy), REVIEW.legacy);
});

test('reviewState: entregas mudadas após a revisão voltam a pendente', () => {
  const changed = { ...approved, deliverables: [{ path: 'a', sha256: 'x' }] };
  assert.equal(reviewState(changed), REVIEW.pending);
});

test('toda ferramenta tem meta completa e a vitrine se lista', () => {
  for (const t of TOOLS) {
    for (const k of ['id', 'name', 'summary', 'usage', 'owner', 'task']) assert.ok(t[k], `${t.id}: falta ${k}`);
  }
  assert.ok(TOOLS.some((t) => t.id === 'automations'));
  assert.ok(TOOLS.some((t) => t.id === 'report'));
});

test('todo arquivo de src/tools (exceto helpers) está na lista', () => {
  const dir = path.resolve(import.meta.dirname, '..', 'src', 'tools');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.js')).map((f) => f.replace(/\.js$/, ''));
  const expected = { report: 'status-report', automations: 'automations' };
  assert.deepEqual(files.sort(), TOOLS.map((t) => expected[t.id]).sort());
});

test('listAutomations usa a tarefa de origem; tarefa ausente = pendente', () => {
  const byId = { 'cofind/T-0003': legacy, 'cofind/T-0005': approved };
  const items = listAutomations({ load: (b, id) => { const t = byId[`${b}/${id}`]; if (!t) throw new Error('x'); return t; } });
  assert.equal(items.find((i) => i.id === 'report').review, REVIEW.legacy);
  assert.equal(items.find((i) => i.id === 'automations').review, REVIEW.approved);
  const none = listAutomations({ load: () => { throw new Error('x'); } });
  assert.ok(none.every((i) => i.review === REVIEW.pending));
});

test('buildAutomations gera Markdown legível', () => {
  const md = buildAutomations([{ ...TOOLS[0], review: REVIEW.legacy }]);
  assert.match(md, /^# Automações do AI Office/);
  assert.match(md, /Relatório semanal/);
  assert.match(md, /criada antes do revisor existir/);
  assert.match(md, /Total: 1/);
});

test('writeAutomations grava no caminho pedido e recusa fora do repositório', () => {
  const load = () => legacy;
  assert.equal(writeAutomations({ load }), 'docs/AUTOMATIONS.md');
  assert.match(fs.readFileSync(path.join(sb.root, 'docs/AUTOMATIONS.md'), 'utf8'), /Vitrine de automações/);
  assert.throws(() => writeAutomations({ out: '../fora.md', load }), /dentro do repositório/);
});

test('CLI: automations lista as 2 automações; --write grava', () => {
  const md = run(['automations']);
  assert.match(md, /Relatório semanal/);
  assert.match(md, /Vitrine de automações/);
  assert.match(run(['automations', '--write']), /docs\/AUTOMATIONS\.md/);
  assert.ok(fs.existsSync(path.join(sb.root, 'docs/AUTOMATIONS.md')));
});
