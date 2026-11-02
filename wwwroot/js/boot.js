/* Tela de inicialização + etiqueta de versão.
   Carregado automaticamente pelo servidor, sem precisar editar o index.html. */
(function () {
  "use strict";

  var rotulo = document.querySelector(".versao-app");
  if (rotulo && rotulo.textContent.indexOf("boot5090") === -1) {
    rotulo.textContent = rotulo.textContent.trim() + " · boot5090 (2026.11.02)";
  }

  var style = document.createElement("style");
  style.textContent = "@keyframes gpBootSpin{to{transform:rotate(360deg)}}";
  document.head.appendChild(style);

  var overlay = document.createElement("div");
  overlay.id = "bootOverlay";
  overlay.setAttribute("style", [
    "display:none", "position:fixed", "inset:0", "z-index:99999",
    "align-items:center", "justify-content:center",
    "background:rgba(8,20,13,.93)", "color:#eaf7ef",
    "font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif"
  ].join(";"));

  var cartao = document.createElement("div");
  cartao.setAttribute("style", [
    "max-width:460px", "width:calc(100% - 40px)", "padding:28px",
    "border-radius:14px", "background:#12261b", "border:1px solid #2b5c3c",
    "box-shadow:0 18px 50px rgba(0,0,0,.4)", "text-align:center"
  ].join(";"));

  var titulo = document.createElement("div");
  titulo.textContent = "Fábrica de Pneus";
  titulo.style.cssText = "font-size:18px;font-weight:700";
  cartao.appendChild(titulo);

  var spinner = document.createElement("div");
  spinner.style.cssText = "width:32px;height:32px;margin:16px auto;border:3px solid #2b5c3c;border-top-color:#01a956;border-radius:50%;animation:gpBootSpin .8s linear infinite";
  cartao.appendChild(spinner);

  var etapa = document.createElement("div");
  etapa.textContent = "Preparando o banco de dados...";
  etapa.style.cssText = "font-size:14px;line-height:1.5";
  cartao.appendChild(etapa);

  var erro = document.createElement("div");
  erro.style.cssText = "display:none;margin-top:12px;padding:10px;border-radius:8px;background:#3a1b18;font-size:13px;color:#ffb4a8;white-space:pre-wrap;text-align:left";
  cartao.appendChild(erro);

  var dica = document.createElement("div");
  dica.textContent = "A interface abre assim que o SQL Server responder.";
  dica.style.cssText = "margin-top:14px;font-size:12px;opacity:.65";
  cartao.appendChild(dica);

  overlay.appendChild(cartao);
  document.body.appendChild(overlay);

  var pronto = false;
  var timer = null;

  function verificar() {
    if (pronto) return;
    fetch("/api/status", { cache: "no-store" })
      .then(function (resposta) { return resposta.ok ? resposta.json() : null; })
      .then(function (status) {
        if (!status || pronto) return; // servidor antigo sem /api/status: não interfere
        if (status.pronto) {
          pronto = true;
          overlay.style.display = "none";
          if (timer) clearInterval(timer);
          return;
        }
        overlay.style.display = "flex";
        etapa.textContent = status.etapa || "Preparando o banco de dados...";
        if (status.erro) {
          erro.style.display = "block";
          erro.textContent = status.erro;
        } else {
          erro.style.display = "none";
          erro.textContent = "";
        }
      })
      .catch(function () { /* servidor ainda subindo: tenta de novo */ });
  }

  timer = setInterval(verificar, 700);
  verificar();
})();
