#!/usr/bin/env node
/* Harnais de tests — app HELI v2 (DIH + motopompes)
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
function inSec(sec, fn) {
  // vérifie qu'une chaîne apparaît dans une section de document (spéc, bullets, table…)
  return JSON.stringify(sec).indexOf(fn) !== -1;
}
function secOf(docId, icon) {
  var d = M.DOCS.filter(function (x) { return x.id === docId; })[0];
  return d ? d.sections.filter(function (s) { return s.icon === icon; })[0] : null;
}

section("Structure des données");
T("4 motopompes", M.PUMPS.length === 4);
T("identifiants uniques", ["mark3", "tohatsu", "efp500", "fyrpak"].every(function (id, i) { return M.PUMPS[i] && M.PUMPS[i].id === id; }));
var byId = {};
M.PUMPS.forEach(function (p) { byId[p.id] = p; });

section("Structure des documents DIH");
T("4 documents DIH", M.DOCS.length === 4);
T("identifiants DIH dans l'ordre", ["reflexe", "grue", "equipier", "chef"].every(function (id, i) { return M.DOCS[i] && M.DOCS[i].id === id; }));
var docById = {};
M.DOCS.forEach(function (d) { docById[d.id] = d; });

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

section("Fiche réflexe N°1 — données du document");
var rf = docById.reflexe;
var rfP1 = secOf("reflexe", "🚨"), rfP2 = secOf("reflexe", "🧑‍🤝‍🧑"), rfP3 = secOf("reflexe", "🎒"), rfP4 = secOf("reflexe", "🚦"), rfObs = secOf("reflexe", "📝");
T("MAJ 16/04/2020 dans le sous-titre", rf.subtitle.indexOf("16/04/2020") !== -1);
T("phase 1 = 5 étapes", rfP1 && rfP1.steps.length === 5);
T("phase 1 : présence ou pas d'hélicoptère", inSec(rfP1, "présence ou pas d'hélicoptère"));
T("phase 1 : demander au COSSIM la fréquence de chantier", inSec(rfP1, "Fréquence de chantier"));
T("phase 1 : engagement minimum de 2 CCF", inSec(rfP1, "2 CCF"));
T("phase 2 = ordre préparatoire PATRACDR (8 items)", rfP2 && rfP2.steps.length === 8);
T("phase 2 : DIH 1 équipier / DIH 2 DZE-DZP", inSec(rfP2, "DIH 1 : équipier, conducteur PL") && inSec(rfP2, "DIH 2 : DZE, DZP, chef d'équipe"));
T("phase 2 : autonomie 48 h", inSec(rfP2, "autonomie du groupe de 48 h"));
T("phase 2 : DZE = adjoint au chef de stick", inSec(rfP2, "DZE : adjoint au chef de stick"));
T("phase 3 = 4 étapes", rfP3 && rfP3.steps.length === 4);
T("phase 3 : clé N°23 du bureau HELI", inSec(rfP3, "clé N°23"));
T("phase 3 : PAS au local GIMAé", inSec(rfP3, "PAS au local GIMAé"));
T("phase 3 : 7 Antarès + cartes IGN/DFCI", inSec(rfP3, "7 Antarès") && inSec(rfP3, "cartes IGN, DFCI"));
T("phase 4 = 3 étapes", rfP4 && rfP4.steps.length === 3);
T("phase 4 : ordre de mouvement DPIF", inSec(rfP4, "ordre de mouvement (DPIF)"));
T("phase 4 : Corse → CMP médicaments mal de mer", inSec(rfP4, "mal de mer"));
T("observations : renfort extérieur", rfObs && inSec(rfObs, "VRCC, VRCG, CM DIH, 2 CCF, TPHR"));
T("observations : stick à 7 pax possible", inSec(rfObs, "7 pax"));

section("Grue CM DIH — données du document");
var gr = docById.grue;
var g1 = secOf("grue", "🔌"), g2 = secOf("grue", "🧱"), g3 = secOf("grue", "🏗"), gSec = secOf("grue", "⚠️"), g4 = secOf("grue", "📦"), g5 = secOf("grue", "🚚");
T("phase 1 = 3 étapes (mise sous tension)", g1 && g1.steps.length === 3);
T("prise de mouvement = BIP long", inSec(g1, "BIP long"));
T("télécommande POWER = BIP court", inSec(g1, "BIP court") && inSec(g1, "POWER"));
T("déverrouillage des BAU", inSec(g1, "BAU"));
T("phase 2 = 13 étapes (stabilisation)", g2 && g2.steps.length === 13);
T("goupille anti-rotation retirée puis remise", inSec(g2, "Retirer la goupille anti-rotation") && inSec(g2, "Remettre la goupille anti-rotation"));
T("manette rouge + niveaux à bulles", inSec(g2, "manette rouge") && inSec(g2, "niveaux à bulles"));
T("acquittement : symboles stabilisateurs en noir", inSec(g2, "en noir"));
T("répéter pour le second stabilisateur", inSec(g2, "second stabilisateur"));
T("phase 3 = 5 étapes (utilisation)", g3 && g3.steps.length === 5);
T("manette du bras secondaire pendant 10 s", inSec(g3, "10 s"));
T("affichage « grue au repos » (sécurité)", inSec(g3, "grue au repos"));
T("déployer d'abord le bras principal", inSec(g3, "bras principal"));
T("NE JAMAIS se placer sous le bras ou la charge", gSec && inSec(gSec, "NE JAMAIS se placer sous le bras"));
T("BIP alternatif = 90 %", inSec(gSec, "90 %"));
T("BIP continu = 100 % + manœuvre non aggravante", inSec(gSec, "100 %") && inSec(gSec, "manœuvre non aggravante"));
T("phase 4 = 3 étapes (remise en place)", g4 && g4.steps.length === 3);
T("verrouillage du télescope", inSec(g4, "verrouillage du télescope"));
T("phase 5 = 5 étapes (position route)", g5 && g5.steps.length === 5);
T("3 sécurités position route (capteurs + MOL)", inSec(g5, "3 sécurités") && inSec(g5, "MOL"));

section("Équipier DIH — données du document");
var eq = docById.equipier;
var eqMat = secOf("equipier", "🛠"), eqStick = secOf("equipier", "🧑‍🤝‍🧑"), eqEng = secOf("equipier", "🚒"), eqEtab = secOf("equipier", "💧"), eqBiv = secOf("equipier", "⛺"), eqDz = secOf("equipier", "🚁"), eqEmb = secOf("equipier", "🛡"), eqVol = secOf("equipier", "✈️"), eqSling = secOf("equipier", "🪝");
T("motopompes DIH 250/4 · 160/9 · 80/12", inSec(eqMat, "250/4 · 160/9 · 80/12"));
T("motopompe DIH 16 kg, mélange 4 %, 8 h avec 20 L", inSec(eqMat, "16 kg") && inSec(eqMat, "8 h mini (avec 20 litres)"));
T("flottante type Fyrflot 22 kg", inSec(eqMat, "Fyrflot") && inSec(eqMat, "22 kg"));
T("WAJAX 250/10 — 25 kg — DN 65", inSec(eqMat, "WAJAX") && inSec(eqMat, "250/10") && inSec(eqMat, "DN 65"));
T("citernes souples 500/800/1000 L", inSec(eqMat, "500 · 800 ou 1000 litres"));
T("CM DIH : 4 claies 45 + 4 claies 23 + 2 claies 70", inSec(eqMat, "4 claies de 45") && inSec(eqMat, "4 claies de 23") && inSec(eqMat, "2 claies de 70"));
T("groupe d'éclairage 27 kg — 2 × 500 W", inSec(eqMat, "27 kg") && inSec(eqMat, "500 W"));
T("stick = 13 hommes", inSec(eqStick, "13 hommes"));
T("tableau du stick (14 lignes)", eqStick && eqStick.rows.length === 14);
T("1 binôme hélico + 4 binômes établissements + 1 binôme alimentation", inSec(eqStick, "1 binôme manœuvres hélicoptères") && inSec(eqStick, "4 binômes manœuvres d'établissements") && inSec(eqStick, "1 binôme d'alimentation"));
T("engins : VRCG (2) CM (3) 2 CCF (2×3) TPHR (2)", inSec(eqEng, "2 hommes") && inSec(eqEng, "3 hommes") && inSec(eqEng, "2 × 3 hommes"));
T("4 hélicoptères (Écureuil, EC145, Dauphin-Panther, Caïman)", ["Écureuil", "EC145", "Dauphin-Panther", "Caïman-NH90"].every(function (h) { return inSec(eqEng, h); }));
T("dévidoir aérien 600 m DN 45 / 400 m DN 70", inSec(eqEtab, "600 m DN 45") && inSec(eqEtab, "400 m DN 70"));
T("rôle de fontainier", inSec(eqEtab, "fontainier"));
T("bivouac : 42 repas et 112 litres d'eau", inSec(eqBiv, "42 repas") && inSec(eqBiv, "112 litres"));
T("bivouac : latrines + sachet Ziploc", inSec(eqBiv, "latrines") && inSec(eqBiv, "Ziploc"));
T("zone d'emport : surface minimum 30 × 30 m", inSec(eqDz, "30 × 30 m"));
T("zone de poser = zone de repli en cas de danger", inSec(eqDz, "zone de repli"));
T("embarquement : matériel à bout de bras, jamais à l'épaule", inSec(eqEmb, "jamais à l'épaule"));
T("disque rotor principal 12 à 16 m", inSec(eqEmb, "12 à 16 m"));
T("vol : brassière de sécurité si survol maritime", inSec(eqVol, "brassière de sécurité"));
T("sling : filet 3,4 m — 1 à 1,4 tonne", inSec(eqSling, "3,4 m") && inSec(eqSling, "1 à 1,4 tonne"));
T("sling : élingue 10 m validée au briefing", inSec(eqSling, "élingue de 10 m"));
T("sling : chasuble jaune du guide", inSec(eqSling, "chasuble de couleur jaune"));
T("sling : STANAG-3117 / OTAN 2014", inSec(eqSling, "STANAG-3117"));

section("Chef d'équipe DIH — données du document");
var ch = docById.chef;
var chEau = secOf("chef", "💧"), chLances = secOf("chef", "🎯"), chJn = secOf("chef", "📉"), chPompes = secOf("chef", "⚙️"), chRadio = secOf("chef", "📻"), chSignes = secOf("chef", "✋"), chZones = secOf("chef", "🗺"), chProj = secOf("chef", "🪝"), chPoids = secOf("chef", "⚖️"), chSout = secOf("chef", "🥫"), chAnn = secOf("chef", "🌬");
T("eau instantanée disponible 7 000 à 8 000 litres", inSec(chEau, "7 000 à 8 000 litres"));
T("contenance tuyaux 4 / 2 / 0,5 L/m", inSec(chEau, "4 litres / mètre") && inSec(chEau, "2 litres / mètre") && inSec(chEau, "0,5 litre / mètre"));
T("lances 40/12 → 250 l/min à 3,5 bars", inSec(chLances, "250 l/min à 3,5 bars"));
T("lances 20/7 → 80 l/min à 3,5 bars", inSec(chLances, "80 l/min à 3,5 bars"));
T("pertes de charge 70/500→0,5 · 45/250→1,5 · 25/80→3,5", chJn && chJn.rows.length === 3 && chJn.rows[0][1] === "0,5" && chJn.rows[1][1] === "1,5" && chJn.rows[2][1] === "3,5");
T("J/Z = ±1 pour 10 mètres", inSec(chJn, "10 mètres"));
T("6 pompes dans le tableau des indices", chPompes && chPompes.rows.length === 6);
T("indice : U 5000 GIMAEX 1000/15", inSec(chPompes, "1000/15"));
T("indice : RVI SIDES 2000/15", inSec(chPompes, "2000/15"));
T("indice : FYRPACK (DSP 45) 250/4 ou 80/12", inSec(chPompes, "250/4 ou 80/12"));
T("indice : WAJAX (DSP 70) 250/10", inSec(chPompes, "250/10"));
T("tuyaux : pas plus de 15 bars", inSec(chPompes, "15 bars"));
T("motopompes : max 2/3 de la capacité", inSec(chPompes, "2/3"));
T("indicatif DIH MARSEILLE", inSec(chRadio, "DIH MARSEILLE"));
T("NS n°31 DIV OPS du 16 juin 2017", inSec(chRadio, "n°31 DIV OPS"));
T("indicatifs MORANE · DRAGON · GUEPARD/HELIOS/ARES", inSec(chRadio, "MORANE") && inSec(chRadio, "DRAGON") && inSec(chRadio, "GUEPARD"));
T("armée de l'air / ALAT : contact après posé", inSec(chRadio, "après posé"));
T("14 signes conventionnels STANAG", chSignes && chSignes.signs.length === 14);
T("signes : B-17 décrochez la charge", chSignes.signs.some(function (s) { return s[0] === "B-17" && s[1].indexOf("Décrochez la charge") !== -1; }));
T("signes : A-52 maintenez la position", chSignes.signs.some(function (s) { return s[0] === "A-52"; }));
T("signes : chasuble jaune exclusive", inSec(chSignes, "chasuble jaune"));
T("zone de poser : 2 citernes souples minimum", inSec(chZones, "deux citernes souples"));
T("zone : humidifier si poussiéreux", inSec(chZones, "humidifier"));
T("projection : aucune charge enlevée sans accord du chef de zone", inSec(chProj, "sans l'accord du chef de zone"));
T("projection : poids · équilibrage · arrimage", inSec(chProj, "équilibrage") && inSec(chProj, "arrimage"));
T("poids : claie DN 45 = 35 kg, dévidoir DN 70 = 280 kg", chPoids && chPoids.rows.some(function (r) { return r[1] === "DN 45" && r[2] === "35"; }) && chPoids.rows.some(function (r) { return r[1] === "DN 70" && r[2] === "280"; }));
T("poids : pax = 80 kg", inSec(chPoids, "pax = 80 kg"));
T("soutien : eau 8 litres / personne / jour", inSec(chSout, "8 litres / personne / jour"));
T("soutien : douche 1 / personne / jour", inSec(chSout, "1 / personne / jour"));
T("KESTREL : agiter 15 s ou attendre 1 min", inSec(chAnn, "15 s") && inSec(chAnn, "1 min"));
T("KESTREL : −15/+50 °C utilisation, −30/+80 °C stockage", inSec(chAnn, "−15 °C à +50 °C") && inSec(chAnn, "−30 °C à +80 °C"));
T("KESTREL : étanche à 1 m, flotte, chute max 2 m", inSec(chAnn, "flotte") && inSec(chAnn, "2 m"));
T("ICOM M87 VHF marine (ANTARES)", inSec(chAnn, "ICOM M87") && inSec(chAnn, "ANTARES"));

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
T("checklists DIH indépendantes des motopompes", (function () { var c = {}; M.toggleCheck(c, "grue", "g2", 4); return M.countDone(c, "grue", "g2", 13) === 1 && M.countDone(c, "mark3", "start", 8) === 0 && M.countDone(c, "grue", "g1", 3) === 0; })());
T("esc() neutralise l'injection HTML", M.esc('<img src=x onerror="a">').indexOf("<img") === -1);

section("Rendu");
var appHtml = getEl("app").innerHTML;
T("navigation : 4 docs DIH + 4 pompes + comparatif", ["reflexe", "grue", "equipier", "chef", "mark3", "tohatsu", "efp500", "fyrpak", "compare"].every(function (id) { return appHtml.indexOf('data-tab="' + id + '"') !== -1; }));
T("rendu initial = Fiche réflexe N°1", M.state.tab === "reflexe" && appHtml.indexOf("Fiche réflexe N°1") !== -1);
T("5 boutons data-check pour la phase 1", (appHtml.match(/data-check="reflexe\|p1\|\d+"/g) || []).length === 5);
T("PATRACDR rendu", appHtml.indexOf("PATRACDR") !== -1);
T("DPIF rendu", appHtml.indexOf("DPIF") !== -1);
var grHtml = M.docHtml(gr, {});
T("grue : BIP alternatif 90 % rendu", grHtml.indexOf("90 %") !== -1);
T("grue : 13 boutons data-check phase 2", (grHtml.match(/data-check="grue\|g2\|\d+"/g) || []).length === 13);
var eqHtml = M.docHtml(eq, {});
T("équipier : tableau du stick rendu", eqHtml.indexOf("DZE") !== -1 && eqHtml.indexOf("MECA") !== -1);
T("équipier : hélicos rendus", eqHtml.indexOf("Écureuil") !== -1 && eqHtml.indexOf("Caïman-NH90") !== -1);
var chHtml = M.docHtml(ch, {});
T("chef : 14 signes rendus", (chHtml.match(/class="code"/g) || []).length === 14);
T("chef : pertes de charge rendues", chHtml.indexOf("0,5") !== -1 && chHtml.indexOf("1,5") !== -1);
T("chef : KESTREL rendu", chHtml.indexOf("KESTREL") !== -1);
var mkHtml = M.pumpHtml(mk, {});
T("MARK 3 : 8 boutons data-check pour le démarrage", (mkHtml.match(/data-check="mark3\|start\|\d+"/g) || []).length === 8);
T("DEL rendue (LED)", mkHtml.indexOf("LED") !== -1);
T("fiche technique rendue", mkHtml.indexOf("379 l/min") !== -1 && mkHtml.indexOf("26,2 bars") !== -1);
T("note carburant rendue", mkHtml.indexOf("ASPEN 2") !== -1);
var cmpHtml = M.compareHtml();
T("comparatif : les 4 colonnes", ["MARK 3", "TOHATSU VE 1500", "EFP-500-FL (GEYSER)", "FYR PAK"].every(function (n) { return cmpHtml.indexOf(n) !== -1; }));
T("comparatif : barres de débit", cmpHtml.indexOf("2 000") !== -1 && cmpHtml.indexOf("480") !== -1);
T("comparatif : règles carburant", cmpHtml.indexOf("50:1") !== -1 && cmpHtml.indexOf("Essence Super") !== -1);
T("TOHATSU : commandes a-h rendues", (function () { var s = M.state.tab; M.state.tab = "tohatsu"; var h = M.pumpHtml(th, {}); M.state.tab = s; return h.indexOf("Horomètre") !== -1 && h.indexOf("Alerte batterie") !== -1; })());
T("EFP : avertissement ⚠ rendu", M.pumpHtml(ef, {}).indexOf("⚠") !== -1);
T("FYR PAK : entretien rendu", M.pumpHtml(fy, {}).indexOf("Remisage") !== -1);

section("Persistance");
T("clé de stockage motopompes-checks-v1 conservée", M.STORE_KEY === "motopompes-checks-v1");
(function () {
  var c = {};
  M.toggleCheck(c, "efp500", "start", 5);
  localStorage.setItem(M.STORE_KEY, JSON.stringify(c));
  var back = M.loadChecks();
  T("aller-retour localStorage", M.isDone(back, "efp500", "start", 5) === true);
  T("case non cochée après rechargement", M.isDone(back, "efp500", "start", 4) === false);
  localStorage.removeItem(M.STORE_KEY);
})();

section("PWA — service worker");
var sw = fs.readFileSync(path.join(__dirname, "sw.js"), "utf8");
T("cache nommé heli-v2", sw.indexOf('"heli-v2"') !== -1);
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
T("nom court « HELI »", mf.short_name === "HELI");
T("nom long HELI — DIH & motopompes", mf.name === "HELI — DIH & motopompes");
T("start_url ./", mf.start_url === "./");
T("display standalone", mf.display === "standalone");
T("3 icônes (svg + 2 png)", mf.icons.length === 3 && mf.icons[0].type === "image/svg+xml");
T("icône maskable 512 présente", mf.icons.some(function (i) { return i.sizes === "512x512" && i.purpose.indexOf("maskable") !== -1; }));
T("icônes référencées existent ou sont générées", mf.icons.every(function (i) { return /\.png$/.test(i.src) ? true : fs.existsSync(path.join(__dirname, i.src)); }));

section("PWA — version, titre & workflow");
var vj = JSON.parse(fs.readFileSync(path.join(__dirname, "version.json"), "utf8"));
T("version.json = v2", vj.version === "v2");
T("titre de page HELI", html.indexOf("<title>HELI — DIH &amp; motopompes</title>") !== -1);
T("APP_VERSION = v2", M.APP_VERSION === "v2");
var verText = null;
Object.defineProperty(versionEl, "textContent", { configurable: true, set: function (v) { verText = v; }, get: function () { return verText || ""; } });
fetchCbs = function (url) {
  if (url === "version.json") return Promise.resolve({ json: function () { return Promise.resolve(vj); } });
  return Promise.reject(new Error("404 " + url));
};
M.loadVersion();
setTimeout(function () {
  T("badge version réseau → « 💾 Hors ligne · v2 »", versionEl.textContent.indexOf("v2") !== -1);

  var yml = fs.readFileSync(path.join(__dirname, ".github", "workflows", "pages.yml"), "utf8");
  T("workflow : gen-icons + upload + deploy", yml.indexOf("gen-icons.js") !== -1 && yml.indexOf("upload-pages-artifact") !== -1 && yml.indexOf("deploy-pages@v4") !== -1);
  T("workflow : path sous with:", yml.indexOf('path: "."') !== -1 && yml.indexOf("with:") !== -1);
  T("service worker enregistré (./sw.js)", swRegistered === "./sw.js");

  console.log("\n========================================");
  console.log("Résultat : " + passed + " test(s) réussi(s), " + failed + " échec(s)");
  console.log("========================================");
  process.exit(failed ? 1 : 0);
});
