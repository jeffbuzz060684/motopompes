#!/usr/bin/env node
/* Harnais de tests — app Motopompes v1
   Usage : node test-harness.js  (dans le dossier contenant index.html)
   Extrait le <script> de index.html, l'exécute avec des stubs DOM,
   puis vérifie données, logique, rendu, PWA et intégrité du shell. */
"use strict";
var fs = require("fs");
var path = require("path");

var SRC = path.join(__dirname, "index.html");
var html = fs.readFileSync(SRC, "utf8");
var m = html.match(/<script>([\s\S]*?)<\/script>/);
if (!m) { console.error("FAIL: pas de <script> dans index.html"); process.exit(1); }
var script = m[1];

/* ---------- stubs DOM ---------- */
function El(id) {
  this.id = id;
  this.innerHTML = "";
  this.listeners = {};
}
El.prototype.addEventListener = function (t, f) { (this.listeners[t] = this.listeners[t] || []).push(f); };
El.prototype.getAttribute = function () { return null; };
El.prototype.textContent = "";

var elements = {};
function getEl(id) { if (!elements[id]) elements[id] = new El(id); return elements[id]; }

var store = {};
var localStorage = {
  getItem: function (k) { return (k in store) ? store[k] : null; },
  setItem: function (k, v) { store[k] = String(v); },
  removeItem: function (k) { delete store[k]; }
};
var domReadyCbs = [];
var document = {
  readyState: "loading",
  getElementById: getEl,
  addEventListener: function (t, f) { if (t === "DOMContentLoaded") domReadyCbs.push(f); },
  body: new El("body")
};
var fetchCbs = null;
var fetch = function (url) {
  if (fetchCbs) return fetchCbs(url);
  return Promise.reject(new Error("no fetch"));
};
var swRegistered = null;
var navigator = {
  serviceWorker: { register: function (u) { swRegistered = u; return Promise.resolve({}); } },
  storage: { persist: function () { return Promise.resolve(true); } }
};
var versionEl = getEl("ver");
var win = global;

win.document = document;
win.localStorage = localStorage;
win.fetch = fetch;
win.addEventListener = function () {};
win.window = win;

/* exécution du script applicatif */
try {
  eval(script);
} catch (e) {
  console.error("FAIL: erreur JS à l'exécution :", e.message);
  process.exit(1);
}
/* déclenche DOMContentLoaded */
domReadyCbs.forEach(function (f) { try { f(); } catch (e) { console.error("FAIL: main() a levé :", e.message); process.exit(1); } });

var M = win.__MOTO;
if (!M) { console.error("FAIL: window.__MOTO absent"); process.exit(1); }

/* ---------- harnais ---------- */
var passed = 0, failed = 0;
function T(name, cond) {
  if (cond) { passed++; console.log("  ok  " + name); }
  else { failed++; console.log("FAIL  " + name); }
}
function section(s) { console.log("\n== " + s + " =="); }

section("Structure des données");
T("4 motopompes", M.PUMPS.length === 4);
T("identifiants uniques", ["mark3", "tohatsu", "efp500", "fyrpak"].every(function (id, i) { return M.PUMPS[i] && M.PUMPS[i].id === id; }));
var byId = {};
M.PUMPS.forEach(function (p) { byId[p.id] = p; });

section("MARK 3 WATSON — données de la notice");
var mk = byId.mark3;
T("code Gallin G221123 dans le sous-titre", mk.subtitle.indexOf("G221123") !== -1);
T("hauteur de charge 267 m", mk.specs.some(function (s) { return s[0].indexOf("Hauteur") === 0 && s[1] === "267 m"; }));
T("pression max 26,2 bars", mk.specs.some(function (s) { return s[1] === "26,2 bars"; }));
T("débit max 379 l/min", mk.specs.some(function (s) { return s[1] === "379 l/min"; }));
T("performances 303/265/151", mk.specs.some(function (s) { return s[1].indexOf("303 l/min à 6,9 bars") !== -1 && s[1].indexOf("151 l/min à 17,2 bars") !== -1; }));
T("poids 19 kg", mk.specs.some(function (s) { return s[1] === "19 kg"; }));
T("moteur 140 cm³ WATERAX", mk.specs.some(function (s) { return s[1].indexOf("WATERAX 140 cm³") !== -1; }));
T("puissance 7,9 kW — 10,6 ch à 7 700 tr/min", mk.specs.some(function (s) { return s[1] === "7,9 kW — 10,6 ch à 7 700 tr/min"; }));
T("mélange 50:1", mk.specs.some(function (s) { return s[1].indexOf("Mélange 50:1") !== -1; }));
T("Aspen 2", mk.fuelNote.indexOf("ASPEN 2") !== -1);
T("jerrican déporté 20 L", mk.specs.some(function (s) { return s[1] === "Jerrican déporté 20 L"; }));
T("consommation 5,7 L/h", mk.specs.some(function (s) { return s[1] === "5,7 L/h"; }));
T("SYM 40 / DSP 40", mk.specs.some(function (s) { return s[1] === "SYM 40 / DSP 40"; }));
T("8 étapes de démarrage", mk.start.length === 8);
T("arrêt = bouton OFF uniquement", mk.stop && mk.stop.length === 1 && mk.stop[0].t.indexOf("OFF") !== -1);
T("7 états de DEL", mk.del.length === 7);
T("DEL : rouge fixe = arrêt (pas d'huile)", mk.del[6][0] === "Rouge fixe" && mk.del[6][1].indexOf("huile") !== -1);
T("DEL : bleu clignotant = survitesse 9 000", mk.del[4][0] === "Bleu clignotant" && mk.del[4][1].indexOf("9 000") !== -1);

section("TOHATSU VE 1500 — données de la notice");
var th = byId.tohatsu;
T("moteur 2 temps 2 cylindres refroidi par eau", th.specs.some(function (s) { return s[1] === "2 temps, 2 cylindres, refroidi par eau"; }));
T("cylindrée 804 cm³", th.specs.some(function (s) { return s[1] === "804 cm³"; }));
T("60 ch / 44 kW", th.specs.some(function (s) { return s[1] === "60 ch / 44 kW"; }));
T("essence Super", th.specs.some(function (s) { return s[1] === "Essence Super"; }));
T("réservoir 24 L", th.specs.some(function (s) { return s[1] === "24 L"; }));
T("consommation 22 L/h", th.specs.some(function (s) { return s[1] === "22 L/h"; }));
T("batterie 12 V — 16 Ah", th.specs.some(function (s) { return s[1] === "12 V — 16 Ah"; }));
T("refoulement 2 × DSP 65", th.specs.some(function (s) { return s[1] === "2 × DSP 65"; }));
T("aspiration AR 100", th.specs.some(function (s) { return s[1] === "AR 100"; }));
T("1 800 l/min à 8 bars / 1 500 à 10 bars", th.specs.some(function (s) { return s[1].indexOf("1 800 l/min à 8 bars") !== -1 && s[1].indexOf("1 500 l/min à 10 bars") !== -1; }));
T("débit max 120 m³/h (2 000 l/min)", th.specs.some(function (s) { return s[1] === "120 m³/h (2 000 l/min)"; }));
T("pression max 16 bars", th.specs.some(function (s) { return s[1] === "16 bars"; }));
T("granulométrie 0,5 mm", th.specs.some(function (s) { return s[1] === "0,5 mm"; }));
T("poids 127 kg", th.specs.some(function (s) { return s[1] === "127 kg"; }));
T("271 kg avec panier dans le sous-titre", th.subtitle.indexOf("271 kg") !== -1);
T("7 commandes & alarmes (a→h)", th.controls.length === 7);
T("alarme niveau d'huile = f", th.controls.some(function (c) { return c[0] === "f" && c[1] === "Alarme niveau d'huile"; }));
T("5 étapes de démarrage", th.start.length === 5);
T("1re étape : fermer les purges", th.start[0].t.indexOf("purges") !== -1);
T("accélérateur sur « S »", th.start.some(function (s) { return s.t.indexOf("« S »") !== -1; }));

section("EFP-500-FL flottante — données de la notice");
var ef = byId.efp500;
T("débit max 480 l/min", ef.specs.some(function (s) { return s[1] === "480 l/min"; }));
T("élévation max 95 m", ef.specs.some(function (s) { return s[1] === "95 m"; }));
T("refoulement 2″ mâle", ef.specs.some(function (s) { return s[1] === "2″ mâle"; }));
T("moteur 2 temps 124 cm³", ef.specs.some(function (s) { return s[1] === "2 temps, 124 cm³"; }));
T("réservoir 5 L", ef.specs.some(function (s) { return s[1] === "5 L"; }));
T("poids 21,2 kg", ef.specs.some(function (s) { return s[1] === "21,2 kg"; }));
T("14 étapes", ef.start.length === 14);
T("étape 1 = mélange 4 % (avertissement)", ef.start[0].warn === true && ef.start[0].t.indexOf("4 %") !== -1);
T("étape 2 = pas d'eau dans l'échappement (avertissement)", ef.start[1].warn === true && ef.start[1].t.indexOf("échappement") !== -1);
T("starter ON puis OFF après claquage", ef.start.some(function (s) { return s.t.indexOf("starter sur ON") !== -1; }) && ef.start.some(function (s) { return s.t.indexOf("starter sur OFF") !== -1; }));
T("batterie externe retirée après démarrage", ef.start.some(function (s) { return s.t.indexOf("retirer la batterie externe") !== -1; }));
T("rinçage final sans projection dans l'échappement", ef.start[13].t.indexOf("rinçage") !== -1 && ef.start[13].d.indexOf("échappement") !== -1);
T("note carburant 4 %", ef.fuelNote.indexOf("4 %") !== -1);

section("FYR PAK — données de la notice");
var fy = byId.fyrpak;
T("moteur 2 temps 134 cm³, 8 ch (6 kW)", fy.specs.some(function (s) { return s[1] === "2 temps, refroidissement à air, 134 cm³, 8 ch (6 kW)"; }));
T("mélange SP95 + 4 % huile 2 temps", fy.specs.some(function (s) { return s[1].indexOf("SP95 + 4 %") !== -1; }));
T("250 l/min à 4 bars · 140 à 10 · 50 à 13", fy.specs.some(function (s) { return s[1].indexOf("250 l/min à 4 bars") !== -1 && s[1].indexOf("50 l/min à 13 bars") !== -1; }));
T("refoulement eau diam. 45", fy.specs.some(function (s) { return s[1] === "Eau diam. 45"; }));
T("coût 4 700 €", fy.specs.some(function (s) { return s[1] === "4 700 €"; }));
T("10 étapes de démarrage", fy.start.length === 10);
T("2 coups de poire d'amorçage", fy.start.some(function (s) { return s.t.indexOf("2 fois la poire") !== -1; }));
T("starter fermé puis ouvert", fy.start.some(function (s) { return s.t.indexOf("starter en position fermée") !== -1; }) && fy.start.some(function (s) { return s.t.indexOf("starter en position ouverte") !== -1; }));
T("3 règles d'entretien/remisage", fy.entretien.length === 3);
T("souffler le filtre à air", fy.entretien[0].indexOf("filtre à air") !== -1);
T("référence FT-U BMNR 003", fy.subtitle.indexOf("FT-U BMNR 003") !== -1);

section("Logique des checklists");
var c1 = {};
M.toggleCheck(c1, "mark3", "start", 0);
M.toggleCheck(c1, "mark3", "start", 1);
M.toggleCheck(c1, "mark3", "start", 2);
T("toggle coche 3 cases", M.countDone(c1, "mark3", "start", 8) === 3);
T("progression 37,5 %", M.progressPct(3, 8) === 37.5);
M.toggleCheck(c1, "mark3", "start", 2);
T("toggle décoche", M.countDone(c1, "mark3", "start", 8) === 2);
M.resetList(c1, "mark3", "start");
T("reset vide la liste", M.countDone(c1, "mark3", "start", 8) === 0);
T("listes indépendantes (start ≠ stop)", (function () { var c = {}; M.toggleCheck(c, "mark3", "stop", 0); return M.countDone(c, "mark3", "start", 8) === 0 && M.countDone(c, "mark3", "stop", 1) === 1; })());
T("esc() neutralise l'injection HTML", M.esc('<img src=x onerror="a">').indexOf("<img") === -1);

section("Rendu");
var appHtml = getEl("app").innerHTML;
T("navigation : 4 pompes + comparatif", appHtml.indexOf('data-tab="mark3"') !== -1 && appHtml.indexOf('data-tab="tohatsu"') !== -1 && appHtml.indexOf('data-tab="efp500"') !== -1 && appHtml.indexOf('data-tab="fyrpak"') !== -1 && appHtml.indexOf('data-tab="compare"') !== -1);
T("rendu initial = MARK 3", M.state.tab === "mark3" && appHtml.indexOf("MARK 3 WATSON") !== -1);
T("8 boutons data-check pour MARK 3", (appHtml.match(/data-check="mark3\|start\|\d+"/g) || []).length === 8);
T("DEL rendue (LED)", appHtml.indexOf("LED") !== -1);
T("fiche technique rendue", appHtml.indexOf("379 l/min") !== -1 && appHtml.indexOf("26,2 bars") !== -1);
T("note carburant rendue", appHtml.indexOf("ASPEN 2") !== -1);
var cmpHtml = M.compareHtml();
T("comparatif : les 4 colonnes", ["MARK 3", "TOHATSU VE 1500", "EFP-500-FL (GEYSER)", "FYR PAK"].every(function (n) { return cmpHtml.indexOf(n) !== -1; }));
T("comparatif : barres de débit", cmpHtml.indexOf("2 000") !== -1 && cmpHtml.indexOf("480") !== -1);
T("comparatif : règles carburant", cmpHtml.indexOf("50:1") !== -1 && cmpHtml.indexOf("Essence Super") !== -1);
T("TOHATSU : commandes a-h rendues", (function () { var s = M.state.tab; M.state.tab = "tohatsu"; var h = M.pumpHtml(th, {}); M.state.tab = s; return h.indexOf("Horomètre") !== -1 && h.indexOf("Alerte batterie") !== -1; })());
T("EFP : avertissement ⚠ rendu", M.pumpHtml(ef, {}).indexOf("⚠") !== -1);
T("FYR PAK : entretien rendu", M.pumpHtml(fy, {}).indexOf("Remisage") !== -1);

section("Persistance");
T("clé de stockage motopompes-checks-v1", M.STORE_KEY === "motopompes-checks-v1");
(function () {
  var c = {}; M.toggleCheck(c, "efp500", "start", 5);
  localStorage.setItem(M.STORE_KEY, JSON.stringify(c));
  var back = M.loadChecks();
  T("aller-retour localStorage", M.isDone(back, "efp500", "start", 5) === true);
  T("case non cochée après rechargement", M.isDone(back, "efp500", "start", 4) === false);
  localStorage.removeItem(M.STORE_KEY);
})();

section("PWA — service worker");
var sw = fs.readFileSync(path.join(__dirname, "sw.js"), "utf8");
T("cache nommé motopompes-v1", sw.indexOf('"motopompes-v1"') !== -1);
T("version.json jamais caché", sw.indexOf("version.json") !== -1 && sw.indexOf("navigate") !== -1);
T("navigation network-first avec secours cache", sw.indexOf('e.request.mode === "navigate"') !== -1 && sw.indexOf("caches.match") !== -1);
T("skipWaiting + clients.claim", sw.indexOf("skipWaiting") !== -1 && sw.indexOf("clients.claim") !== -1);
var shellM = sw.match(/var SHELL = \[([^\]]+)\]/);
var shell = shellM ? shellM[1].match(/"[^"]+"/g).map(function (s) { s = s.slice(1, -1); return s.slice(2) || "./"; }) : [];
T("SHELL non vide (6 entrées)", shell.length === 6);
var missing = shell.filter(function (f) {
  if (f === "./") return false;
  if (/\.png$/.test(f)) return false; // PNG générés par le workflow au déploiement
  return !fs.existsSync(path.join(__dirname, f));
});
T("chaque fichier SHELL (hors PNG workflow) existe dans le dépôt", missing.length === 0 && missing.join(",") === "");

section("PWA — manifest");
var mf = JSON.parse(fs.readFileSync(path.join(__dirname, "manifest.webmanifest"), "utf8"));
T("nom court « Motopompes »", mf.short_name === "Motopompes");
T("start_url ./", mf.start_url === "./");
T("display standalone", mf.display === "standalone");
T("3 icônes (svg + 2 png)", mf.icons.length === 3 && mf.icons[0].type === "image/svg+xml");
T("icône maskable 512 présente", mf.icons.some(function (i) { return i.sizes === "512x512" && i.purpose.indexOf("maskable") !== -1; }));
T("icônes référencées existent ou sont générées", mf.icons.every(function (i) { return /\.png$/.test(i.src) ? true : fs.existsSync(path.join(__dirname, i.src)); }));

section("PWA — version & workflow");
var vj = JSON.parse(fs.readFileSync(path.join(__dirname, "version.json"), "utf8"));
T("version.json = v1", vj.version === "v1");
var verText = null;
Object.defineProperty(versionEl, "textContent", { configurable: true, set: function (v) { verText = v; }, get: function () { return verText || ""; } });
fetchCbs = function (url) {
  if (url === "version.json") return Promise.resolve({ json: function () { return Promise.resolve(vj); } });
  return Promise.reject(new Error("404 " + url));
};
M.loadVersion();
setTimeout(function () {
  T("badge version réseau → « 💾 Hors ligne · v1 »", versionEl.textContent.indexOf("v1") !== -1);

  var yml = fs.readFileSync(path.join(__dirname, ".github", "workflows", "pages.yml"), "utf8");
  T("workflow : gen-icons + upload + deploy", yml.indexOf("gen-icons.js") !== -1 && yml.indexOf("upload-pages-artifact") !== -1 && yml.indexOf("deploy-pages@v4") !== -1);
  T("workflow : path sous with:", yml.indexOf('path: "."') !== -1 && yml.indexOf("with:") !== -1);
  T("service worker enregistré (./sw.js)", swRegistered === "./sw.js");

  console.log("\n========================================");
  console.log("Résultat : " + passed + " test(s) réussi(s), " + failed + " échec(s)");
  console.log("========================================");
  process.exit(failed ? 1 : 0);
});
