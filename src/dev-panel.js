'use strict';

// ===== Painel DEV / feature flags =====
// Um único arquivo (dev-flags.json) controla quais abas aparecem.
// Editar UMA LINHA lá já vale no próximo F5 — não precisa reiniciar o servidor.
// O painel em /dev escreve nesse mesmo arquivo.
const fs = require('node:fs');
const path = require('node:path');

const ARQUIVO = process.env.DEV_FLAGS_FILE
  ? path.resolve(process.env.DEV_FLAGS_FILE)
  : path.join(__dirname, '..', 'dev-flags.json');

// Mesma ordem/ids do NAV em wwwroot/js/utils.js
const MODULOS = [
  ['painel', 'Painel'],
  ['clientes', 'Entidades'],
  ['veiculos', 'Veículos'],
  ['produtos', 'Produtos'],
  ['servicos', 'Serviços'],
  ['carcacas', 'Carcaças'],
  ['estoque', 'Estoque'],
  ['producao', 'Produção'],
  ['vendas', 'Vendas'],
  ['cargas', 'Carga e descarga'],
  ['financeiro', 'Financeiro'],
  ['relatorios', 'Relatórios'],
  ['condicoesPagamento', 'Formas de pagamento']
];
const IDS_VALIDOS = new Set(MODULOS.map(([id]) => id));

function falso(valor) {
  return valor === false || valor === 0 || valor === 'false' || valor === 'off' || valor === 'nao';
}

function travados() {
  // Opcional: MODULOS_DESATIVADOS=relatorios,cargas no .env = trava permanente
  return String(process.env.MODULOS_DESATIVADOS || '')
    .split(/[,;\s]+/).map((s) => s.trim()).filter((id) => IDS_VALIDOS.has(id));
}

function lerFlags() {
  const flags = Object.fromEntries(MODULOS.map(([id]) => [id, true]));
  try {
    const dados = JSON.parse(fs.readFileSync(ARQUIVO, 'utf8'));
    if (dados && typeof dados === 'object' && !Array.isArray(dados)) {
      for (const [id, valor] of Object.entries(dados)) {
        if (IDS_VALIDOS.has(id)) flags[id] = !falso(valor);
      }
    }
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.warn('[dev] Não foi possível ler dev-flags.json:', error.message);
    }
  }
  for (const id of travados()) flags[id] = false;
  return flags;
}

function salvarFlags(recebido) {
  const atual = lerFlags();
  const novo = {};
  for (const [id] of MODULOS) {
    const valor = Object.prototype.hasOwnProperty.call(recebido || {}, id)
      ? recebido[id]
      : atual[id];
    novo[id] = !falso(valor);
  }
  fs.writeFileSync(ARQUIVO, `${JSON.stringify(novo, null, 2)}\n`, 'utf8');
  return lerFlags();
}

function isEnabled(id) {
  return lerFlags()[id] !== false;
}

function somenteLocal(req) {
  const ip = String(req.ip || req.socket?.remoteAddress || '');
  return ip === '::1' || ip === '127.0.0.1' || ip === '::ffff:127.0.0.1' || /^127\./.test(ip);
}

function autorizado(req) {
  if (!somenteLocal(req)) return { ok: false, status: 403, detail: 'O painel DEV só abre neste computador (localhost).' };
  const chave = String(process.env.DEV_KEY || '').trim();
  if (chave && req.get('x-dev-key') !== chave && req.query?.chave !== chave) {
    return { ok: false, status: 401, detail: 'Chave DEV inválida. Use /dev?chave=SUA_CHAVE.' };
  }
  return { ok: true };
}

function guardaDev(req, res, next) {
  const acesso = autorizado(req);
  if (!acesso.ok) return res.status(acesso.status).json({ detail: acesso.detail });
  return next();
}

// ===== HTML injetado no index.html (sem editar o arquivo do projeto) =====
function injetarFlags(html) {
  const flags = lerFlags();
  const desativados = MODULOS.filter(([id]) => flags[id] === false).map(([id]) => id);
  const json = JSON.stringify(flags).replace(/</g, '\\u003c');

  const css = `<style id="gp-flags-css">${desativados
    .map((id) => `#nav button[data-page="${id}"]{display:none!important}`).join('')}</style>`;

  const cliente = [
    '<script>',
    '(function(){',
    '  var f=window.GP_FLAGS||{};',
    '  function off(id){return f[id]===false;}',
    '  function aplicar(){',
    '    document.querySelectorAll("#nav button[data-page]").forEach(function(b){',
    '      if(off(b.dataset.page)){b.style.display="none";b.setAttribute("aria-hidden","true");}',
    '    });',
    '    try{if(typeof page!=="undefined"&&off(page)){page="painel";if(typeof render==="function")render();}}catch(e){}',
    '    var aside=document.querySelector("aside");',
    '    if(aside&&!document.getElementById("gpDevLink")){',
    '      var a=document.createElement("a");a.id="gpDevLink";a.href="/dev";a.textContent="⚙ DEV";',
    '      a.setAttribute("style","display:block;margin:12px 0 0 14px;font-size:11px;opacity:.5;color:inherit;text-decoration:none");',
    '      aside.appendChild(a);',
    '    }',
    '  }',
    '  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",aplicar);else aplicar();',
    '  var nav=document.getElementById("nav");',
    '  if(nav&&window.MutationObserver)new MutationObserver(aplicar).observe(nav,{childList:true,subtree:true});',
    '  document.addEventListener("click",function(e){',
    '    var b=e.target&&e.target.closest&&e.target.closest("#nav button[data-page]");',
    '    if(b&&off(b.dataset.page)){e.preventDefault();e.stopPropagation();}',
    '  },true);',
    '})();',
    '</script>'
  ].join('\n');

  const bloco = `<script>window.GP_FLAGS=${json};</script>\n${css}\n${cliente}\n`;
  return /<\/body>/i.test(html)
    ? html.replace(/<\/body>/i, `${bloco}</body>`)
    : html + bloco;
}

// ===== Página /dev =====
function paginaDev(chave) {
  const chaveJson = JSON.stringify(String(chave || ''));
  return `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Painel DEV — Fábrica de Pneus</title>
<style>
*{box-sizing:border-box}body{margin:0;padding:28px;background:#0d1a13;color:#eaf7ef;font:15px/1.5 system-ui,-apple-system,'Segoe UI',Roboto,sans-serif}
.wrap{max-width:760px;margin:0 auto}h1{font-size:22px;margin:0 0 4px}.sub{opacity:.7;font-size:14px;margin:0 0 22px}
.card{background:#12261b;border:1px solid #2b5c3c;border-radius:12px;padding:18px;margin-bottom:18px}
.row{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:10px 4px;border-bottom:1px solid rgba(255,255,255,.07)}
.row:last-child{border-bottom:0}.nome{font-weight:600}.id{font-size:12px;opacity:.55;font-family:ui-monospace,Consolas,monospace}
.sw{position:relative;width:48px;height:26px;flex:0 0 48px}.sw input{opacity:0;width:100%;height:100%;margin:0;cursor:pointer;position:absolute;z-index:2}
.sw span{position:absolute;inset:0;background:#3a4d42;border-radius:20px;transition:.2s}.sw span:after{content:"";position:absolute;top:3px;left:3px;width:20px;height:20px;border-radius:50%;background:#fff;transition:.2s}
.sw input:checked + span{background:#01a956}.sw input:checked + span:after{transform:translateX(22px)}
.sw input:disabled{cursor:not-allowed}.sw input:disabled + span{opacity:.45}
.tranca{font-size:11px;color:#ffcf8b;margin-left:8px}
code{background:#0a140e;padding:2px 6px;border-radius:5px;font-size:13px}
.btn{display:inline-block;background:#01a956;color:#062012;border:0;border-radius:8px;padding:10px 16px;font-weight:700;cursor:pointer;text-decoration:none;margin-right:8px}
.btn.sec{background:transparent;color:#eaf7ef;border:1px solid #2b5c3c}
#msg{margin-top:12px;font-size:13px;min-height:18px}.ok{color:#7de2a8}.bad{color:#ffb4a8}
.hint{font-size:13px;opacity:.75;line-height:1.6}
</style></head><body><div class="wrap">
<h1>⚙ Painel DEV</h1>
<p class="sub">Ligue/desligue abas do sistema. Salva na hora — dê <b>F5</b> na janela do sistema para ver.</p>
<div class="card"><div id="lista">Carregando...</div></div>
<div class="card">
  <p class="hint"><b>Alternativa sem painel:</b> abra <code>dev-flags.json</code> na pasta do projeto e mude <b>uma linha</b>:<br>
  <code>"relatorios": false</code> &nbsp;→&nbsp; os Relatórios somem do menu. Não precisa reiniciar o servidor.</p>
  <p class="hint">Para travar de vez (o painel não consegue religar), coloque no <code>.env</code>:<br>
  <code>MODULOS_DESATIVADOS=relatorios</code> — se quiser mais de um, separe por vírgula.</p>
</div>
<a class="btn" href="/">← Voltar ao sistema</a>
<button class="btn sec" id="recarregar" type="button">Recarregar lista</button>
<div id="msg"></div>
</div>
<script>
var CHAVE=${chaveJson};
var msg=document.getElementById('msg');
function hdr(){var h={'Content-Type':'application/json'};if(CHAVE)h['x-dev-key']=CHAVE;return h;}
function carregar(){
  fetch('/api/dev/flags',{cache:'no-store',headers:hdr()}).then(function(r){return r.json();}).then(function(d){
    var travados=d.travados||[];
    document.getElementById('lista').innerHTML=d.modulos.map(function(m){
      var on=d.flags[m.id]!==false;
      var trav=travados.indexOf(m.id)>=0;
      return '<div class="row"><div><div class="nome">'+m.nome+'</div><div class="id">'+m.id+
        (trav?'<span class="tranca">travado pelo .env</span>':'')+'</div></div>'+
        '<label class="sw"><input type="checkbox" data-id="'+m.id+'"'+(on?' checked':'')+(trav?' disabled':'')+'><span></span></label></div>';
    }).join('');
    Array.prototype.forEach.call(document.querySelectorAll('#lista input'),function(inp){
      inp.addEventListener('change',function(){
        var payload={};Array.prototype.forEach.call(document.querySelectorAll('#lista input'),function(x){payload[x.dataset.id]=x.checked;});
        msg.className='';msg.textContent='Salvando...';
        fetch('/api/dev/flags',{method:'POST',headers:hdr(),body:JSON.stringify(payload)})
          .then(function(r){return r.json();}).then(function(r){
            if(r.ok){msg.className='ok';msg.textContent='Salvo. Dê F5 no sistema para aplicar.';}
            else{msg.className='bad';msg.textContent=r.detail||'Falha ao salvar.';}
          }).catch(function(e){msg.className='bad';msg.textContent='Erro: '+e.message;});
      });
    });
  }).catch(function(e){document.getElementById('lista').textContent='Erro ao carregar: '+e.message;});
}
document.getElementById('recarregar').onclick=carregar;
carregar();
</script></body></html>`;
}

function registrarDevRoutes(app) {
  app.get('/dev', guardaDev, (req, res) => {
    res.set('Cache-Control', 'no-store').type('html').send(paginaDev(req.query.chave || ''));
  });

  app.get('/api/dev/flags', guardaDev, (req, res) => {
    res.set('Cache-Control', 'no-store').json({
      modulos: MODULOS.map(([id, nome]) => ({ id, nome })),
      flags: lerFlags(),
      travados: travados(),
      arquivo: path.basename(ARQUIVO)
    });
  });

  app.post('/api/dev/flags', guardaDev, (req, res) => {
    const corpo = req.body;
    if (!corpo || typeof corpo !== 'object' || Array.isArray(corpo)) {
      return res.status(400).json({ detail: 'Envie um objeto com os módulos.' });
    }
    const permitido = {};
    for (const [id] of MODULOS) {
      if (Object.prototype.hasOwnProperty.call(corpo, id)) permitido[id] = Boolean(corpo[id]);
    }
    try {
      return res.json({ ok: true, flags: salvarFlags(permitido) });
    } catch (error) {
      return res.status(500).json({ detail: `Não foi possível salvar dev-flags.json: ${error.message}` });
    }
  });
}

module.exports = {
  MODULOS,
  lerFlags,
  salvarFlags,
  isEnabled,
  injetarFlags,
  registrarDevRoutes,
  somenteLocal,
  autorizado
};
