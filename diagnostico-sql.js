'use strict';

/**
 * Diagnóstico de conexão com o SQL Server — Gestão de Pneus (Node.js)  v2
 *
 * Uso (na pasta do projeto, com node_modules instalado):
 *     node diagnostico-sql.js
 *
 * O script NÃO altera nada: só verifica serviços, instâncias, portas reais de cada
 * instância (registry + sockets), drivers e testa conexões candidatas até achar a que
 * funciona. No fim imprime um RESUMO curto — e grava tudo em diagnostico-sql.log.
 */

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = __dirname;
const LOG_PATH = path.join(ROOT, 'diagnostico-sql.log');
const linhasLog = [];

function log(texto = '') {
  const s = String(texto);
  console.log(s);
  linhasLog.push(s);
}
const linha = (c = '-') => log(c.repeat(72));
const titulo = (t) => {
  log('');
  linha('=');
  log(t);
  linha('=');
};
const ok = (t) => log(`  [OK]      ${t}`);
const falha = (t) => log(`  [FALHA]   ${t}`);
const aviso = (t) => log(`  [ATENÇÃO] ${t}`);
const info = (t) => log(`            ${t}`);

const isWindows = process.platform === 'win32';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const resumo = [];

try {
  require('dotenv').config({ path: path.join(ROOT, '.env') });
} catch {
  /* dotenv ausente: segue com variáveis de ambiente */
}

function lerEnv(nome) {
  const v = process.env[nome];
  return v == null || v === '' ? '' : String(v).trim();
}
function boolEnv(nome, padrao) {
  const v = lerEnv(nome);
  if (!v) return padrao;
  return ['1', 'true', 'yes', 'sim'].includes(v.toLowerCase());
}

/** Roda PowerShell e devolve stdout (ou texto de erro). */
function ps(comando, timeout = 40000) {
  if (!isWindows) return '';
  try {
    return execFileSync(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', comando],
      { encoding: 'utf8', timeout, windowsHide: true }
    ).trim();
  } catch (erro) {
    return `${erro.stdout || ''}${erro.stderr || ''}`.trim();
  }
}

/** Roda PowerShell esperando JSON; devolve null se não der para interpretar. */
function psJson(comando) {
  const bruto = ps(comando);
  if (!bruto) return null;
  const inicio = Math.min(
    ...[bruto.indexOf('['), bruto.indexOf('{')].filter((i) => i >= 0).concat([bruto.length])
  );
  const trecho = bruto.slice(inicio).trim();
  try {
    return JSON.parse(trecho);
  } catch {
    try {
      return JSON.parse(trecho.replace(/\r?\n/g, ' '));
    } catch {
      return null;
    }
  }
}
const lista = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);
function bloco(texto, indent = '            ') {
  const limpo = String(texto || '').replace(/\r/g, '').trim();
  if (!limpo) {
    log(`${indent}(sem saída)`);
    return;
  }
  for (const l of limpo.split('\n')) log(`${indent}${l.replace(/\s+$/, '')}`);
}
function tabela(registros, colunas) {
  if (!registros.length) return;
  const larguras = colunas.map((c) =>
    Math.max(c.titulo.length, ...registros.map((r) => String(c.valor(r) ?? '').length))
  );
  log(`  ${colunas.map((c, i) => c.titulo.padEnd(larguras[i])).join('  ')}`);
  log(`  ${colunas.map((_, i) => '-'.repeat(larguras[i])).join('  ')}`);
  for (const r of registros) {
    log(`  ${colunas.map((c, i) => String(c.valor(r) ?? '').padEnd(larguras[i])).join('  ')}`);
  }
}

// ---------------------------------------------------------------------------
// 1. Configuração atual
// ---------------------------------------------------------------------------
titulo('1) Configuração atual (.env)');

const envPath = path.join(ROOT, '.env');
if (!fs.existsSync(envPath)) {
  aviso('Nenhum arquivo .env encontrado nesta pasta.');
  info('Sem .env o sistema assume DB_AUTH=windows, DB_SERVER=localhost e SEM instância,');
  info('ou seja, tenta conectar em localhost:1433 (instância padrão).');
} else {
  ok(`.env encontrado: ${envPath}`);
}
const config = {
  DB_AUTH: lerEnv('DB_AUTH') || 'windows (padrão)',
  DB_SERVER: lerEnv('DB_SERVER') || 'localhost (padrão)',
  DB_PORT: lerEnv('DB_PORT') || '(padrão 1433)',
  DB_INSTANCE: lerEnv('DB_INSTANCE') || '(vazia)',
  DB_NAME: lerEnv('DB_NAME') || 'FabricaPneus (padrão)',
  DB_ENCRYPT: lerEnv('DB_ENCRYPT') || 'false (padrão)',
  DB_TRUST_SERVER_CERT: lerEnv('DB_TRUST_SERVER_CERT') || 'true (padrão)',
  DB_ODBC_DRIVER: lerEnv('DB_ODBC_DRIVER') || 'ODBC Driver 18 for SQL Server (padrão)',
  DB_CONNECTION_STRING: lerEnv('DB_CONNECTION_STRING') ? '(definida)' : '(vazia)',
  DB_USER: lerEnv('DB_USER') || '(vazio)',
  DB_PASSWORD: lerEnv('DB_PASSWORD') ? '******' : '(vazio)'
};
for (const [k, v] of Object.entries(config)) log(`  ${k.padEnd(22)} = ${v}`);
log(`  Node.js                = ${process.version} (${process.platform})`);

// ---------------------------------------------------------------------------
// 2..6 Windows: serviços, instâncias, portas reais, drivers
// ---------------------------------------------------------------------------
const servicos = [];
const instancias = [];
const portasPorInstancia = [];

if (isWindows) {
  titulo('2) Serviços do SQL Server');
  const svcRaw = psJson(
    "Get-CimInstance Win32_Service -ErrorAction SilentlyContinue | " +
      "Where-Object { $_.Name -eq 'SQLBrowser' -or $_.Name -eq 'MSSQLSERVER' -or $_.Name -like 'MSSQL$*' } | " +
      'Select-Object Name,State,StartMode,ProcessId | ConvertTo-Json -Compress'
  );
  for (const s of lista(svcRaw)) servicos.push(s);
  const browser = servicos.find((s) => s.Name === 'SQLBrowser');
  const motores = servicos.filter((s) => s.Name !== 'SQLBrowser');

  if (!motores.length) {
    falha('Nenhum serviço de instância (MSSQLSERVER / MSSQL$...) encontrado.');
    info('O SQL Server parece não estar instalado nesta máquina.');
  } else {
    tabela(motores, [
      { titulo: 'Serviço', valor: (r) => r.Name },
      { titulo: 'Status', valor: (r) => r.State },
      { titulo: 'Início', valor: (r) => r.StartMode },
      { titulo: 'PID', valor: (r) => r.ProcessId }
    ]);
  }
  if (!browser) {
    aviso('Serviço "SQL Server Browser" não encontrado.');
  } else if (browser.State !== 'Running') {
    aviso(`Serviço "SQL Server Browser" está ${browser.State}.`);
    info('Sem o Browser, conexão por NOME de instância (localhost\\SQLEXPRESS) não descobre a porta.');
    info('Alternativa: informe a porta direta em DB_PORT (veja a seção 4).');
  } else {
    ok('Serviço "SQL Server Browser" em execução.');
  }

  titulo('3) Instâncias, TCP/IP e portas configuradas (registro do Windows)');
  const regRaw = psJson(
    "$k='HKLM:\\SOFTWARE\\Microsoft\\Microsoft SQL Server\\Instance Names\\SQL';" +
      'if (Test-Path $k) { $n=Get-ItemProperty $k; $out=foreach($p in $n.PSObject.Properties){' +
      "if($p.Name -like 'PS*'){continue}; $id=$p.Value;" +
      "$b=\"HKLM:\\SOFTWARE\\Microsoft\\Microsoft SQL Server\\$id\\MSSQLServer\\SuperSocketNetLib\\Tcp\";" +
      '$t=Get-ItemProperty $b -ErrorAction SilentlyContinue;' +
      '$a=Get-ItemProperty "$b\\IPAll" -ErrorAction SilentlyContinue;' +
      '[pscustomobject]@{ Instance=$p.Name; Id=$id; TcpEnabled=$t.TcpEnabled; TcpPort=$t.TcpPort;' +
      ' Dynamic=$t.TcpDynamicPorts; IpAllPort=$a.TcpPort; IpAllDynamic=$a.TcpDynamicPorts;' +
      ' AlsoNamedPipes=(Get-ItemProperty "$b\\..\\NP" -ErrorAction SilentlyContinue).Enabled } };' +
      '$out | ConvertTo-Json -Compress } else { "[]" }'
  );
  for (const i of lista(regRaw)) instancias.push(i);

  if (instancias.length) {
    tabela(instancias, [
      { titulo: 'Instância', valor: (r) => r.Instance },
      { titulo: 'TcpEnabled', valor: (r) => (r.TcpEnabled == null ? '?' : r.TcpEnabled) },
      { titulo: 'Porta fixa', valor: (r) => r.IpAllPort || r.TcpPort || '' },
      { titulo: 'Porta dinâmica', valor: (r) => r.IpAllDynamic || r.Dynamic || '' }
    ]);
    for (const i of instancias) {
      const tcpOn = Number(i.TcpEnabled) === 1;
      if (!tcpOn) {
        aviso(`TCP/IP DESABILITADO na instância ${i.Instance} → ela não aceita conexão por rede/IP.`);
        info('Habilite em: SQL Server Configuration Manager → Configuração de Rede do SQL Server →');
        info(`  Protocolos de ${i.Instance} → TCP/IP → Habilitado = Sim → reinicie o serviço.`);
      }
    }
  } else {
    aviso('Não foi possível ler o registro das instâncias (sem permissão?) — siga pelas portas abertas.');
  }

  titulo('4) Portas que os serviços do SQL Server estão realmente escutando');
  const portasRaw = psJson(
    '$svcs = Get-CimInstance Win32_Service -ErrorAction SilentlyContinue | ' +
      "Where-Object { $_.Name -eq 'MSSQLSERVER' -or $_.Name -like 'MSSQL$*' };" +
      '$conns = Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue;' +
      '$out = foreach($s in $svcs){' +
      '$p = @($conns | Where-Object { $_.OwningProcess -eq $s.ProcessId } | ForEach-Object LocalPort | Sort-Object -Unique);' +
      '[pscustomobject]@{ Service=$s.Name; State=$s.State; Ports=@($p) } };' +
      'if($out){$out | ConvertTo-Json -Compress}else{"[]"}'
  );
  for (const p of lista(portasRaw)) portasPorInstancia.push(p);

  const portasConhecidas = new Set();
  if (portasPorInstancia.length) {
    tabela(portasPorInstancia, [
      { titulo: 'Serviço', valor: (r) => r.Service },
      { titulo: 'Status', valor: (r) => r.State },
      { titulo: 'Portas TCP em escuta', valor: (r) => (lista(r.Ports).filter(Boolean).join(', ') || '(nenhuma)') }
    ]);
    for (const p of portasPorInstancia) {
      for (const porta of lista(p.Ports).filter(Boolean)) portasConhecidas.add(Number(porta));
    }
    if (!portasConhecidas.size) {
      falha('Nenhum serviço do SQL Server está escutando em TCP: só dá para conectar por memória compartilhada/named pipes (mesma máquina, dentro do mesmo processo).');
      info('É isso que quebra o Node: o driver ODBC precisa de TCP (ou de named pipes habilitado).');
    }
    if (!portasConhecidas.has(1433)) {
      aviso('Nenhum serviço escuta em 1433 → por isso a mensagem "localhost,1433 / servidor não encontrado".');
    }
  } else {
    aviso('Não foi possível mapear portas por serviço.');
  }

  const udp = psJson(
    'Get-NetUDPEndpoint -ErrorAction SilentlyContinue | Where-Object { $_.LocalPort -eq 1434 } | ' +
      'Select-Object LocalAddress,LocalPort,OwningProcess | ConvertTo-Json -Compress'
  );
  const browsersUdp = lista(udp).filter(Boolean);
  if (browsersUdp.length) ok('UDP 1434 (SQL Browser) está atendendo.');
  else aviso('UDP 1434 não está atendendo → descoberta de instância nomeada não funciona.');

  titulo('5) Drivers ODBC instalados');
  const drvRaw = psJson(
    "(Get-OdbcDriver -ErrorAction SilentlyContinue | Where-Object { $_.Name -like '*SQL Server*' } | " +
      "ForEach-Object { $_.Name } | Sort-Object -Unique) | ConvertTo-Json -Compress"
  );
  const drivers = lista(drvRaw).filter(Boolean);
  if (drivers.length) for (const d of drivers) log(`  - ${d}`);
  else falha('Nenhum driver ODBC de SQL Server encontrado.');
  if (drivers.some((d) => /ODBC Driver 18/.test(d))) ok('ODBC Driver 18 presente (necessário para DB_AUTH=windows).');
  else if (drivers.some((d) => /ODBC Driver 17/.test(d))) {
    aviso('Só o ODBC Driver 17 foi encontrado.');
    info('Defina DB_ODBC_DRIVER=ODBC Driver 17 for SQL Server no .env (ou instale o 18).');
  } else falha('ODBC Driver 18 não encontrado — instale "Microsoft ODBC Driver 18 for SQL Server".');

  titulo('6) Testes com sqlcmd (se instalado) — com -C para ignorar certificado');
  const sqlcmdPath = ps("(Get-Command sqlcmd -ErrorAction SilentlyContinue).Source");
  if (!sqlcmdPath || /erro|não|error/i.test(sqlcmdPath)) {
    aviso('sqlcmd não encontrado no PATH (não é obrigatório; a seção 7 testa via Node).');
  } else {
    const alvos = ['localhost'];
    for (const i of instancias) {
      if (i.Instance && i.Instance !== 'MSSQLSERVER') alvos.push(`localhost\\${i.Instance}`);
    }
    for (const porta of portasConhecidas) alvos.push(`localhost,${porta}`);
    const unicos = alvos.filter((v, i, a) => a.indexOf(v) === i).slice(0, 6);
    for (const alvo of unicos) {
      const r = ps(`sqlcmd -S "${alvo}" -E -C -l 5 -Q "SET NOCOUNT ON; SELECT @@SERVERNAME" 2>&1`);
      const texto = `${r}`.replace(/\s+/g, ' ');
      if (/cadeia de certifica|não é de confiança|certificate chain/i.test(texto)) {
        aviso(`sqlcmd -S ${alvo} → o servidor RESPONDEU (só recusou o certificado: é o padrão do ODBC 18).`);
        info('Ou seja: a rede/porta nesse endereço está OK. O app não sofre disso porque usa Encrypt=No.');
      } else if (/Login failed|login falhou|18456/i.test(texto)) {
        ok(`sqlcmd -S ${alvo} → conectou no servidor (só o login do Windows não tem permissão).`);
      } else if (/rows affected|--|@@SERVERNAME/i.test(texto) && !/erro|error/i.test(texto)) {
        ok(`sqlcmd -S ${alvo} → conectou e consultou com sucesso.`);
      } else {
        falha(`sqlcmd -S ${alvo} → ${texto.slice(0, 160)}`);
      }
    }
  }
} else {
  titulo('2) Verificações de ambiente');
  aviso(`Este script foi feito para Windows (plataforma atual: ${process.platform}). Seguindo só com os testes de conexão.`);
}

// ---------------------------------------------------------------------------
// 7. Testes de conexão reais (mesma pilha do sistema)
// ---------------------------------------------------------------------------
titulo('7) Testes de conexão (mssql + ODBC, igual ao sistema)');

const authMode = (lerEnv('DB_AUTH') || 'windows').toLowerCase();
let sql;
let autenticacaoIntegrada = authMode === 'windows';
try {
  sql = autenticacaoIntegrada ? require('mssql/msnodesqlv8') : require('mssql');
} catch (erro) {
  if (autenticacaoIntegrada) {
    aviso(`Driver de autenticação integrada indisponível: ${String(erro.message).split('\n')[0]}`);
    info('Provavelmente falta "npm install" (pacote msnodesqlv8 compila módulo nativo).');
    info('Os testes abaixo continuarão somente com login SQL (DB_USER/DB_PASSWORD).');
    autenticacaoIntegrada = false;
    try {
      sql = require('mssql');
    } catch {
      falha('Pacote mssql não encontrado. Rode "npm install" na pasta do projeto.');
      fs.writeFileSync(LOG_PATH, linhasLog.join('\n'), 'utf8');
      process.exit(1);
    }
  } else {
    falha(`Não foi possível carregar o driver: ${erro.message}`);
    fs.writeFileSync(LOG_PATH, linhasLog.join('\n'), 'utf8');
    process.exit(1);
  }
}

const driver = lerEnv('DB_ODBC_DRIVER') || 'ODBC Driver 18 for SQL Server';

function baseCfg() {
  return {
    database: 'master',
    connectionTimeout: 8000,
    requestTimeout: 15000,
    pool: { max: 1, min: 0, idleTimeoutMillis: 5000 },
    options: {
      encrypt: boolEnv('DB_ENCRYPT', false),
      trustServerCertificate: boolEnv('DB_TRUST_SERVER_CERT', true),
      enableArithAbort: true
    }
  };
}

function candidatos() {
  const out = [];
  const vistos = new Set();
  const push = (rotulo, cfg, extra = {}) => {
    const chave = JSON.stringify([rotulo, cfg.connectionString || '', cfg.server, cfg.port, cfg.options?.instanceName]);
    if (vistos.has(chave)) return;
    vistos.add(chave);
    out.push({ rotulo, cfg, ...extra });
  };
  const servidor = lerEnv('DB_SERVER') || 'localhost';
  const base = baseCfg();

  // 1) exatamente como está no .env
  const atual = { ...base, server: servidor };
  if (lerEnv('DB_PORT')) atual.port = Number(lerEnv('DB_PORT'));
  else if (!lerEnv('DB_INSTANCE')) atual.port = 1433;
  if (lerEnv('DB_INSTANCE')) atual.options = { ...atual.options, instanceName: lerEnv('DB_INSTANCE') };
  push('.env atual', atual);

  // 2) connection string completa, se configurada
  if (lerEnv('DB_CONNECTION_STRING')) {
    push('DB_CONNECTION_STRING do .env', { ...base, server: servidor, connectionString: lerEnv('DB_CONNECTION_STRING') });
  }

  // 3) instâncias nomeadas (via SQL Browser)
  const nomes = new Set(
    instancias.map((i) => i.Instance).filter((n) => n && n !== 'MSSQLSERVER').concat(['SQLEXPRESS'])
  );
  for (const nome of nomes) {
    push(`${servidor}\\${nome} (instância nomeada)`, {
      ...base,
      server: servidor,
      options: { ...base.options, instanceName: nome }
    });
  }

  // 4) porta(s) real(is) descobertas + 1433
  const portas = new Set([...portasPorInstancia.flatMap((p) => lista(p.Ports).filter(Boolean).map(Number)), 1433]);
  for (const porta of [...portas].filter((p) => p > 0).sort((a, b) => a - b)) {
    push(`${servidor},${porta} (porta fixa)`, { ...base, server: servidor, port: porta });
  }

  // 5) Connection strings SEM porta e com Encrypt=No: é o que o sqlcmd usa quando
  //    o TCP não está habilitado (memória compartilhada / named pipes no mesmo PC).
  const alvosLocais = [servidor];
  for (const nome of nomes) alvosLocais.push(`${servidor}\\${nome}`);
  for (const alvo of alvosLocais.filter((v, i, a) => a.indexOf(v) === i)) {
    const cs =
      `Driver={${driver}};Server=${alvo};Database=master;Trusted_Connection=Yes;Encrypt=No`;
    push(`connection string sem porta (Encrypt=No): ${alvo}`, { ...base, server: alvo.split('\\')[0], connectionString: cs });
    const csPipe = `${cs};Network Library=dbmslpcn`;
    push(`named pipes/shared memory: ${alvo}`, { ...base, server: alvo.split('\\')[0], connectionString: csPipe });
  }

  // 6) LocalDB
  for (const nomeLocal of ['(localdb)\\MSSQLLocalDB', '(localdb)\\v11.0']) {
    push(`${nomeLocal} (LocalDB)`, {
      ...base,
      server: nomeLocal,
      connectionString:
        `Driver={${driver}};Server=${nomeLocal};Database=master;` +
        `Trusted_Connection=Yes;Encrypt=${boolEnv('DB_ENCRYPT', false) ? 'Yes' : 'No'};`
    });
  }

  // 7) login SQL, se preenchido
  const usuario = lerEnv('DB_USER');
  const senha = lerEnv('DB_PASSWORD');
  if (usuario && senha) {
    for (const item of [...out]) {
      if (item.cfg.connectionString) continue;
      push(`${item.rotulo} + login SQL (${usuario})`, {
        ...item.cfg,
        user: usuario,
        password: senha,
        options: { ...item.cfg.options, trustedConnection: false }
      });
    }
  }
  return out;
}

async function testar(item) {
  const cfg = { ...item.cfg };
  if (autenticacaoIntegrada) {
    cfg.driver = driver;
    cfg.options = { ...cfg.options, trustedConnection: true };
  }
  let pool;
  try {
    pool = await new sql.ConnectionPool(cfg).connect();
    const r = await pool.request().query(
      "SELECT @@SERVERNAME AS servidor, ISNULL(SERVERPROPERTY('InstanceName'), '(padrão)') AS instancia, " +
        "SERVERPROPERTY('ProductVersion') AS versao, SUSER_SNAME() AS login, DB_NAME() AS banco"
    );
    const d = r.recordset?.[0] || {};
    return { ok: true, detalhe: `${d.servidor} | instância ${d.instancia} | versão ${d.versao} | login ${d.login}` };
  } catch (erro) {
    const msg = (erro.message || String(erro)).replace(/\s+/g, ' ');
    return {
      ok: false,
      detalhe: msg.slice(0, 240),
      certificado: /certific|SSL/i.test(msg),
      semAcesso: /não encontrado|not found|not accessible|ECONNREFUSED|Failed to connect|timeout/i.test(msg)
    };
  } finally {
    if (pool) await pool.close().catch(() => {});
  }
}

async function main() {
  const listaCandidatos = candidatos();
  let vencedor = null;
  for (const item of listaCandidatos) {
    // eslint-disable-next-line no-await-in-loop
    const r = await testar(item);
    if (r.ok) {
      log(`  Testando ${item.rotulo} ... CONECTOU`);
      ok(r.detalhe);
      if (!vencedor) vencedor = item;
    } else {
      log(`  Testando ${item.rotulo} ... falhou`);
      info(r.detalhe);
      if (r.certificado) {
        info('↳ o servidor respondeu: é só validação de certificado (o app usa Encrypt=No, deve passar).');
      }
    }
    // eslint-disable-next-line no-await-in-loop
    await sleep(80);
  }

  // -------------------------------------------------------------------------
  // 8. Resumo
  // -------------------------------------------------------------------------
  titulo('8) RESUMO');

  if (!vencedor) {
    falha('Nenhuma configuração conectou.');
    const tcpDesligado = instancias.filter((i) => Number(i.TcpEnabled) !== 1).map((i) => i.Instance);
    const semPorta = portasPorInstancia.filter((p) => !lista(p.Ports).filter(Boolean).length);
    if (tcpDesligado.length) {
      info(`Instâncias com TCP/IP desabilitado: ${tcpDesligado.join(', ')}.`);
      info('Corrija em SQL Server Configuration Manager → Configuração de Rede do SQL Server →');
      info('Protocolos de <instância> → TCP/IP → Habilitado = Sim → reinicie o serviço.');
    }
    if (semPorta.length) {
      info(`Serviços rodando sem nenhuma porta TCP: ${semPorta.map((p) => p.Service).join(', ')}.`);
      info('Mesma correção acima (habilitar TCP/IP e reiniciar o serviço).');
    }
    const browserSvc = servicos.find((s) => s.Name === 'SQLBrowser');
    if (browserSvc && browserSvc.State !== 'Running') {
      info('SQL Server Browser parado: para usar DB_INSTANCE, inicie o serviço (services.msc)');
      info('ou use DB_PORT com a porta fixa que você configurar em IPAll.');
    }
    info('Rode este script de novo depois de corrigir — o log completo está em ' + LOG_PATH);
    fs.writeFileSync(LOG_PATH, linhasLog.join('\n'), 'utf8');
    process.exitCode = 1;
    return;
  }

  const alvo = vencedor;
  const instanciaNomeada = alvo.cfg.options?.instanceName;
  const ehLocalDb = Boolean(alvo.cfg.connectionString) && /localdb/i.test(alvo.cfg.connectionString);
  const portaFixa = alvo.cfg.port;

  log('');
  ok(`Configuração que funciona: ${alvo.rotulo}`);
  log('');
  log('  Cole no arquivo .env (pasta do projeto):');
  linha('-');
  log(`  DB_AUTH=${autenticacaoIntegrada ? 'windows' : 'sql'}`);
  log(`  DB_ODBC_DRIVER=${driver}`);
  log(`  DB_SERVER=${lerEnv('DB_SERVER') || 'localhost'}`);
  if (ehLocalDb) {
    log('  DB_INSTANCE=');
    log('  DB_PORT=');
    log(`  DB_CONNECTION_STRING=${alvo.cfg.connectionString}`);
  } else if (instanciaNomeada) {
    log(`  DB_INSTANCE=${instanciaNomeada}`);
    log('  DB_PORT=');
  } else {
    log('  DB_INSTANCE=');
    log(`  DB_PORT=${portaFixa || 1433}`);
  }
  log(`  DB_NAME=${lerEnv('DB_NAME') || 'FabricaPneus'}`);
  log(`  DB_ENCRYPT=${boolEnv('DB_ENCRYPT', false) ? 'true' : 'false'}`);
  log(`  DB_TRUST_SERVER_CERT=${boolEnv('DB_TRUST_SERVER_CERT', true) ? 'true' : 'false'}`);
  linha('-');
  log('');
  if (!autenticacaoIntegrada) {
    aviso('Estes testes usaram login SQL; para autenticação integrada instale/rode o build do msnodesqlv8.');
  }
  if (instanciaNomeada) {
    const b = servicos.find((s) => s.Name === 'SQLBrowser');
    if (b && b.State !== 'Running') {
      aviso('O SQL Server Browser está parado hoje: DB_INSTANCE só funciona com ele em execução,');
      info('ou fixe a porta em IPAll e use DB_PORT em vez de DB_INSTANCE.');
    }
  }
  log('  Depois rode: npm start   (ou duplo clique em iniciar.bat)');
  log('  Importante: o banco FabricaPneus é criado na instância informada —');
  log('  se seus dados antigos estão em OUTRA instância, aponte para ela.');
  log('');
  fs.writeFileSync(LOG_PATH, linhasLog.join('\n'), 'utf8');
  log(`  (log completo salvo em ${LOG_PATH})`);
}

main().catch((erro) => {
  console.error('Falha inesperada no diagnóstico:', erro);
  try {
    fs.writeFileSync(LOG_PATH, linhasLog.join('\n'), 'utf8');
  } catch {
    /* ignora */
  }
  process.exit(1);
});
