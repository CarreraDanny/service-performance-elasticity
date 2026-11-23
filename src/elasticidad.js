/**
 * elasticidad.js
 * Sección 0.4: función de utilidad mu(t), controlador elástico basado en
 * Hill Climbing (usa solo g(N, lambda) y la base de datos) y mecanismo de
 * elasticidad ideal (usa el modelo real y la carga real).
 */
const { evaluar, generarConfiguraciones } = require('./simulacion');
const { predecir, rng } = require('./prediccion');

/** H(t) según el enunciado. */
function H(T, Tmax) {
  if (T < Tmax) return 0;
  if (T <= 1.5 * Tmax) return (T - Tmax) / Tmax;
  return 1;
}

/** Utilidad (ecuación 5). `lambdaServida` es la carga que el sistema realmente atiende. */
function utilidad(lambdaServida, Ntotal, T, sla, pesos) {
  const [w1, w2, w3] = pesos;
  return w1 * lambdaServida / sla.lambdaMax + w2 * (1 - Ntotal / sla.Nmax) + w3 * (1 - H(T, sla.Tmax));
}

/**
 * Carga de entrada lambda(t) definida para el experimento (no es un dato medido):
 * ciclo suave de 6 a 46 op/s a lo largo de 72 periodos, un pico adicional de
 * +12 op/s alrededor de t = 54 y un ruido multiplicativo de +-4 % con semilla fija.
 */
function perfilCarga(periodos, semilla) {
  const r = rng(semilla);
  const l = [];
  for (let t = 0; t < periodos; t++) {
    const base = 6 + 40 * Math.sin(Math.PI * t / periodos) ** 2 + 12 * Math.exp(-(((t - 54) / 4) ** 2));
    l.push(base * (1 + 0.04 * (2 * r() - 1)));
  }
  return l;
}

/** Observación del sistema real en un periodo: T, U, carga servida y utilidad. */
function observar(N, lambda, mezcla, sla, pesos) {
  const res = evaluar(N, lambda, mezcla.fA, mezcla.nuA, mezcla.nuB);
  // Si algún recurso llega a U >= 1 el sistema solo atiende su capacidad (lambda/Umax).
  const servida = res.saturado ? lambda / res.Umax : lambda;
  const total = N[0] + N[1] + N[2];
  return { T: res.T, Umax: res.Umax, servida, mu: utilidad(servida, total, res.T, sla, pesos) };
}

/** Vecindario del Hill Climbing: añadir, quitar o mover un servidor entre capas. */
function vecinos(N, Nmax) {
  const out = [];
  const ok = (v) => v.every((n) => n >= 1) && v[0] + v[1] + v[2] <= Nmax;
  for (let c = 0; c < 3; c++) {
    const mas = [...N]; mas[c]++; if (ok(mas)) out.push(mas);
    const menos = [...N]; menos[c]--; if (ok(menos)) out.push(menos);
    for (let d = 0; d < 3; d++) {
      if (d === c) continue;
      const mov = [...N]; mov[c]--; mov[d]++; if (ok(mov)) out.push(mov);
    }
  }
  return out;
}

/**
 * Utilidad predicha de una configuración para la carga estimada lambdaHat.
 * Solo usa g(N, lambda) y la capacidad que la base de datos registra para N
 * (mayor lambda con U <= 0,9). Puntuación lexicográfica:
 *  - si la configuración garantiza el SLA (lambdaHat <= capacidad y g <= Tmax),
 *    la puntuación es la utilidad predicha mu (en [0, 1]);
 *  - si hay capacidad (lambdaHat <= capacidad) pero g > Tmax, la puntuación es
 *    -1 - exceso relativo de tiempo, en (-2, -1);
 *  - si no hay capacidad, la puntuación es -2 - falta relativa de capacidad, en (-3, -2).
 * Así el Hill Climbing primero busca capacidad, después cumplir el SLA y, entre
 * las configuraciones que lo cumplen, maximiza la utilidad.
 */
function utilidadPredicha(N, lambdaHat, g, capBD, sla, pesos) {
  // Margen de seguridad: se exige capacidad para lambdaHat·(1+m) y g <= Tmax·(1-m).
  const m = sla.margen || 0;
  const cap = capBD.get(N.join(','));
  const lambdaExigida = lambdaHat * (1 + m);
  const Tobjetivo = sla.Tmax * (1 - m);
  const factible = lambdaExigida <= cap;
  const That = lambdaHat <= cap ? predecir(g, N, lambdaHat) : Infinity;
  const total = N[0] + N[1] + N[2];
  const mu = utilidad(Math.min(lambdaHat, cap), total, That, sla, pesos);
  const cumpleSLA = factible && That <= Tobjetivo;
  let score = mu;
  if (!factible) score = -2 - (lambdaExigida - cap) / lambdaExigida;
  else if (!cumpleSLA) score = -1 - Math.min(0.999, (That - Tobjetivo) / Tobjetivo);
  return { mu, That, cumpleSLA, score };
}

/** Hill Climbing simple: se mueve al mejor vecino mientras mejore la puntuación. */
function hillClimbing(N0, puntuar, Nmax) {
  let actual = N0;
  let mejor = puntuar(actual);
  let pasos = 0;
  for (;;) {
    let candidato = null;
    let mejorVecino = mejor;
    for (const v of vecinos(actual, Nmax)) {
      const p = puntuar(v);
      if (p.score > mejorVecino.score + 1e-12) { mejorVecino = p; candidato = v; }
    }
    if (!candidato) break;
    actual = candidato; mejor = mejorVecino; pasos++;
  }
  return { N: actual, ...mejor, pasos };
}

/**
 * Simulación del controlador basado en Hill Climbing.
 * Al final del periodo t_i se observa lambda(t_i), T(t_i), mu(t_i), se estima
 * lambdaHat(t_{i+2}) por extrapolación lineal y se decide N(t_{i+2}).
 */
function simularHillClimbing(cargas, mezcla, g, capBD, sla, pesos, N0) {
  const n = cargas.length;
  const plan = new Array(n + 2).fill(null);
  plan[0] = N0; plan[1] = N0;
  const filas = [];
  for (let i = 0; i < n; i++) {
    const N = plan[i];
    const obs = observar(N, cargas[i], mezcla, sla, pesos);
    const prev = i > 0 ? cargas[i - 1] : cargas[i];
    const lambdaHat = Math.max(0.1, cargas[i] + 2 * (cargas[i] - prev));
    const desde = plan[i + 1] || N;
    const hc = hillClimbing(desde, (v) => utilidadPredicha(v, lambdaHat, g, capBD, sla, pesos), sla.Nmax);
    plan[i + 2] = hc.N;
    filas.push({
      t: i, lambda: cargas[i], N, total: N[0] + N[1] + N[2], ...obs,
      lambdaHat, Ndecidida: hc.N, Tpredicha: hc.That, pasosHC: hc.pasos,
    });
  }
  return filas;
}

/**
 * Elasticidad ideal: en cada periodo se conoce la carga real lambda(t) y el modelo
 * real, se evalúan TODAS las configuraciones y se aplica, sin retardo, la mejor.
 *  - criterio 'sla'    : entre las que cumplen T <= Tmax, la de máxima utilidad
 *                        (si ninguna cumple, la de máxima utilidad). Es el objetivo
 *                        del enunciado: respetar el SLA al menor coste.
 *  - criterio 'utilidad': máxima utilidad sin restricción (variante de contraste).
 * En empate se elige la de menos servidores.
 */
function simularIdeal(cargas, mezcla, sla, pesos, criterio = 'sla') {
  const configs = generarConfiguraciones(sla.Nmax);
  const clave = (o) => (criterio === 'sla' && o.T <= sla.Tmax ? 1 : 0);
  return cargas.map((lambda, t) => {
    let mejor = null;
    for (const N of configs) {
      const total = N[0] + N[1] + N[2];
      const obs = { t, lambda, N, total, ...observar(N, lambda, mezcla, sla, pesos) };
      if (!mejor) { mejor = obs; continue; }
      const dk = clave(obs) - clave(mejor);
      if (dk > 0 || (dk === 0 && (obs.mu > mejor.mu + 1e-12
        || (Math.abs(obs.mu - mejor.mu) <= 1e-12 && total < mejor.total)))) mejor = obs;
    }
    return mejor;
  });
}

/** Resumen comparativo de una estrategia. */
function resumir(filas, sla) {
  const n = filas.length;
  let cambios = 0;
  for (let i = 1; i < n; i++) if (filas[i].N.join() !== filas[i - 1].N.join()) cambios++;
  return {
    muMedia: filas.reduce((a, f) => a + f.mu, 0) / n,
    muSuma: filas.reduce((a, f) => a + f.mu, 0),
    servidoresMedios: filas.reduce((a, f) => a + f.total, 0) / n,
    violacionesSLA: filas.filter((f) => !(f.T <= sla.Tmax)).length,
    saturaciones: filas.filter((f) => !Number.isFinite(f.T)).length,
    cambiosConfig: cambios,
  };
}

module.exports = {
  H, utilidad, perfilCarga, observar, vecinos, utilidadPredicha, hillClimbing,
  simularHillClimbing, simularIdeal, resumir,
};
