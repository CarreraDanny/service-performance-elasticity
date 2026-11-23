/**
 * prediccion.js
 * Función predictiva g(N, lambda) aprendida a partir de la base de datos
 * T(N(gamma), lambda(gamma)), sin usar los parámetros internos del sistema
 * (ni demandas, ni visitas, ni mezcla de usuarios).
 *
 * Modelo: regresión polinómica por mínimos cuadrados ("caja gris": solo se usa que
 * hay tres capas y cuántos servidores tiene cada una, como en Awad & Menascé):
 *   x_c = lambda / N_c            (carga por servidor en la capa c)
 *   p_c = (N_c - 1) / N_c         (término de replicación)
 *   g = b0 + sum_c [ a_c·p_c + sum_{k=1..4} b_{c,k}·x_c^k ]
 * Las columnas se estandarizan antes de resolver las ecuaciones normales.
 */
const { resolverSistema } = require('./calculos');

const GRADO = 4;

function caracteristicas(N, lambda) {
  const f = [];
  for (let c = 0; c < 3; c++) {
    const x = lambda / N[c];
    f.push((N[c] - 1) / N[c]);
    for (let k = 1; k <= GRADO; k++) f.push(x ** k);
  }
  return f;
}

/** Ajusta g sobre las filas indicadas de la base de datos. */
function entrenar(filas) {
  const X = filas.map((f) => caracteristicas([f.NWS, f.NAS, f.NDS], f.lambda));
  const y = filas.map((f) => f.T);
  const m = X[0].length;
  // Estandarización de columnas
  const media = new Array(m).fill(0);
  const desv = new Array(m).fill(0);
  for (const fila of X) fila.forEach((v, j) => { media[j] += v / X.length; });
  for (const fila of X) fila.forEach((v, j) => { desv[j] += (v - media[j]) ** 2 / X.length; });
  for (let j = 0; j < m; j++) desv[j] = Math.sqrt(desv[j]) || 1;
  const Z = X.map((fila) => [1, ...fila.map((v, j) => (v - media[j]) / desv[j])]);
  // Ecuaciones normales (Z^T Z) w = Z^T y, con una regularización mínima numérica
  const n = m + 1;
  const A = Array.from({ length: n }, () => new Array(n).fill(0));
  const b = new Array(n).fill(0);
  for (let k = 0; k < Z.length; k++) {
    const z = Z[k];
    for (let i = 0; i < n; i++) {
      b[i] += z[i] * y[k];
      for (let j = 0; j < n; j++) A[i][j] += z[i] * z[j];
    }
  }
  for (let i = 1; i < n; i++) A[i][i] += 1e-9;
  const w = resolverSistema(A, b);
  return { w, media, desv, grado: GRADO };
}

/** g(N, lambda) */
function predecir(modelo, N, lambda) {
  const f = caracteristicas(N, lambda);
  let s = modelo.w[0];
  f.forEach((v, j) => { s += modelo.w[j + 1] * (v - modelo.media[j]) / modelo.desv[j]; });
  return s;
}

/** Métricas de ajuste: SSE (ecuación 4), RMSE, error absoluto máximo, MAPE y R^2. */
function metricas(modelo, filas) {
  let sse = 0; let maxAbs = 0; let sumAPE = 0; let media = 0;
  filas.forEach((f) => { media += f.T / filas.length; });
  let sst = 0;
  for (const f of filas) {
    const e = predecir(modelo, [f.NWS, f.NAS, f.NDS], f.lambda) - f.T;
    sse += e * e;
    maxAbs = Math.max(maxAbs, Math.abs(e));
    sumAPE += Math.abs(e) / f.T;
    sst += (f.T - media) ** 2;
  }
  return {
    M: filas.length, SSE: sse, RMSE: Math.sqrt(sse / filas.length),
    maxAbs, MAPE: 100 * sumAPE / filas.length, R2: 1 - sse / sst,
  };
}

/** Generador pseudoaleatorio reproducible (mulberry32). */
function rng(semilla) {
  let a = semilla >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Partición entrenamiento / validación reproducible. */
function particion(filas, fraccion, semilla) {
  const r = rng(semilla);
  const ent = []; const val = [];
  for (const f of filas) (r() < fraccion ? ent : val).push(f);
  return { ent, val };
}

module.exports = { caracteristicas, entrenar, predecir, metricas, rng, particion };
