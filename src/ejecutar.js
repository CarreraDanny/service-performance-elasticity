/**
 * ejecutar.js
 * Ejecuta todos los experimentos del caso práctico y guarda los resultados en
 * ./resultados (CSV + resumen.json). Uso:  node src/ejecutar.js
 */
const fs = require('fs');
const path = require('path');
const PR = require('./parametros');
const { frecuenciasVisita, visitasMezcla, cargaMaxima } = require('./calculos');
const { evaluar, barridoLambda, generarBaseDatos } = require('./simulacion');
const { entrenar, metricas, particion } = require('./prediccion');
const { perfilCarga, simularHillClimbing, simularIdeal, resumir } = require('./elasticidad');

const DIR = path.join(__dirname, '..', 'resultados');
fs.mkdirSync(DIR, { recursive: true });

function guardarCSV(nombre, filas) {
  const cab = Object.keys(filas[0]);
  const fmt = (v) => (typeof v === 'number' ? (Number.isFinite(v) ? +v.toPrecision(8) : 'Inf') : Array.isArray(v) ? `"${v.join('-')}"` : v);
  const txt = [cab.join(','), ...filas.map((f) => cab.map((c) => fmt(f[c])).join(','))].join('\n');
  fs.writeFileSync(path.join(DIR, nombre), txt + '\n');
}
const r4 = (x) => +x.toFixed(4);
const resumen = {};

// ---------------------------------------------------------------------------
// 0.1  Frecuencias de visita y distribución de la carga
// ---------------------------------------------------------------------------
const nuA = frecuenciasVisita(PR.P.A);
const nuB = frecuenciasVisita(PR.P.B);
const visitas = PR.CLASES.map((r) => ({
  clase: r, nuA: nuA[r], nuB: nuB[r],
  mezcla_025: PR.MEZCLA_BASE.fA * nuA[r] + PR.MEZCLA_BASE.fB * nuB[r],
  mezcla_060: PR.MEZCLA_ALTERNATIVA.fA * nuA[r] + PR.MEZCLA_ALTERNATIVA.fB * nuB[r],
}));
guardarCSV('01_frecuencias_visita.csv', visitas);
resumen.visitas = visitas.map((v) => ({ ...v, nuA: r4(v.nuA), nuB: r4(v.nuB), mezcla_025: r4(v.mezcla_025), mezcla_060: r4(v.mezcla_060) }));
resumen.visitasTotalesSesion = {
  A: r4(PR.CLASES.reduce((a, r) => a + nuA[r], 0)),
  B: r4(PR.CLASES.reduce((a, r) => a + nuB[r], 0)),
};

// ---------------------------------------------------------------------------
// 0.3  Cuestiones 1-3: barrido de lambda sobre la configuración base
// ---------------------------------------------------------------------------
function experimentoBase(fA, etiqueta) {
  const filas = barridoLambda(PR.CONFIG_BASE, fA, nuA, nuB,
    { desde: PR.LAMBDA_INICIAL, paso: PR.PASO_LAMBDA, umbral: PR.U_LIMITE + PR.U_TOLERANCIA, penaliza: 'ninguna' });
  const v = visitasMezcla(fA, nuA, nuB);
  const sumV = v.reduce((a, b) => a + b, 0);
  const tabla = filas.map((f) => {
    const o = { lambda: f.lambda };
    PR.CLASES.forEach((r, k) => { o[`T_${r}`] = f.Tr[k]; });
    o.T = f.T;
    o.T_por_operacion = f.T / sumV; // sum_r T_r·lambda_r / sum_r lambda_r
    PR.RECURSOS.forEach((rec, i) => { o[`U_${rec}`] = f.U[i]; });
    o.Umax = f.Umax;
    o.cuello = PR.RECURSOS[f.iCuello];
    return o;
  });
  guardarCSV(`02_base_${etiqueta}.csv`, tabla);
  const ult = tabla[tabla.length - 1];
  const cap09 = cargaMaxima(fA, nuA, nuB, PR.CONFIG_BASE, PR.U_LIMITE);
  // Carga a la que T alcanza exactamente T_SLA (bisección entre lambda inicial y saturación)
  const lamSat = cargaMaxima(fA, nuA, nuB, PR.CONFIG_BASE, 1.0).lambdaMax;
  let lo = PR.LAMBDA_INICIAL; let hi = lamSat * (1 - 1e-12);
  for (let k = 0; k < 200; k++) {
    const mid = (lo + hi) / 2;
    if (evaluar(PR.CONFIG_BASE, mid, fA, nuA, nuB, 'ninguna').T < PR.T_SLA) lo = mid; else hi = mid;
  }
  return {
    lambdaEnTSLA: r4(lo), UenTSLA: r4(lo / lamSat), lambdaSaturacion: r4(lamSat),
    fA, puntos: tabla.length, lambdaUltimo: ult.lambda, UmaxUltimo: r4(ult.Umax), TUltimo: r4(ult.T),
    TrUltimo: PR.CLASES.map((r) => r4(ult[`T_${r}`])), TprimerPunto: r4(tabla[0].T),
    lambda09exacta: r4(cap09.lambdaMax), cuello: PR.RECURSOS[cap09.iCuello],
    lambdaCumpleSLA: tabla.filter((f) => f.T <= PR.T_SLA).map((f) => f.lambda).pop(),
  };
}
resumen.base025 = experimentoBase(PR.MEZCLA_BASE.fA, 'fA025');
resumen.base060 = experimentoBase(PR.MEZCLA_ALTERNATIVA.fA, 'fA060');

// ---------------------------------------------------------------------------
// 0.3  Cuestiones 4-5: carga máxima teórica y su dependencia de fA
// ---------------------------------------------------------------------------
function tablaCapacidad(fA) {
  const c = cargaMaxima(fA, nuA, nuB, PR.CONFIG_BASE, 1.0);
  return { fA, u: c.u.map(r4), cuello: PR.RECURSOS[c.iCuello], lambdaMax: r4(c.lambdaMax), lambda09: r4(0.9 * c.lambdaMax) };
}
resumen.capacidad = [tablaCapacidad(PR.MEZCLA_BASE.fA), tablaCapacidad(PR.MEZCLA_ALTERNATIVA.fA)];

const barridoFA = [];
for (let k = 0; k <= 100; k++) {
  const fA = k / 100;
  const c = cargaMaxima(fA, nuA, nuB, PR.CONFIG_BASE, 1.0);
  const o = { fA, lambdaMax: c.lambdaMax, cuello: PR.RECURSOS[c.iCuello] };
  PR.RECURSOS.forEach((rec, i) => { o[`lambdaSat_${rec}`] = 1 / c.u[i]; });
  barridoFA.push(o);
}
guardarCSV('03_lambdamax_vs_fA.csv', barridoFA);
const mejorFA = barridoFA.reduce((a, b) => (b.lambdaMax > a.lambdaMax ? b : a));
resumen.mezclaFavorable = { fA: mejorFA.fA, fB: r4(1 - mejorFA.fA), lambdaMax: r4(mejorFA.lambdaMax), cuello: mejorFA.cuello };
resumen.lambdaMaxExtremos = { fA0: r4(barridoFA[0].lambdaMax), fA1: r4(barridoFA[100].lambdaMax) };

// ---------------------------------------------------------------------------
// 0.3  Segunda parte: configuraciones con Seidmann y base de datos de aprendizaje
// ---------------------------------------------------------------------------
const fAopt = mejorFA.fA;
const { bd, resumen: confs } = generarBaseDatos(fAopt, nuA, nuB,
  { maxTotal: PR.MAX_SERVIDORES, paso: PR.PASO_LAMBDA_BD, umbral: PR.U_LIMITE });
guardarCSV('04_base_datos_aprendizaje.csv', bd);
const filaConf = (c) => ({
  NWS: c.N[0], NAS: c.N[1], NDS: c.N[2], total: c.total, lambda09: c.lambda09,
  cuello: PR.RECURSOS[c.iCuello], T09: c.T09, T09_seidmann_original: c.T09original,
});
guardarCSV('05_configuraciones.csv', confs.map(filaConf));
const base = confs.find((c) => c.N.join() === '1,1,1');
// Mejor configuración (máxima lambda09) para cada número total de servidores
const mejoresPorTotal = [];
for (let s = 3; s <= PR.MAX_SERVIDORES; s++) {
  const grupo = confs.filter((c) => c.total === s);
  const m = grupo.reduce((a, b) => (b.lambda09 > a.lambda09 + 1e-12 || (Math.abs(b.lambda09 - a.lambda09) <= 1e-12 && b.T09 < a.T09) ? b : a));
  mejoresPorTotal.push({ ...filaConf(m), mejoraFrenteBase: m.lambda09 / base.lambda09 });
}
guardarCSV('06_mejor_config_por_total.csv', mejoresPorTotal);
// Algunas configuraciones "ingenuas" para comparar
const comparar = ['1,1,1', '2,2,2', '3,3,3', '4,4,4', '5,5,5', '5,5,6', '1,1,14', '1,2,13', '2,4,10', '3,5,8']
  .map((k) => confs.find((c) => c.N.join() === k)).filter(Boolean).map((c) => ({ ...filaConf(c), mejoraFrenteBase: c.lambda09 / base.lambda09 }));
guardarCSV('07_configuraciones_comparadas.csv', comparar);
resumen.configuraciones = {
  fAusada: fAopt, numConfiguraciones: confs.length, M: bd.length,
  base: filaConf(base),
  mejorGlobal: filaConf(confs.reduce((a, b) => (b.lambda09 > a.lambda09 ? b : a))),
};

// ---------------------------------------------------------------------------
// 0.4  Función predictiva g(N, lambda)
// ---------------------------------------------------------------------------
const { ent, val } = particion(bd, PR.ELASTICIDAD.fraccionEntrenamiento, PR.ELASTICIDAD.semilla);
const gVal = entrenar(ent);
const g = entrenar(bd); // modelo final, entrenado con toda la base de datos
resumen.prediccion = {
  entrenamiento: metricas(gVal, ent), validacion: metricas(gVal, val), completo: metricas(g, bd),
};
// Errores de g por tramos de utilización (validación)
const tramos = [[0, 0.3], [0.3, 0.6], [0.6, 0.8], [0.8, 0.9001]];
resumen.prediccion.porTramoU = tramos.map(([a, b]) => {
  const sub = val.filter((f) => f.Umax >= a && f.Umax < b);
  return { tramo: `${a}-${Math.min(b, 0.9)}`, ...metricas(gVal, sub) };
});
// Muestra de g frente a T real para algunas configuraciones (gráfica)
const { predecir } = require('./prediccion');
const muestraG = bd.filter((f) => ['1,1,1', '2,3,4', '3,5,8', '2,4,10'].includes(`${f.NWS},${f.NAS},${f.NDS}`))
  .map((f) => ({ config: `${f.NWS}-${f.NAS}-${f.NDS}`, lambda: f.lambda, T: f.T, g: predecir(g, [f.NWS, f.NAS, f.NDS], f.lambda) }));
guardarCSV('08_g_vs_real.csv', muestraG);

// ---------------------------------------------------------------------------
// 0.4  Elasticidad: Hill Climbing frente a elasticidad ideal
// ---------------------------------------------------------------------------
const E = PR.ELASTICIDAD;
const cargas = perfilCarga(E.periodos, E.semilla);
const capBD = new Map(confs.map((c) => [c.N.join(','), c.lambdaMaxBD]));
const mezcla = { fA: fAopt, nuA, nuB };
resumen.elasticidad = [];
guardarCSV('09_carga_lambda_t.csv', cargas.map((l, t) => ({ t, lambda: l })));
for (const Tmax of E.escenariosTmax) for (const margen of E.margenes) {
  const sla = { Tmax, margen, lambdaMax: E.lambdaMaxSLA, Nmax: E.Nmax };
  const hc = simularHillClimbing(cargas, mezcla, g, capBD, sla, E.pesos, E.configInicial);
  const ideal = simularIdeal(cargas, mezcla, sla, E.pesos);
  const filas = hc.map((h, t) => ({
    t, lambda: h.lambda, lambdaHat_t2: h.lambdaHat,
    N_hc: h.N, total_hc: h.total, T_hc: h.T, Umax_hc: h.Umax, mu_hc: h.mu, Tpred_decision: h.Tpredicha,
    N_ideal: ideal[t].N, total_ideal: ideal[t].total, T_ideal: ideal[t].T, Umax_ideal: ideal[t].Umax, mu_ideal: ideal[t].mu,
    dmu_hc: t > 0 ? h.mu - hc[t - 1].mu : 0,
  }));
  guardarCSV(`10_elasticidad_Tmax${Tmax}_margen${margen}.csv`, filas);
  const rH = resumir(hc, sla); const rI = resumir(ideal, sla);
  const rU = resumir(simularIdeal(cargas, mezcla, sla, E.pesos, 'utilidad'), sla);
  // Error de predicción de la carga
  let errL = 0; let nL = 0;
  for (let t = 0; t + 2 < cargas.length; t++) { errL += Math.abs(hc[t].lambdaHat - cargas[t + 2]) / cargas[t + 2]; nL++; }
  resumen.elasticidad.push({
    Tmax, margen, hillClimbing: rH, ideal: rI, idealUtilidadPura: rU,
    ratioUtilidad: rH.muSuma / rI.muSuma,
    errorMedioPrediccionCarga: 100 * errL / nL,
    pasosHCmedios: hc.reduce((a, h) => a + h.pasosHC, 0) / hc.length,
    periodosConMismaConfig: hc.filter((h, t) => h.N.join() === ideal[t].N.join()).length,
  });
}
resumen.carga = { min: Math.min(...cargas), max: Math.max(...cargas) };

fs.writeFileSync(path.join(DIR, 'resumen.json'), JSON.stringify(resumen, null, 2));
console.log(JSON.stringify(resumen, null, 2));
