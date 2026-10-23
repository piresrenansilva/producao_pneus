// ===== Tema claro / escuro =====
// Tema padrão: claro (branco com verde #01A956).
// Tema escuro: o visual original do sistema.
// A escolha fica salva em localStorage ("gp-tema") e é aplicada antes
// do primeiro paint pelo script inline no <head> do index.html.

(function () {
  "use strict";

  var STORAGE_KEY = "gp-tema";
  var root = document.documentElement;

  function isDark() {
    return root.getAttribute("data-theme") === "dark";
  }

  function setTheme(theme) {
    var dark = theme === "dark";
    if (dark) root.setAttribute("data-theme", "dark");
    else root.removeAttribute("data-theme");
    try { localStorage.setItem(STORAGE_KEY, dark ? "dark" : "light"); } catch (e) {}
    syncButton(dark);
  }

  // O botão mostra a ação: no tema claro exibe a lua ("Escuro"),
  // no tema escuro exibe o sol ("Claro").
  function syncButton(dark) {
    var btn = document.getElementById("themeToggle");
    if (!btn) return;
    btn.setAttribute("aria-pressed", dark ? "true" : "false");
    var title = dark ? "Mudar para o tema claro" : "Mudar para o tema escuro";
    btn.title = title;
    btn.setAttribute("aria-label", title);
    var label = btn.querySelector("[data-theme-label]");
    if (label) label.textContent = dark ? "Claro" : "Escuro";
    var sun = btn.querySelector("[data-icon-sun]");
    var moon = btn.querySelector("[data-icon-moon]");
    if (sun) sun.hidden = !dark;
    if (moon) moon.hidden = dark;
  }

  function init() {
    var saved = null;
    try { saved = localStorage.getItem(STORAGE_KEY); } catch (e) {}
    setTheme(saved === "dark" ? "dark" : "light");
    var btn = document.getElementById("themeToggle");
    if (btn) {
      btn.addEventListener("click", function () {
        setTheme(isDark() ? "light" : "dark");
      });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
