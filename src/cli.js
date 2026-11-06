#!/usr/bin/env node
// CLI da AI Office: a única porta de escrita no registro de tarefas.
// Uso: node src/cli.js <comando> [subcomando] --flag valor ...   (ver "help")
import {
  loadDepartments, loadAgents, loadBusinesses, getBusiness,
} from './lib/registry.js';
import * as T from './lib/tasks.js';
import { verifyBusiness } from './lib/verify.js';
import { OfficeError } from './lib/paths.js';
import { statusReport } from './tools/status-report.js';
import { pathToFileURL } from 'node:url';

const HELP = `AI Office CLI

  registry                                   departamentos e agentes
  business list | show --business <id>
  project list|create --business <id> [--id --title --owner --goal]
  task create --business <id> --title <t> --assignee <agente> --created-by <agente>
              [--parent T-0001] [--project <id>] [--description <d>]
              [--acceptance "critério"]... [--external] [--requires-approval]
  task list   --business <id> [--status s] [--assignee a] [--project p]
  task show   --business <id> --id T-0001
  task move   --business <id> --id T-0001 --to <estado> --by <agente> [--note n]
  task note   --business <id> --id T-0001 --from <agente> [--to <agente>] --body <texto>
  inbox       --business <id> --agent <agente>       tarefas abertas de um agente
  deliver     --business <id> --id T-0001 --agent <a> --file <caminho> [--summary s]
  run log     --business <id> --agent <a> --mode real|simulated --summary <s>
              [--task T-0001] [--action a]
  run list    --business <id>
  approval request --business <id> --id T-0001 --by <agente> --summary <s>
  approval list    --business <id>
  approve     --business <id> --id T-0001 [--note n]          (somente o fundador)
  reject      --business <id> --id T-0001 [--note n] [--changes]  (somente o fundador)
  verify      --business <id>                        integridade e hashes
  report      --business <id> [--now <ISO>] [--out <arquivo>]   relatório semanal (somente leitura)

Flags globais: --json (saída em JSON)
`;

export function parseArgs(argv) {
  const positional = [];
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      const value = next === undefined || next.startsWith('--') ? true : (i++, next);
      if (key in flags) flags[key] = [].concat(flags[key], value);
      else flags[key] = value;
    } else positional.push(a);
  }
  return { positional, flags };
}

function req(flags, key) {
  const v = flags[key];
  if (v === undefined || v === true) throw new OfficeError(`faltando --${key}`);
  return v;
}

function fmtTask(t) {
  const flag = t.requires_approval ? ' [aprovação]' : '';
  const indent = '  '.repeat(t.depth);
  return `${indent}${t.id}  ${t.status.padEnd(17)} ${t.assignee.padEnd(22)} ${t.title}${flag}`;
}

export function run(argv) {
  const { positional: [cmd, sub], flags } = parseArgs(argv);
  const out = (human, data) => (flags.json ? JSON.stringify(data, null, 2) : human);
  const biz = () => req(flags, 'business');

  switch (cmd) {
    case undefined:
    case 'help':
      return HELP;

    case 'registry': {
      const deps = loadDepartments();
      const agents = loadAgents();
      const lines = deps.map((d) => {
        const members = agents.filter((a) => a.department === d.id);
        return `${d.id} [${d.status}] — ${d.name}\n` +
          members.map((a) => `   - ${a.id} (${a.role}, ${a.status})`).join('\n');
      });
      const top = agents.filter((a) => !a.department).map((a) => `${a.id} (${a.role}, ${a.status})`);
      return out(`${top.join('\n')}\n\n${lines.join('\n')}`, { departments: deps, agents });
    }

    case 'business': {
      if (sub === 'show') {
        const b = getBusiness(biz());
        return out(JSON.stringify(b, null, 2), b);
      }
      const list = loadBusinesses();
      return out(list.map((b) => `${b.id} [${b.status}] ${b.name}`).join('\n'), list);
    }

    case 'project': {
      if (sub === 'create') {
        const p = T.createProject(biz(), {
          id: req(flags, 'id'), title: req(flags, 'title'), owner: req(flags, 'owner'), goal: flags.goal || '',
        });
        return out(`projeto criado: ${p.id}`, p);
      }
      const ps = T.listProjects(biz());
      return out(ps.map((p) => `${p.id} [${p.status}] ${p.title} (dono: ${p.owner})`).join('\n') || '(nenhum)', ps);
    }

    case 'task': {
      if (sub === 'create') {
        const t = T.createTask(biz(), {
          title: req(flags, 'title'),
          assignee: req(flags, 'assignee'),
          createdBy: req(flags, 'created-by'),
          parent: flags.parent,
          project: flags.project,
          description: flags.description || '',
          acceptance: flags.acceptance ? [].concat(flags.acceptance) : [],
          external: flags.external === true,
          requiresApproval: flags['requires-approval'] === true,
        });
        return out(`tarefa criada: ${t.id} -> ${t.assignee}`, t);
      }
      if (sub === 'show') {
        const t = T.loadTask(biz(), req(flags, 'id'));
        return JSON.stringify(t, null, 2);
      }
      if (sub === 'move') {
        const t = T.moveTask(biz(), req(flags, 'id'), req(flags, 'to'), req(flags, 'by'), flags.note || '');
        return out(`${t.id}: ${t.status}`, t);
      }
      if (sub === 'note') {
        const m = T.addNote(biz(), req(flags, 'id'), { from: req(flags, 'from'), to: flags.to, body: req(flags, 'body') });
        return out('mensagem registrada', m);
      }
      const ts = T.listTasks(biz(), { status: flags.status, assignee: flags.assignee, project: flags.project });
      return out(ts.map(fmtTask).join('\n') || '(nenhuma tarefa)', ts);
    }

    case 'inbox': {
      const ts = T.listTasks(biz(), { assignee: req(flags, 'agent') })
        .filter((t) => !['done', 'rejected', 'cancelled'].includes(t.status));
      return out(ts.map(fmtTask).join('\n') || '(caixa vazia)', ts);
    }

    case 'deliver': {
      const d = T.deliver(biz(), req(flags, 'id'), {
        agent: req(flags, 'agent'), file: req(flags, 'file'), summary: flags.summary,
      });
      return out(`entrega registrada: ${d.path} (sha256 ${d.sha256.slice(0, 12)}…)`, d);
    }

    case 'run': {
      if (sub === 'log') {
        const r = T.logRun(biz(), {
          task: flags.task, agent: req(flags, 'agent'), action: flags.action,
          summary: req(flags, 'summary'), mode: req(flags, 'mode'),
        });
        return out(`execução registrada (${r.mode})`, r);
      }
      const rs = T.listRuns(biz());
      return out(rs.map((r) => `${r.at} [${r.mode}] ${r.agent} ${r.task || '-'}: ${r.summary}`).join('\n') || '(nenhuma)', rs);
    }

    case 'approval': {
      if (sub === 'request') {
        const t = T.requestApproval(biz(), req(flags, 'id'), { by: req(flags, 'by'), summary: req(flags, 'summary') });
        return out(`${t.id} aguardando aprovação do fundador`, t);
      }
      const ts = T.pendingApprovals(biz());
      return out(ts.map((t) => `${t.id} ${t.title}\n   ${t.approval?.summary || ''}`).join('\n') || '(nada pendente)', ts);
    }

    case 'approve': {
      const t = T.decide(biz(), req(flags, 'id'), { decision: 'approved', note: flags.note || '' });
      return out(`${t.id} aprovada pelo fundador`, t);
    }

    case 'reject': {
      const decision = flags.changes ? 'changes_requested' : 'rejected';
      const t = T.decide(biz(), req(flags, 'id'), { decision, note: flags.note || '' });
      return out(`${t.id}: ${t.status}`, t);
    }

    case 'verify': {
      const r = verifyBusiness(biz());
      const human = r.ok
        ? `OK — ${r.tasks} tarefas verificadas, nenhum problema`
        : `PROBLEMAS (${r.problems.length}):\n- ${r.problems.join('\n- ')}`;
      return out(human, r);
    }

    case 'report': {
      const md = statusReport(biz(), { now: flags.now, out: flags.out });
      return flags.out ? `relatório gravado em ${flags.out}` : md;
    }

    default:
      throw new OfficeError(`comando desconhecido: ${cmd}\n\n${HELP}`);
  }
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  try {
    const result = run(process.argv.slice(2));
    if (result) console.log(result);
    if (process.argv.includes('verify') && result?.startsWith?.('PROBLEMAS')) process.exitCode = 1;
  } catch (err) {
    console.error(`erro: ${err.message}`);
    process.exitCode = err instanceof OfficeError ? 2 : 1;
  }
}
