// Resolução de caminhos e validação de identificadores.
// Todos os acessos a disco passam por aqui para garantir o isolamento entre negócios.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

/** Raiz do repositório (pode ser sobrescrita em testes). */
export function rootDir() {
  return path.resolve(process.env.AI_OFFICE_ROOT || path.join(here, '..', '..'));
}

/** Raiz dos dados da empresa (registro + negócios). */
export function dataDir() {
  return path.resolve(process.env.AI_OFFICE_DATA || path.join(rootDir(), 'office'));
}

export function registryDir() {
  return path.join(dataDir(), 'registry');
}

const ID_RE = /^[a-z0-9][a-z0-9-]{0,62}$/;
const TASK_ID_RE = /^T-\d{4,}$/;

export function assertId(id, label = 'id') {
  if (typeof id !== 'string' || !ID_RE.test(id)) {
    throw new OfficeError(`${label} inválido: "${id}" (use minúsculas, números e hífens)`);
  }
  return id;
}

export function assertTaskId(id) {
  if (typeof id !== 'string' || !TASK_ID_RE.test(id)) {
    throw new OfficeError(`id de tarefa inválido: "${id}" (formato T-0001)`);
  }
  return id;
}

export function businessDir(businessId) {
  assertId(businessId, 'business');
  return path.join(dataDir(), 'businesses', businessId);
}

/** Garante que `target` está dentro de `base` (evita path traversal). */
export function isInside(base, target) {
  const rel = path.relative(path.resolve(base), path.resolve(target));
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

export class OfficeError extends Error {
  constructor(message) {
    super(message);
    this.name = 'OfficeError';
  }
}
