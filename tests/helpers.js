// Cria um repositório temporário isolado (registro + 2 negócios) para os testes.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function sandbox() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-office-'));
  const data = path.join(root, 'office');
  fs.cpSync(path.join(repo, 'office', 'registry'), path.join(data, 'registry'), { recursive: true });

  // agentes extras só para teste: um especialista ativo e um proposto
  const agentsFile = path.join(data, 'registry', 'agents.json');
  const agents = JSON.parse(fs.readFileSync(agentsFile, 'utf8'));
  agents.agents.push(
    { id: 'ops-analyst', role: 'specialist', department: 'operations', reports_to: 'director-operations', status: 'active' },
    { id: 'ops-proposed', role: 'specialist', department: 'operations', reports_to: 'director-operations', status: 'proposed' },
    { id: 'auto-dev', role: 'specialist', department: 'automation', reports_to: 'director-automation', status: 'active' }
  );
  fs.writeFileSync(agentsFile, JSON.stringify(agents));

  fs.writeFileSync(
    path.join(data, 'registry', 'businesses.json'),
    JSON.stringify({ businesses: [
      { id: 'alpha', name: 'Alpha', status: 'active' },
      { id: 'beta', name: 'Beta', status: 'active' },
    ] })
  );
  for (const [id, deps] of [['alpha', ['operations', 'automation', 'strategy']], ['beta', ['strategy']]]) {
    const dir = path.join(data, 'businesses', id);
    fs.mkdirSync(path.join(dir, 'tasks'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'deliverables'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'business.json'), JSON.stringify({ id, departments_enabled: deps }));
  }
  process.env.AI_OFFICE_ROOT = root;
  process.env.AI_OFFICE_DATA = data;
  return {
    root,
    data,
    write(rel, content) {
      const abs = path.join(root, rel);
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, content);
      return rel;
    },
    cleanup() {
      fs.rmSync(root, { recursive: true, force: true });
    },
  };
}
