// Verificação de integridade de um negócio: estados válidos, referências,
// hashes das entregas e consistência das aprovações.
import fs from 'node:fs';
import path from 'node:path';
import { rootDir } from './paths.js';
import { sha256File } from './store.js';
import { loadAgents, FOUNDER } from './registry.js';
import { listTasks, listRuns } from './tasks.js';
import { STATES, LIMITS } from './states.js';

export function verifyBusiness(biz) {
  const problems = [];
  const tasks = listTasks(biz);
  const ids = new Set(tasks.map((t) => t.id));
  const agents = new Set(loadAgents().map((a) => a.id));

  for (const t of tasks) {
    const where = `${t.id}`;
    if (t.business !== biz) problems.push(`${where}: pertence a "${t.business}", mas está em "${biz}"`);
    if (!STATES.includes(t.status)) problems.push(`${where}: estado inválido ${t.status}`);
    if (!agents.has(t.assignee)) problems.push(`${where}: responsável desconhecido ${t.assignee}`);
    if (t.parent && !ids.has(t.parent)) problems.push(`${where}: tarefa-mãe ${t.parent} inexistente`);
    if (t.depth > LIMITS.MAX_DEPTH) problems.push(`${where}: profundidade ${t.depth} acima do limite`);
    if (t.status === 'done' && t.requires_approval) {
      if (t.approval?.decision !== 'approved' || t.approval?.decided_by !== FOUNDER) {
        problems.push(`${where}: concluída sem aprovação registrada do fundador`);
      }
    }
    for (const d of t.deliverables) {
      const abs = path.join(rootDir(), d.path);
      if (!fs.existsSync(abs)) problems.push(`${where}: entrega ausente ${d.path}`);
      else if (sha256File(abs) !== d.sha256) problems.push(`${where}: entrega alterada após registro ${d.path}`);
    }
  }
  for (const r of listRuns(biz)) {
    if (r.task && !ids.has(r.task)) problems.push(`run ${r.at}: tarefa ${r.task} inexistente`);
  }
  return { ok: problems.length === 0, tasks: tasks.length, problems };
}
