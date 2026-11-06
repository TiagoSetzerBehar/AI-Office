// Vitrine de automações: lista as ferramentas e o estado da revisão de código.
// Lista explícita (simples e testável): ao criar uma ferramenta nova, inclua-a aqui.
import fs from 'node:fs';
import path from 'node:path';
import { loadTask, qualityStatus } from '../lib/tasks.js';
import { rootDir, isInside, OfficeError } from '../lib/paths.js';
import { meta as reportMeta } from './status-report.js';

export const meta = {
  id: 'automations',
  name: 'Vitrine de automações',
  summary: 'Lista todas as automações do escritório e mostra se cada uma foi aprovada na revisão de código.',
  usage: 'node src/cli.js automations',
  owner: 'director-automation',
  task: 'cofind/T-0005',
};

export const TOOLS = [reportMeta, meta];

export const REVIEW = {
  approved: 'aprovada pelo revisor',
  pending: 'pendente',
  legacy: 'criada antes do revisor existir',
};

/** Estado da revisão a partir de uma tarefa já carregada. */
export function reviewState(task) {
  const q = qualityStatus(task);
  if (!q.required) return REVIEW.legacy;
  return q.ok ? REVIEW.approved : REVIEW.pending;
}

/** Lê a tarefa de origem ("negocio/T-0001"); se não der, a revisão é "pendente". */
function reviewOf(taskRef, load) {
  const [biz, id] = String(taskRef || '').split('/');
  try {
    return reviewState(load(biz, id));
  } catch {
    return REVIEW.pending;
  }
}

/** Lista as automações com o estado da revisão. `load` é injetável para testes. */
export function listAutomations({ tools = TOOLS, load = loadTask } = {}) {
  return tools.map((t) => ({ ...t, review: reviewOf(t.task, load) }));
}

const cell = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\s+/g, ' ');

/** Função pura: lista de automações → Markdown. */
export function buildAutomations(items) {
  const lines = [
    '# Automações do AI Office',
    '',
    '> Gerado por `node src/cli.js automations --write`. Não edite à mão.',
    '',
    `Total: ${items.length}`,
    '',
  ];
  for (const a of items) {
    lines.push(
      `## ${cell(a.name)}`,
      a.summary,
      '',
      `- **Como usar:** \`${a.usage}\``,
      `- **Revisão de código:** ${a.review}`,
      `- **Responsável:** ${a.owner}`,
      `- **Tarefa de origem:** ${a.task}`,
      ''
    );
  }
  return lines.join('\n');
}

export function automationsMarkdown(opts) {
  return buildAutomations(listAutomations(opts));
}

/** Grava docs/AUTOMATIONS.md (ou `out`, dentro do repositório). Retorna o caminho relativo. */
export function writeAutomations({ out = 'docs/AUTOMATIONS.md', ...opts } = {}) {
  const abs = path.resolve(rootDir(), out);
  if (!isInside(rootDir(), abs)) throw new OfficeError('--out deve estar dentro do repositório');
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, automationsMarkdown(opts));
  return path.relative(rootDir(), abs);
}
