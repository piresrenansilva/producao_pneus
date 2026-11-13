'use strict';

const fs = require('node:fs');
const path = require('node:path');
const js = require('@eslint/js');
const globals = require('globals');

// A interface ainda usa scripts clássicos compartilhando o escopo global.
// Extraímos os nomes declarados no topo de cada arquivo para que o ESLint
// reconheça essa superfície compartilhada e continue apontando identificadores
// realmente indefinidos. A migração para ES modules fica como próximo passo.
function frontendSharedGlobals() {
  const dir = path.join(__dirname, 'wwwroot', 'js');
  const names = new Set();
  for (const file of fs.readdirSync(dir)) {
    if (!file.endsWith('.js')) continue;
    const source = fs.readFileSync(path.join(dir, file), 'utf8');
    const pattern = /^(?:async\s+)?function\s+([A-Za-z_$][\w$]*)|^(?:const|let|var)\s+([A-Za-z_$][\w$]*)/gm;
    for (const match of source.matchAll(pattern)) names.add(match[1] || match[2]);
  }
  return Object.fromEntries([...names].map((name) => [name, 'writable']));
}

module.exports = [
  {
    ignores: ['node_modules/**', 'coverage/**', 'orcamento_ms_pneus.html', 'diagnostico-sql.log']
  },
  js.configs.recommended,
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'commonjs',
      globals: { ...globals.node }
    },
    rules: {
      'no-console': 'off',
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'prefer-const': 'error',
      'no-var': 'error',
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      curly: ['error', 'multi-line'],
      'no-throw-literal': 'error',
      'no-empty': ['error', { allowEmptyCatch: true }]
    }
  },
  {
    files: ['wwwroot/js/**/*.js'],
    languageOptions: {
      sourceType: 'script',
      globals: { ...globals.browser, ...frontendSharedGlobals() }
    },
    rules: {
      // Funções/estado são usados entre arquivos diferentes; o linter não
      // consegue enxergar esse uso sem módulos. Mantemos as demais regras.
      'no-unused-vars': 'off',
      'no-var': 'off',
      'no-redeclare': 'off',
      'prefer-const': 'off'
    }
  },
  {
    files: ['test/**/*.js'],
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }]
    }
  }
];
