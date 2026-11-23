/**
 * parametros.js
 * Todos los datos de entrada del caso práctico (performance.pdf) en un único sitio.
 *
 * AVISO IMPORTANTE (procedencia de los datos):
 *  - La matriz de demandas D (Figura 3 del enunciado) se copia literalmente del enunciado.
 *  - Las probabilidades de transición p_ij de los usuarios A y B proceden de la
 *    Tabla 8.1 del libro de Menascé (Performance by Design, cap. 8), que NO está
 *    incluida en las lecturas de la carpeta. Los valores de abajo se han introducido
 *    de memoria y DEBEN VERIFICARSE contra el libro. Para el tipo A, las razones de
 *    visita resultantes (s=1,167; v=0,233; g=0,427; c=0,128; b=0,256) coinciden con
 *    las que publica el libro, lo que da cierta confianza; para el tipo B no se
 *    dispone de esa comprobación cruzada.
 *  - Si se corrigen estos valores, basta con volver a ejecutar `node src/ejecutar.js`
 *    y `python graficas/generar_graficas.py` para regenerar todos los resultados.
 */

// Estados del diagrama funcional (Figura 1): Entry, Home, Search, View bids,
// Login, Create auction, place Bid, eXit.
const ESTADOS = ['e', 'h', 's', 'v', 'g', 'c', 'b', 'x'];

// Clases de operación que consumen recursos (R en el enunciado).
const CLASES = ['h', 's', 'v', 'g', 'c', 'b'];

// Probabilidades de transición p[i][j] (solo se escriben las no nulas).
// >>> PENDIENTE DE VERIFICAR CON LA TABLA 8.1 DEL LIBRO <<<
const P = {
  A: {
    e: { h: 1.0 },
    h: { s: 0.70, g: 0.10, x: 0.20 },
    s: { s: 0.40, v: 0.20, g: 0.15, x: 0.25 },
    v: { g: 0.65, x: 0.35 },
    g: { c: 0.30, b: 0.60, x: 0.10 },
    c: { x: 1.0 },
    b: { x: 1.0 },
    x: {},
  },
  B: {
    e: { h: 1.0 },
    h: { s: 0.70, g: 0.10, x: 0.20 },
    s: { s: 0.45, v: 0.15, g: 0.10, x: 0.30 },
    v: { g: 0.40, x: 0.60 },
    g: { c: 0.30, b: 0.60, x: 0.10 },
    c: { x: 1.0 },
    b: { x: 1.0 },
    x: {},
  },
};

// Recursos K (un CPU y un disco por servidor) y capa a la que pertenece cada uno.
const RECURSOS = ['WS-CPU', 'WS-disk', 'AS-CPU', 'AS-disk', 'DS-CPU', 'DS-disk'];
const CAPA_DE_RECURSO = [0, 0, 1, 1, 2, 2]; // 0 = WS, 1 = AS, 2 = DS
const CAPAS = ['WS', 'AS', 'DS'];

// Matriz de demandas D[i][r] en segundos (Figura 3 del enunciado).
// Columnas en el orden de CLASES: h, s, v, g, c, b.
const D = [
  [0.008, 0.009, 0.011, 0.060, 0.012, 0.015], // WS-CPU
  [0.030, 0.010, 0.010, 0.010, 0.010, 0.010], // WS-disk
  [0.000, 0.030, 0.035, 0.025, 0.045, 0.040], // AS-CPU
  [0.000, 0.008, 0.080, 0.009, 0.011, 0.012], // AS-disk
  [0.000, 0.010, 0.009, 0.015, 0.070, 0.045], // DS-CPU
  [0.000, 0.035, 0.018, 0.050, 0.080, 0.090], // DS-disk
];

// Mezclas de usuarios usadas en el enunciado.
const MEZCLA_BASE = { fA: 0.25, fB: 0.75 };
const MEZCLA_ALTERNATIVA = { fA: 0.60, fB: 0.40 };

// Experimentación sobre la configuración base (sección 0.3, cuestiones 1-3).
const CONFIG_BASE = [1, 1, 1];  // <N_WS, N_AS, N_DS>
const LAMBDA_INICIAL = 5.0;     // op/s
const PASO_LAMBDA = 0.5;        // op/s
const U_LIMITE = 0.90;          // utilización máxima admitida
const U_TOLERANCIA = 0.01;      // "U ~ 0,90" en las cuestiones 1-3: se admite hasta 0,91
const T_SLA = 4.0;              // s, SLA propuesto en la cuestión 2

// Estudio de configuraciones (sección 0.3, segunda parte).
// El enunciado dice "no supera a 20 servidores" y a la vez "sum N_i <= 16";
// se adopta la cota explícita de la fórmula: 16.
const MAX_SERVIDORES = 16;
const PASO_LAMBDA_BD = 1.0;     // op/s, rejilla de cargas para la base de datos

// Elasticidad (sección 0.4).
const ELASTICIDAD = {
  periodos: 72,          // número de periodos observados (Delta = 10 min -> 12 h)
  semilla: 2026,         // semilla del ruido de la carga (reproducible)
  lambdaMaxSLA: 60,      // lambda_max del SLA en la función de utilidad (op/s)
  Nmax: MAX_SERVIDORES,  // N_max del SLA
  pesos: [1 / 3, 1 / 3, 1 / 3], // w1, w2, w3 (suman 1)
  configInicial: [1, 1, 1],
  // Tiempos máximos del SLA a estudiar: el del enunciado (4 s) y uno más exigente
  // justificado en la cuestión 2 (ver informe).
  escenariosTmax: [4.0, 1.0],
  // Margen de seguridad del Hill Climbing frente a errores de predicción
  // (0 = sin margen; 0,10 = exige 10 % de holgura en capacidad y en tiempo).
  margenes: [0.0, 0.10],
  fraccionEntrenamiento: 0.8, // para validar g(N, lambda)
};

module.exports = {
  ESTADOS, CLASES, P, RECURSOS, CAPA_DE_RECURSO, CAPAS, D,
  MEZCLA_BASE, MEZCLA_ALTERNATIVA, CONFIG_BASE, LAMBDA_INICIAL, PASO_LAMBDA,
  U_LIMITE, U_TOLERANCIA, T_SLA, MAX_SERVIDORES, PASO_LAMBDA_BD, ELASTICIDAD,
};
