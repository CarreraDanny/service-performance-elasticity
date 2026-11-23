**Autor:** Danny Carrera

# Caso práctico 7: prestaciones, MVA multiclase y elasticidad de un servicio web de subastas

Implementación en Node.js de las cuestiones del caso práctico `performance.pdf`. El programa resuelve las cuatro secciones del enunciado:

1. **Estudio de prestaciones:** frecuencias de visita de los usuarios A y B y distribución de la carga de entrada.
2. **Arquitectura:** matriz de demandas de CPU y disco y demanda efectiva de cada recurso.
3. **Modelo MVA multiclase abierto:** tiempos de respuesta, utilizaciones, carga máxima, comparación de mezclas de usuarios y de configuraciones de servidores (con la penalización de Seidmann).
4. **Elasticidad:** función predictiva g(N, λ), controlador Hill Climbing, función de utilidad μ(t) y comparación con un mecanismo de elasticidad ideal.

Todos los resultados (tablas, gráficas e informe) salen de la ejecución del programa. No hay datos escritos a mano.

---

## Requisitos

| Herramienta | Para qué | Comprobar |
|---|---|---|
| Node.js 18 o superior | Cálculos y experimentos, generación del informe | `node --version` |
| Python 3 con matplotlib | Gráficas | `python -c "import matplotlib"` |
| Paquete npm `docx` | Solo para generar el informe Word | se instala con `npm install docx` |

El cálculo (`src/`) no necesita ninguna dependencia externa.

---

## Cómo ejecutarlo

Abrir una terminal en la carpeta del proyecto y ejecutar, en este orden:

**1. Experimentos** (≈ 10 s). Escribe los resultados en `resultados/`:

```powershell
node src/ejecutar.js
```

**2. Gráficas.** Lee los CSV de `resultados/` y guarda las figuras en `graficas/`:

```powershell
python graficas/generar_graficas.py
```



## Cómo comprobar que funciona

Al terminar el paso 1, la consola muestra el contenido de `resultados/resumen.json`. Con los parámetros actuales deben aparecer, entre otros, estos valores:

| Comprobación | Valor esperado | Dónde mirarlo |
|---|---|---|
| Visitas del usuario A a Search, Login, Place bid | 1,1667 · 0,4267 · 0,2560 | `visitas` |
| Carga con U = 0,9 en <1,1,1>, f_A = 0,25 | 9,9948 op/s, cuello DS-disk | `base025.lambda09exacta` |
| Carga a la que T alcanza el SLA de 4 s | 10,8168 op/s (U = 0,974) | `base025.lambdaEnTSLA` |
| Mezcla más favorable | f_A = 0, λ_max = 11,5145 op/s | `mezclaFavorable` |
| Configuraciones evaluadas / experimentos en la base de datos | 560 / 13 082 | `configuraciones` |
| Mejor configuración con 16 servidores | <4,5,7>, 70,49 op/s | `configuraciones.mejorGlobal` |
| Error de g(N, λ) en validación | MAPE ≈ 1,14 %, R² ≈ 0,996 | `prediccion.validacion` |
| Hill Climbing frente al ideal (T_max = 1 s, margen 10 %) | ≈ 97,7 % de la utilidad | `elasticidad` |

**Verificaciones cruzadas que hace el propio programa:**

- Antes de resolver, comprueba que cada fila de las matrices de transición suma 1 (ecuación 1). Si no, se detiene con un error.
- La carga máxima teórica (cuestión 4) coincide con el final del barrido de λ de las cuestiones 1 y 3: U = 0,9005 en λ = 10 y U = 0,898 en λ = 9,5.
- La función g se valida con un 20 % de los datos que no ha visto al entrenar.

El programa no tiene más aleatoriedad que el ruido de la carga λ(t) y la partición entrenamiento/validación, y las dos usan una semilla fija (2026). Dos ejecuciones dan exactamente los mismos resultados.

---

## Estructura del proyecto

```
CASO PRACTICA 7/
├── src/
│   ├── parametros.js      Datos de entrada: matrices A y B, demandas D, mezclas, SLA, parámetros
│   ├── calculos.js        Visitas (ec. 2), carga λ_r, MVA multiclase abierto, carga máxima
│   ├── simulacion.js      Barridos de λ, configuraciones con ΣN ≤ 16, base de datos de aprendizaje
│   ├── prediccion.js      Función predictiva g(N, λ): regresión polinómica por mínimos cuadrados
│   ├── elasticidad.js     Utilidad μ(t), H(t), carga λ(t), Hill Climbing y elasticidad ideal
│   └── ejecutar.js        Lanza todos los experimentos y guarda los resultados
├── graficas/
│   ├── generar_graficas.py
│   └── fig*.png           Figuras del informe
├── informe/
│   └── generar_informe.js Construye el informe Word a partir de los resultados
├── resultados/            CSV y resumen.json (se generan al ejecutar)
├── Informe_Sistemas_Elasticidad_Danny_Carrera.docx
└── README.md
```

---

## Qué calcula cada parte

### 1. Frecuencias de visita y carga de entrada (`calculos.js`)
- Resuelve, para cada tipo de usuario, el sistema lineal ν[i] = Σ_k ν[k]·p_k,i con ν[e] = 1, por eliminación gaussiana.
- Reparte la carga global por clase de operación: λ_r = λ·(f_A·ν^A[r] + f_B·ν^B[r]).

### 2. Modelo MVA multiclase abierto (`calculos.js`)
- U_i = Σ_r (λ_r/N_i)·D_i,r
- T_i,r = D_i,r/(1 − U_i), o con la penalización de Seidmann de la ecuación (3): D_i,r·(N_i−1)/N_i + D_i,r/(1 − U_i)
- T_r = Σ_i T_i,r   y   T = Σ_r T_r·λ_r/λ
- Carga máxima: λ_max = 1 / max_i Σ_r (f_A·ν^A[r] + f_B·ν^B[r])·D_i,r/N_i

### 3. Experimentos de la sección MVA (`ejecutar.js`, `simulacion.js`)
| Cuestión | Experimento | Archivo de resultados |
|---|---|---|
| 1-2 | T_r(λ) y T(λ) en <1,1,1>, f_A = 0,25, λ de 5 en 5,5… hasta U ≈ 0,90 | `02_base_fA025.csv` |
| 3 | Lo mismo con f_A = 0,60 | `02_base_fA060.csv` |
| 4-5 | λ_max(f_A) para f_A de 0 a 1 | `03_lambdamax_vs_fA.csv` |
| Seidmann | Las 560 configuraciones con ΣN ≤ 16: base de datos T(N, λ) | `04_base_datos_aprendizaje.csv` |
| Seidmann | Carga máxima y T por configuración | `05`, `06`, `07_*.csv` |

### 4. Elasticidad (`prediccion.js`, `elasticidad.js`)
- **g(N, λ):** polinomio de grado 4 en λ/N_c para cada capa, más el término (N_c−1)/N_c. No usa ni las demandas, ni las visitas, ni la mezcla de usuarios.
- **Hill Climbing:** al final de cada periodo predice λ̂(t+2) por extrapolación lineal y busca, entre vecinos (añadir, quitar o mover un servidor), la configuración de mayor utilidad prevista que cumpla el SLA.
- **Ideal:** con la carga real y el modelo real, evalúa las 560 configuraciones en cada periodo y aplica la mejor.
- Se ejecuta con T_max = 4 s y T_max = 1 s, cada uno con margen de seguridad del 0 % y del 10 %. Resultados en `10_elasticidad_*.csv`.

---

## Cambiar parámetros

Todos los parámetros están en `src/parametros.js`: matrices de transición, demandas, mezclas, paso de λ, umbral de utilización, SLA, límite de servidores, perfil de carga, pesos de la utilidad y márgenes. Después de cambiarlos, repetir los pasos 1, 2 y 3.

---

## Limitaciones y datos pendientes de verificar
- La carga λ(t), los pesos de la utilidad (1/3 cada uno), λ_max = 60 op/s, N_max = 16, T_max = 1 s y el margen del 10 % son decisiones de este trabajo, no datos del enunciado.
- El enunciado indica "20 servidores" y a la vez ΣN ≤ 16; se usa 16.
- La ecuación (3) se implementa tal como la escribe el enunciado. Como comparación también se calcula la versión de Seidmann de la lectura de Awad y Menascé.
- El "sistema real" es el propio modelo MVA: no se ha medido ningún sistema físico ni virtual.
