// Registro global: departamentos, agentes e negócios.
// O registro só é alterado pelo fundador (ou pela sessão sob sua instrução explícita).
import fs from 'node:fs';
import path from 'node:path';
import { registryDir, businessDir, OfficeError, assertId } from './paths.js';
import { readJSON } from './store.js';

export const FOUNDER = 'founder';
export const CHIEF_OF_STAFF = 'chief-of-staff';

export function loadDepartments() {
  return readJSON(path.join(registryDir(), 'departments.json')).departments;
}

export function loadAgents() {
  return readJSON(path.join(registryDir(), 'agents.json')).agents;
}

export function loadBusinesses() {
  return readJSON(path.join(registryDir(), 'businesses.json')).businesses;
}

export function getAgent(id) {
  const agent = loadAgents().find((a) => a.id === id);
  if (!agent) throw new OfficeError(`agente desconhecido: "${id}"`);
  return agent;
}

export function assertActiveAgent(id) {
  const agent = getAgent(id);
  if (agent.status !== 'active') {
    throw new OfficeError(
      `agente "${id}" não está ativo (status: ${agent.status}). ` +
        'Ativar agentes exige aprovação do fundador.'
    );
  }
  return agent;
}

/** Carrega um negócio e garante que está registrado e ativo. */
export function getBusiness(id) {
  assertId(id, 'business');
  const entry = loadBusinesses().find((b) => b.id === id);
  if (!entry) throw new OfficeError(`negócio não registrado: "${id}"`);
  if (entry.status !== 'active') throw new OfficeError(`negócio "${id}" não está ativo`);
  const file = path.join(businessDir(id), 'business.json');
  if (!fs.existsSync(file)) throw new OfficeError(`negócio "${id}" sem business.json`);
  return { ...entry, ...readJSON(file) };
}

/** O agente pode trabalhar neste negócio? (permissão por departamento) */
export function assertAgentAllowedInBusiness(agent, business) {
  if (agent.role === 'founder' || agent.role === 'chief_of_staff') return;
  const enabled = business.departments_enabled || [];
  if (!enabled.includes(agent.department)) {
    throw new OfficeError(
      `departamento "${agent.department}" não está habilitado no negócio "${business.id}"`
    );
  }
}

/**
 * Regras de delegação (quem pode atribuir tarefa a quem):
 * - fundador  -> qualquer agente ativo (inclui falar direto com diretores)
 * - CoS       -> diretores (ou a si mesmo)
 * - diretor   -> especialistas ativos do próprio departamento (ou a si mesmo)
 * - especialista -> ninguém
 * Delegação entre departamentos passa sempre pelo CoS.
 */
export function assertCanDelegate(creator, assignee) {
  if (creator.id === assignee.id && creator.role !== 'founder') return;
  switch (creator.role) {
    case 'founder':
      return;
    case 'chief_of_staff':
      if (assignee.role === 'director') return;
      break;
    case 'director':
      if (assignee.role === 'specialist' && assignee.department === creator.department) return;
      break;
    default:
      break;
  }
  throw new OfficeError(
    `delegação não permitida: ${creator.id} (${creator.role}) -> ${assignee.id} (${assignee.role}). ` +
      'Colaboração entre departamentos deve ser solicitada ao Chief of Staff.'
  );
}
