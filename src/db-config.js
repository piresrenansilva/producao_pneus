'use strict';

// DB_NAME é a única fonte do nome do banco da aplicação.
function databaseName(env = process.env) {
  const value = env.DB_NAME;
  if (value == null || !String(value).trim()) {
    throw new Error('Defina DB_NAME no arquivo .env com o nome do banco existente ou desejado.');
  }
  const name = String(value);
  if (!/^[A-Za-z0-9_ -]{1,128}$/.test(name)) {
    throw new Error(
      'DB_NAME contém caracteres não permitidos. Use letras, números, espaços, hífen ou sublinhado.'
    );
  }
  return name;
}

// Divide os parâmetros sem separar ponto e vírgula dentro de valores ODBC
// entre chaves ou valores entre aspas. Não altera credenciais e demais campos.
function splitConnectionString(text) {
  const parts = [];
  let start = 0;
  let closing = '';
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (closing) {
      if (c === closing) {
        if (text[i + 1] === closing) i += 1;
        else closing = '';
      }
    } else if (c === '{') closing = '}';
    else if (c === '"' || c === "'") closing = c;
    else if (c === ';') {
      parts.push(text.slice(start, i));
      start = i + 1;
    }
  }
  if (closing) throw new Error('DB_CONNECTION_STRING inválida: valor entre chaves ou aspas não foi fechado.');
  parts.push(text.slice(start));
  return parts;
}

function connectionStringFor(base, database) {
  base = String(base || '').trim();
  if (!base) return '';
  const parts = splitConnectionString(base).filter((part) => {
    if (!part.trim()) return false;
    const equals = part.indexOf('=');
    if (equals < 0) return true;
    return !/^(database|initial\s+catalog)$/i.test(part.slice(0, equals).trim());
  });
  if (database) parts.push(`Database=${database}`);
  return `${parts.join(';')};`;
}

module.exports = { databaseName, connectionStringFor };
