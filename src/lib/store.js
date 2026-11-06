// Camada de armazenamento em arquivos locais.
// É o único módulo que toca o disco diretamente: trocar por SQLite/Postgres
// no futuro significa reimplementar estas funções, não o resto do sistema.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export function readJSON(file, fallback) {
  if (!fs.existsSync(file)) {
    if (fallback !== undefined) return fallback;
    throw new Error(`arquivo não encontrado: ${file}`);
  }
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

/** Escrita atômica: grava em arquivo temporário e renomeia. */
export function writeJSON(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n');
  fs.renameSync(tmp, file);
}

export function appendJSONL(file, entry) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, JSON.stringify(entry) + '\n');
}

export function readJSONL(file) {
  if (!fs.existsSync(file)) return [];
  return fs
    .readFileSync(file, 'utf8')
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l));
}

export function sha256File(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

export function listFiles(dir, ext) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => !ext || f.endsWith(ext))
    .sort();
}

export function now() {
  return new Date().toISOString();
}
