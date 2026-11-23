"""
generar_graficas.py
Genera todas las figuras del informe a partir de los CSV de ./resultados
(producidos por `node src/ejecutar.js`). No calcula nada nuevo: solo dibuja.
Uso:  python graficas/generar_graficas.py
"""
import csv
import json
import os

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RES = os.path.join(BASE, "resultados")
OUT = os.path.join(BASE, "graficas")

# Paleta categórica validada (orden fijo, nunca cíclico) y tintas de texto.
SERIE = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#6250d6", "#e34948"]
MARCAS = ["o", "s", "^", "D", "v", "P", "X", "*"]
TINTA, TINTA2, REJILLA, REF = "#1f1f1e", "#5f5e58", "#e4e3de", "#8a8983"

plt.rcParams.update({
    "figure.dpi": 150, "savefig.dpi": 150, "font.size": 9,
    "axes.edgecolor": REF, "axes.labelcolor": TINTA, "axes.titlecolor": TINTA,
    "axes.titlesize": 10, "axes.titleweight": "bold", "axes.grid": True,
    "grid.color": REJILLA, "grid.linewidth": 0.6, "axes.spines.top": False,
    "axes.spines.right": False, "xtick.color": TINTA2, "ytick.color": TINTA2,
    "legend.frameon": False, "lines.linewidth": 2, "lines.markersize": 5,
})


def leer(nombre):
    with open(os.path.join(RES, nombre), newline="", encoding="utf-8") as f:
        filas = list(csv.DictReader(f))
    def conv(v):
        try:
            return float(v) if v != "Inf" else float("inf")
        except ValueError:
            return v
    return [{k: conv(v) for k, v in fila.items()} for fila in filas]


def col(filas, k):
    return [f[k] for f in filas]


def guardar(fig, nombre):
    fig.tight_layout()
    fig.savefig(os.path.join(OUT, nombre))
    plt.close(fig)
    print("  ", nombre)


resumen = json.load(open(os.path.join(RES, "resumen.json"), encoding="utf-8"))
CLASES = ["h", "s", "v", "g", "c", "b"]
NOMBRES = {"h": "Home (h)", "s": "Search (s)", "v": "View bids (v)", "g": "Login (g)",
           "c": "Create auction (c)", "b": "Place bid (b)"}
RECURSOS = ["WS-CPU", "WS-disk", "AS-CPU", "AS-disk", "DS-CPU", "DS-disk"]

# --- Fig 1 y 3: T_r(lambda) para cada mezcla -------------------------------
for etiqueta, titulo, fig_n in [("fA025", "fA = 0,25 ; fB = 0,75", "fig01"), ("fA060", "fA = 0,60 ; fB = 0,40", "fig03")]:
    d = leer(f"02_base_{etiqueta}.csv")
    fig, ax = plt.subplots(figsize=(6.4, 3.8))
    for k, r in enumerate(CLASES):
        ax.plot(col(d, "lambda"), col(d, f"T_{r}"), marker=MARCAS[k], color=SERIE[k], label=NOMBRES[r])
    ax.set_xlabel("λ (op/s)")
    ax.set_ylabel("T_r (s)")
    ax.set_title(f"T_r(λ) por clase, <1,1,1>, {titulo}")
    ax.set_ylim(bottom=0)
    ax.legend(ncol=2, fontsize=8)
    guardar(fig, f"{fig_n}_Tr_lambda_{etiqueta}.png")

# --- Fig 2: T(lambda) frente al SLA, ambas mezclas ---------------------------
d1, d2 = leer("02_base_fA025.csv"), leer("02_base_fA060.csv")
fig, ax = plt.subplots(figsize=(6.4, 3.6))
ax.plot(col(d1, "lambda"), col(d1, "T"), marker="o", color=SERIE[0], label="fA = 0,25")
ax.plot(col(d2, "lambda"), col(d2, "T"), marker="s", color=SERIE[1], label="fA = 0,60")
ax.axhline(4.0, color=REF, linestyle="--", linewidth=1.2)
ax.text(5.05, 3.85, "T_SLA = 4 s", color=TINTA2, va="top", fontsize=8)
ax.set_xlabel("λ (op/s)")
ax.set_ylabel("T (s)")
ax.set_ylim(0, 4.4)
ax.set_title("Tiempo medio de respuesta T(λ), configuración <1,1,1>")
ax.legend(loc="center left")
guardar(fig, "fig02_T_lambda_SLA.png")

# --- Fig 4: utilizaciones de la configuración base ---------------------------
fig, ax = plt.subplots(figsize=(6.4, 4.0))
for k, rec in enumerate(RECURSOS):
    ax.plot(col(d1, "lambda"), col(d1, f"U_{rec}"), marker=MARCAS[k], color=SERIE[k], label=rec)
ax.axhline(0.9, color=REF, linestyle="--", linewidth=1.2)
ax.text(10.05, 0.9, "U = 0,90", color=TINTA2, fontsize=8, va="center")
ax.set_xlabel("λ (op/s)")
ax.set_ylabel("U_i")
ax.set_ylim(0, 1)
ax.set_title("Utilización de cada recurso, <1,1,1>, fA = 0,25")
ax.set_xlim(4.8, 10.8)
ax.legend(ncol=6, fontsize=7.5, loc="upper center", bbox_to_anchor=(0.5, -0.18))
guardar(fig, "fig04_U_lambda_fA025.png")

# --- Fig 5: lambda_max(fA) ---------------------------------------------------
d = leer("03_lambdamax_vs_fA.csv")
fig, ax = plt.subplots(figsize=(6.4, 4.2))
for k, rec in enumerate(RECURSOS):
    ax.plot(col(d, "fA"), col(d, f"lambdaSat_{rec}"), color=SERIE[k], linewidth=1, alpha=0.9, label=f"1/u ({rec})")
ax.plot(col(d, "fA"), col(d, "lambdaMax"), color=TINTA, linewidth=2.5, label="λmax = mín_i 1/u_i")
mf = resumen["mezclaFavorable"]
ax.plot([mf["fA"]], [mf["lambdaMax"]], "o", color=TINTA, markersize=8)
ax.annotate(f"máximo: fA = {mf['fA']:.2f}, λmax = {mf['lambdaMax']:.2f}", (mf["fA"], mf["lambdaMax"]),
            xytext=(0.12, 13.5), color=TINTA, fontsize=8, arrowprops=dict(arrowstyle="-", color=REF))
ax.set_ylim(9, 35)
ax.set_xlabel("fA (fracción de usuarios tipo A)")
ax.set_ylabel("λ de saturación (op/s)")
ax.set_title("Carga máxima soportable λmax(fA), configuración <1,1,1>")
ax.legend(ncol=4, fontsize=7.5, loc="upper center", bbox_to_anchor=(0.5, -0.2))
guardar(fig, "fig05_lambdamax_fA.png")

# --- Fig 6: mejor configuración por número total de servidores --------------
d = leer("06_mejor_config_por_total.csv")
etiquetas = [f"<{int(f['NWS'])},{int(f['NAS'])},{int(f['NDS'])}>" for f in d]
fig, (a1, a2) = plt.subplots(2, 1, figsize=(6.6, 5.2), sharex=True)
a1.bar(col(d, "total"), col(d, "lambda09"), color=SERIE[0], width=0.7)
for x, y, e in zip(col(d, "total"), col(d, "lambda09"), etiquetas):
    a1.text(x, y + 1, e, ha="center", fontsize=6.5, color=TINTA2, rotation=90, va="bottom")
a1.set_ylabel("λ con U = 0,9 (op/s)")
a1.set_ylim(0, 95)
a1.set_title("Mejor configuración para cada número total de servidores (fA = 0)")
a2.plot(col(d, "total"), col(d, "T09"), marker="o", color=SERIE[1], label="Ec. (3) del enunciado")
a2.plot(col(d, "total"), col(d, "T09_seidmann_original"), marker="s", color=SERIE[2], label="Seidmann original (Awad y Menascé)")
a2.set_ylabel("T a esa carga (s)")
a2.set_xlabel("Número total de servidores Σ N_i")
a2.set_ylim(bottom=0)
a2.legend(fontsize=8)
guardar(fig, "fig06_mejor_config_por_total.png")

# --- Fig 7: g(N, lambda) frente al sistema real ------------------------------
d = leer("08_g_vs_real.csv")
fig, ax = plt.subplots(figsize=(6.4, 3.8))
for k, cfg in enumerate(["1-1-1", "2-3-4", "3-5-8", "2-4-10"]):
    sub = [f for f in d if f["config"] == cfg]
    ax.plot(col(sub, "lambda"), col(sub, "T"), MARCAS[k], color=SERIE[k], markersize=4, linestyle="none",
            label=f"T real <{cfg.replace('-', ',')}>")
    ax.plot(col(sub, "lambda"), col(sub, "g"), color=SERIE[k], linewidth=1.5)
ax.set_xlabel("λ (op/s)")
ax.set_ylabel("T (s)")
ax.set_ylim(bottom=0)
ax.set_title("Función predictiva g(N, λ) (líneas) frente a T real (puntos)")
ax.legend(fontsize=8)
guardar(fig, "fig07_g_vs_real.png")

# --- Fig 8-10: elasticidad ---------------------------------------------------
for Tmax in [1.0, 4.0]:
    tm = int(Tmax)
    d = leer(f"10_elasticidad_Tmax{tm}_margen0.1.csv")
    t = col(d, "t")
    fig, axs = plt.subplots(4, 1, figsize=(6.8, 8.6), sharex=True)
    axs[0].plot(t, col(d, "lambda"), color=SERIE[0], label="λ(t) observada")
    axs[0].plot([x + 2 for x in t], col(d, "lambdaHat_t2"), color=SERIE[1], linewidth=1.2, linestyle="--",
                label="λ̂(t) predicha 2 periodos antes")
    axs[0].set_ylabel("λ (op/s)")
    axs[0].legend(fontsize=8)
    axs[0].set_title(f"Elasticidad con T_max = {Tmax:g} s (margen 10 %)")
    axs[1].step(t, col(d, "total_hc"), where="mid", color=SERIE[0], label="Hill Climbing")
    axs[1].step(t, col(d, "total_ideal"), where="mid", color=SERIE[2], label="Ideal")
    axs[1].set_ylabel("Σ N_i")
    axs[1].legend(fontsize=8)
    Th = [min(x, 3 * Tmax) for x in col(d, "T_hc")]
    Ti = [min(x, 3 * Tmax) for x in col(d, "T_ideal")]
    axs[2].plot(t, Th, color=SERIE[0], label="Hill Climbing")
    axs[2].plot(t, Ti, color=SERIE[2], label="Ideal")
    axs[2].axhline(Tmax, color=REF, linestyle="--", linewidth=1.2)
    axs[2].set_ylabel("T(t) (s)")
    axs[2].legend(fontsize=8)
    axs[3].plot(t, col(d, "mu_hc"), color=SERIE[0], label="Hill Climbing")
    axs[3].plot(t, col(d, "mu_ideal"), color=SERIE[2], label="Ideal")
    axs[3].set_ylabel("μ(t)")
    axs[3].set_xlabel("Periodo t (Δ = 10 min)")
    axs[3].legend(fontsize=8)
    guardar(fig, f"fig{8 if tm == 1 else 9}_elasticidad_Tmax{tm}.png")

# Comparación resumida de utilidad media por escenario
esc = resumen["elasticidad"]
fig, ax = plt.subplots(figsize=(6.4, 3.4))
etq = [f"T_max={e['Tmax']:g} s\nmargen {int(e['margen'] * 100)} %" for e in esc]
x = range(len(esc))
ax.bar([i - 0.18 for i in x], [e["hillClimbing"]["muMedia"] for e in esc], width=0.34, color=SERIE[0], label="Hill Climbing")
ax.bar([i + 0.18 for i in x], [e["ideal"]["muMedia"] for e in esc], width=0.34, color=SERIE[2], label="Ideal")
for i, e in enumerate(esc):
    ax.text(i - 0.18, e["hillClimbing"]["muMedia"] + 0.005, f"{e['hillClimbing']['muMedia']:.3f}", ha="center", fontsize=7.5, color=TINTA2)
    ax.text(i + 0.18, e["ideal"]["muMedia"] + 0.005, f"{e['ideal']['muMedia']:.3f}", ha="center", fontsize=7.5, color=TINTA2)
ax.set_xticks(list(x))
ax.set_xticklabels(etq)
ax.set_ylim(0.5, 0.7)
ax.set_ylabel("μ media")
ax.set_title("Utilidad media: Hill Climbing frente a elasticidad ideal")
ax.legend(fontsize=8, loc="upper right")
guardar(fig, "fig10_utilidad_media.png")
