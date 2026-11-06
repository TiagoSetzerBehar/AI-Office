// Relatório semanal de status (somente leitura). Spec: deliverables/T-0002/spec.md
import fs from 'node:fs';
import path from 'node:path';
import { listTasks, assertNotOtherBusiness } from '../lib/tasks.js';
import { STATES, TERMINAL } from '../lib/states.js';
import { rootDir, businessDir, OfficeError, isInside } from '../lib/paths.js';

export const meta = {
  id: 'report',
  name: 'Relatório semanal',
  summary: 'Mostra em uma página o que está andando, parado ou esperando decisão no negócio.',
  usage: 'node src/cli.js report --business cofind',
  owner: 'director-automation',
  task: 'cofind/T-0003',
};

const DAY = 86400000;
export const THRESHOLDS = { A1: 2, A4: 3, A5: 2, A6: 2, A7: 3 };
export const MAX_ITEMS = 10;
export const MAX_TITLE = 60;
const RECENT_DAYS = 7;

function toMs(v, label = 'data') {
  const ms = v instanceof Date ? v.getTime() : typeof v === 'number' ? v : Date.parse(v);
  if (Number.isNaN(ms)) throw new OfficeError(`${label} inválida: ${v}`);
  return ms;
}
const days = (from, nowMs) => Math.floor((nowMs - toMs(from)) / DAY);
const ymd = (v) => new Date(toMs(v)).toISOString().slice(0, 10);
const plural = (n) => `${n} ${n === 1 ? 'dia' : 'dias'}`;
const isOpen = (t) => !TERMINAL.has(t.status);
const cell = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\s+/g, ' ');

export function truncateTitle(title) {
  const s = String(title ?? '');
  return s.length > MAX_TITLE ? `${s.slice(0, MAX_TITLE - 1)}…` : s;
}

/** Instante de entrada no status atual (ISO). */
export function since(t) {
  const hist = Array.isArray(t.history) ? t.history : [];
  for (let i = hist.length - 1; i >= 0; i--) {
    if (hist[i].type === 'status' && hist[i].to === t.status) return hist[i].at;
  }
  return t.created_at;
}

function blockedNote(t) {
  const hist = Array.isArray(t.history) ? t.history : [];
  for (let i = hist.length - 1; i >= 0; i--) {
    if (hist[i].type === 'status' && hist[i].to === 'blocked') return hist[i].note || '—';
  }
  return '—';
}

/** Alertas A1–A8 → [{ code, sev, id, text }]. */
export function computeAlerts(tasks, nowMs, th = THRESHOLDS) {
  const out = [];
  const add = (code, sev, t, text) => out.push({ code, sev, id: t.id, text });
  for (const t of tasks.filter(isOpen)) {
    const age = days(since(t), nowMs);
    const created = days(t.created_at, nowMs);
    if (t.status === 'awaiting_approval') {
      const a = days(t.approval?.requested_at || since(t), nowMs);
      if (a >= th.A1) add('A1', 'ALTA', t, `${t.id} aguarda decisão do fundador há ${plural(a)}`);
    }
    if (t.status === 'blocked') add('A2', 'ALTA', t, `${t.id} bloqueada há ${plural(age)}`);
    if ((t.revisions || 0) >= 2) add('A3', 'ALTA', t, `${t.id} atingiu limite de revisões; escalar`);
    if (t.status === 'in_progress' && age >= th.A4) add('A4', 'MÉDIA', t, `${t.id} parada em andamento há ${plural(age)}`);
    if (t.status === 'review' && age >= th.A5) add('A5', 'MÉDIA', t, `${t.id} aguarda revisão há ${plural(age)}`);
    if (t.status === 'changes_requested' && age >= th.A6) add('A6', 'MÉDIA', t, `${t.id} aguarda ajustes há ${plural(age)}`);
    if (t.status === 'pending' && created >= th.A7) add('A7', 'MÉDIA', t, `${t.id} não iniciada há ${plural(created)}`);
    const kids = tasks.filter((k) => k.parent === t.id);
    if (kids.length && kids.every((k) => TERMINAL.has(k.status))) {
      add('A8', 'MÉDIA', t, `${t.id}: subtarefas concluídas, mãe ainda aberta`);
    }
  }
  const rank = { ALTA: 0, 'MÉDIA': 1 };
  return out.sort((a, b) => rank[a.sev] - rank[b.sev] || a.id.localeCompare(b.id) || a.code.localeCompare(b.code));
}

function limited(items) {
  const shown = items.slice(0, MAX_ITEMS);
  return { shown, extra: Math.max(0, items.length - MAX_ITEMS) };
}

function table(headers, rows, emptyText) {
  if (!rows.length) return emptyText;
  const { shown, extra } = limited(rows);
  const lines = [`| ${headers.join(' | ')} |`, `|${headers.map(() => '---').join('|')}|`];
  for (const r of shown) lines.push(`| ${r.map(cell).join(' | ')} |`);
  if (extra) lines.push(`… +${extra}`);
  return lines.join('\n');
}

/** Função pura: lista de tarefas → Markdown. */
export function buildReport(tasks, { business, now = new Date() } = {}) {
  const nowMs = toMs(now, '--now');
  const sinceMs = (t) => toMs(since(t));
  const title = (t) => truncateTitle(t.title);

  const open = tasks.filter(isOpen);
  const done7 = tasks
    .filter((t) => t.status === 'done' && sinceMs(t) >= nowMs - RECENT_DAYS * DAY)
    .sort((a, b) => sinceMs(b) - sinceMs(a) || a.id.localeCompare(b.id));
  const alerts = computeAlerts(tasks, nowMs);

  const approvals = tasks
    .filter((t) => t.status === 'awaiting_approval')
    .map((t) => ({ t, since: t.approval?.requested_at || since(t) }))
    .sort((a, b) => toMs(a.since) - toMs(b.since) || a.t.id.localeCompare(b.t.id));

  const ongoing = tasks
    .filter((t) => ['in_progress', 'changes_requested', 'review'].includes(t.status))
    .map((t) => ({ t, d: days(since(t), nowMs) }))
    .sort((a, b) => b.d - a.d || a.t.id.localeCompare(b.t.id));

  const blocked = tasks
    .filter((t) => t.status === 'blocked')
    .map((t) => ({ t, d: days(since(t), nowMs) }))
    .sort((a, b) => b.d - a.d || a.t.id.localeCompare(b.t.id));

  const pending = tasks
    .filter((t) => t.status === 'pending')
    .map((t) => ({ t, d: days(t.created_at, nowMs) }))
    .sort((a, b) => b.d - a.d || a.t.id.localeCompare(b.t.id));

  let alertBlock = 'Nenhum alerta.';
  if (alerts.length) {
    const { shown, extra } = limited(alerts);
    alertBlock = shown.map((a) => `- [${a.sev}] ${a.code} ${a.text}`).join('\n') + (extra ? `\n… +${extra}` : '');
  }

  const counts = STATES.map((s) => `${s} ${tasks.filter((t) => t.status === s).length}`).join(' · ');

  return [
    `# Relatório semanal — ${business} — ${ymd(nowMs)}`,
    `Abertas: ${open.length} | Concluídas (${RECENT_DAYS} dias): ${done7.length} | Alertas: ${alerts.length}`,
    '',
    '## Decisões do fundador',
    table(['ID', 'Título', 'Aguardando há'],
      approvals.map(({ t, since: s }) => [t.id, title(t), plural(days(s, nowMs))]), 'Nenhuma decisão pendente.'),
    '',
    '## Alertas',
    alertBlock,
    '',
    '## Em andamento',
    table(['ID', 'Título', 'Responsável', 'Status', 'Dias'],
      ongoing.map(({ t, d }) => [t.id, title(t), t.assignee, t.status, d]), 'Nenhuma.'),
    '',
    '## Bloqueadas',
    table(['ID', 'Título', 'Responsável', 'Dias', 'Motivo'],
      blocked.map(({ t, d }) => [t.id, title(t), t.assignee, d, blockedNote(t)]), 'Nenhuma.'),
    '',
    '## Pendentes (não iniciadas)',
    table(['ID', 'Título', 'Responsável', 'Dias'],
      pending.map(({ t, d }) => [t.id, title(t), t.assignee, d]), 'Nenhuma.'),
    '',
    `## Concluídas nos últimos ${RECENT_DAYS} dias`,
    table(['ID', 'Título', 'Data'], done7.map((t) => [t.id, title(t), ymd(since(t))]), 'Nenhuma.'),
    '',
    '## Contagem por status',
    counts,
    '',
  ].join('\n');
}

/** Wrapper: lê via listTasks (somente leitura); grava em `out` se informado. */
export function statusReport(business, { now, out } = {}) {
  const tasks = listTasks(business);
  const md = buildReport(tasks, { business, now: now === undefined || now === true ? new Date() : now });
  if (out) {
    if (out === true) throw new OfficeError('faltando valor de --out');
    const abs = path.resolve(rootDir(), out);
    if (!isInside(rootDir(), abs)) throw new OfficeError('--out deve estar dentro do repositório');
    assertNotOtherBusiness(business, abs, '--out');
    const allowed = [path.join(businessDir(business), 'deliverables'), path.join(rootDir(), 'docs')];
    if (!allowed.some((dir) => isInside(dir, abs))) {
      throw new OfficeError(`--out só pode gravar em office/businesses/${business}/deliverables/ ou em docs/`);
    }
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, md);
  }
  return md;
}
