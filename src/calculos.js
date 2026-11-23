/**
 * calculos.js
 * Cálculos matemáticos del caso práctico:
 *  - frecuencias de visita nu^alpha (ecuación 2),
 *  - distribución de la carga de entrada lambda_r,
 *  - modelo MVA multiclase abierto (con y sin penalización de Seidmann, ecuación 3),
 *  - carga máxima soportable (teórica).
 */
const { ESTADOS, CLASES, D, CAPA_DE_RECURSO } = require('./parametros');

/** Comprueba la ecuación (1): cada fila de la matriz suma 1 (salvo el estado de salida). */
function validarMatriz(Ptipo) {
  for (const i of ESTADOS) {
    if (i === 'x') continue;
    const suma = Object.values(Ptipo[i]).reduce((a, b) => a + b, 0);
    if (Math.abs(suma - 1) > 1e-9) throw new Error(`La fila ${i} suma ${suma}, no 1`);
  }
}

/** Resuelve A·x = b por eliminación gaussiana con pivoteo parcial. */
function resolverSistema(A, b) {
  const n = b.length;
  const M = A.map((fila, i) => [...fila, b[i]]);
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let f = col + 1; f < n; f++) if (Math.abs(M[f][col]) > Math.abs(M[piv][col])) piv = f;
    [M[col], M[piv]] = [M[piv], M[col]];
    if (Math.abs(M[col][col]) < 1e-14) throw new Error('Sistema singular');
    for (let f = 0; f < n; f++) {
      if (f === col) continue;
      const k = M[f][col] / M[col][col];
      for (let c = col; c <= n; c++) M[f][c] -= k * M[col][c];
    }
  }
  return M.map((fila, i) => fila[n] / fila[i]);
}

/**
 * Frecuencias de visita (ecuación 2): nu[i] = sum_k nu[k]·p[k][i], con nu[e] = 1.
 * Incógnitas: los 7 estados distintos de 'e'. Se devuelve un objeto {estado: nu}.
 */
function frecuenciasVisita(Ptipo) {
  validarMatriz(Ptipo);
  const inc = ESTADOS.filter((s) => s !== 'e');
  const p = (k, i) => (Ptipo[k] && Ptipo[k][i]) || 0;
  // nu[i] - sum_{k != e} nu[k]·p[k][i] = nu[e]·p[e][i] = p[e][i]
  const A = inc.map((i) => inc.map((k) => (i === k ? 1 : 0) - p(k, i)));
  const b = inc.map((i) => p('e', i));
  const sol = resolverSistema(A, b);
  const nu = { e: 1 };
  inc.forEach((s, idx) => { nu[s] = sol[idx]; });
  return nu;
}

/** Mezcla de visitas por clase: fA·nuA[r] + fB·nuB[r] (array en el orden de CLASES). */
function visitasMezcla(fA, nuA, nuB) {
  const fB = 1 - fA;
  return CLASES.map((r) => fA * nuA[r] + fB * nuB[r]);
}

/** Carga por clase de operación: lambda_r = lambda·(fA·nuA[r] + fB·nuB[r]). */
function cargaPorClase(lambda, fA, nuA, nuB) {
  return visitasMezcla(fA, nuA, nuB).map((v) => lambda * v);
}

/**
 * Modelo MVA multiclase abierto.
 *  lambda    : carga global (op/s)
 *  lambdaR   : vector lambda_r (orden CLASES)
 *  N         : configuración [N_WS, N_AS, N_DS]
 *  penaliza  : 'ninguna'   -> T_ir = D/(1-U_i)                         (sección 0.3, base)
 *              'enunciado' -> T_ir = D·(N-1)/N + D/(1-U_i)              (ecuación 3)
 *              'original'  -> T_ir = D·(N-1)/N + (D/N)/(1-U_i)          (Seidmann, Awad & Menascé)
 * Devuelve utilizaciones U_i, tiempos por clase T_r, tiempo medio T y si está saturado.
 */
function mva(lambda, lambdaR, N, penaliza = 'enunciado') {
  const nRec = D.length;
  const nCl = CLASES.length;
  const U = new Array(nRec).fill(0);
  for (let i = 0; i < nRec; i++) {
    const Ni = N[CAPA_DE_RECURSO[i]];
    for (let r = 0; r < nCl; r++) U[i] += (lambdaR[r] / Ni) * D[i][r];
  }
  const Umax = Math.max(...U);
  const saturado = Umax >= 1;
  const Tr = new Array(nCl).fill(0);
  const Tir = D.map(() => new Array(nCl).fill(0));
  if (!saturado) {
    for (let i = 0; i < nRec; i++) {
      const Ni = N[CAPA_DE_RECURSO[i]];
      for (let r = 0; r < nCl; r++) {
        const d = D[i][r];
        let t;
        if (penaliza === 'ninguna') t = d / (1 - U[i]);
        else if (penaliza === 'enunciado') t = d * (Ni - 1) / Ni + d / (1 - U[i]);
        else t = d * (Ni - 1) / Ni + (d / Ni) / (1 - U[i]);
        Tir[i][r] = t;
        Tr[r] += t;
      }
    }
  }
  // T = sum_r T_r · lambda_r / lambda  (definición del enunciado)
  const T = saturado ? Infinity : Tr.reduce((acc, t, r) => acc + t * lambdaR[r] / lambda, 0);
  const iCuello = U.indexOf(Umax);
  return { U, Umax, iCuello, Tr, Tir, T, saturado };
}

/**
 * Demanda efectiva por unidad de carga global en cada recurso:
 *   u_i = sum_r (fA·nuA[r] + fB·nuB[r]) · D_ir / N_i
 * Como U_i(lambda) = lambda·u_i, la carga máxima teórica es lambda_max = 1 / max_i u_i
 * y la carga para un umbral U* es U* / max_i u_i.
 */
function cargaMaxima(fA, nuA, nuB, N, umbral = 1.0) {
  const v = visitasMezcla(fA, nuA, nuB);
  const u = D.map((fila, i) => fila.reduce((acc, d, r) => acc + v[r] * d, 0) / N[CAPA_DE_RECURSO[i]]);
  const umax = Math.max(...u);
  return { u, iCuello: u.indexOf(umax), lambdaMax: umbral / umax };
}

module.exports = {
  validarMatriz, resolverSistema, frecuenciasVisita, visitasMezcla,
  cargaPorClase, mva, cargaMaxima,
};
