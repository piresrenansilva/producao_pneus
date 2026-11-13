'use strict';

// Verificação de sintaxe sem depender de banco ou de pacotes nativos.
// Percorre os diretórios de código e roda `node --check` em cada arquivo JS.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.join(__dirname, '..');
const targets = ['server.js', 'src', 'wwwroot/js', 'test', 'scripts'];
const files = [];

function collect(target) {
  const full = path.join(root, target);
  const stat = fs.statSync(full);
  if (stat.isDirectory()) {
    for (const entry of fs.readdirSync(full)) collect(path.join(target, entry));
  } else if (full.endsWith('.js')) {
    files.push(full);
  }
}

for (const target of targets) collect(target);

let failed = false;
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) {
    failed = true;
    console.error(`Falha de sintaxe em ${path.relative(root, file)}`);
    console.error(result.stderr || result.stdout);
  }
}

if (failed) process.exit(1);
console.log(`Sintaxe OK em ${files.length} arquivos JavaScript.`);
