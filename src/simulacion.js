/**
 * simulacion.js
 * Experimentos sobre el modelo de colas ("sistema real"):
 *  - barrido de lambda sobre una configuración hasta U ~ 0,90,
 *  - enumeración de configuraciones con sum N_i <= MAX_SERVIDORES,
 *  - generación de la base de datos de aprendizaje T(N(gamma), lambda(gamma)).
 */
const { cargaPorClase, mva, cargaMaxima } = require('./calculos');

/** Evalúa el sistema real para una configuración y una carga. */
function evaluar(N, lambda, fA, nuA, nuB, penaliza = 'enunciado') {
  return mva(lambda, cargaPorClase(lambda, fA, nuA, nuB), N, penaliza);
}

/**
 * Barrido de lambda desde `desde` con `paso`, mientras ningún recurso supere `umbral`.
 * Devuelve una fila por punto evaluado.
 */
function barridoLambda(N, fA, nuA, nuB, { desde, paso, umbral, penaliza = 'enunciado' }) {
  const filas = [];
  for (let k = 0; ; k++) {
    const lambda = +(desde + k * paso).toFixed(6);
    const res = evaluar(N, lambda, fA, nuA, nuB, penaliza);
    if (res.Umax > umbral + 1e-9) break;
    filas.push({ lambda, ...res });
  }
  return filas;
}

/** Todas las configuraciones <N_WS, N_AS, N_DS> con N_i >= 1 y suma <= maxTotal. */
function generarConfiguraciones(maxTotal) {
  const lista = [];
  for (let a = 1; a <= maxTotal; a++)
    for (let b = 1; a + b <= maxTotal; b++)
      for (let c = 1; a + b + c <= maxTotal; c++) lista.push([a, b, c]);
  return lista;
}

/**
 * Base de datos de aprendizaje: para cada configuración se recorre lambda en una
 * rejilla (desde `paso` op/s) hasta que algún recurso alcanza U = umbral.
 * Cada fila es un experimento gamma: (N(gamma), lambda(gamma), T(gamma)).
 * Además se resume, por configuración, la carga máxima (U = umbral, exacta) y T en ella.
 */
function generarBaseDatos(fA, nuA, nuB, { maxTotal, paso, umbral }) {
  const configs = generarConfiguraciones(maxTotal);
  const bd = [];
  const resumen = [];
  let gamma = 0;
  for (const N of configs) {
    const filas = barridoLambda(N, fA, nuA, nuB, { desde: paso, paso, umbral });
    for (const f of filas) {
      gamma++;
      bd.push({ gamma, NWS: N[0], NAS: N[1], NDS: N[2], lambda: f.lambda, T: f.T, Umax: f.Umax });
    }
    const cap = cargaMaxima(fA, nuA, nuB, N, umbral);
    const enCap = evaluar(N, cap.lambdaMax, fA, nuA, nuB, 'enunciado');
    const enCapOrig = evaluar(N, cap.lambdaMax, fA, nuA, nuB, 'original');
    resumen.push({
      N, total: N[0] + N[1] + N[2], lambda09: cap.lambdaMax, iCuello: cap.iCuello,
      T09: enCap.T, T09original: enCapOrig.T, lambdaMaxBD: filas.length ? filas[filas.length - 1].lambda : 0,
    });
  }
  return { bd, resumen };
}

module.exports = { evaluar, barridoLambda, generarConfiguraciones, generarBaseDatos };
