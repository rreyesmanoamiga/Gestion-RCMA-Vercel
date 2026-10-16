// ============================================================================
// Formato institucional para documentos que se imprimen / guardan en PDF
// (Ticket MAS y Solicitud de Proyecto). Diseño "Ejecutivo": franja azul con
// corte naranja, logo en tarjeta blanca, tarjetas de datos y pie azul.
// Colores: azul #1F4E79 · azul claro #5B87B5 · naranja #E87722. Folio en rojo.
// El logo va incrustado para que el documento se vea igual también cuando se
// guarda como archivo (OneDrive) y se abre fuera del sistema.
// ============================================================================

export const LOGO_MANO_AMIGA = 'data:image/png;base64,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';

export const PIE_INSTITUCIONAL = 'Colegios Mano Amiga — Juntos Transformando Vidas.';

/** Escapa texto para meterlo en el HTML del documento */
export const esc = (v: unknown) => String(v ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
/** Valor o guion */
export const val = (v: unknown) => (v === null || v === undefined || String(v).trim() === '') ? '—' : esc(v);

const NAVY = '#1F4E79', BLUE = '#5B87B5', ORANGE = '#E87722', ROJO = '#DC2626';

const CSS = `
*{margin:0;padding:0;box-sizing:border-box}
@page{size:letter;margin:0 0 12mm}
html,body{-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{font-family:'Calibri','Carlito','Segoe UI',Arial,sans-serif;font-size:10.5px;color:#1e293b;background:#fff}
.band{background:linear-gradient(115deg,${NAVY} 0%,${NAVY} 62%,#24598a 62%,#24598a 76%,${ORANGE} 76%,${ORANGE} 100%);color:#fff;padding:16px 14mm 18px;display:flex;justify-content:space-between;align-items:center}
.logo{background:#fff;border-radius:10px;padding:6px 10px}
.logo img{height:40px;display:block}
.band .k{font-size:9px;letter-spacing:.2em;opacity:.8}
.band h1{font-size:20px;font-weight:800;letter-spacing:.03em}
.band .s{font-size:10px;opacity:.85}
.wrap{padding:0 14mm}
.kpis{display:flex;gap:10px;margin:-12px 0 12px}
.kpi{flex:1;background:#fff;border-radius:10px;box-shadow:0 2px 8px rgba(15,23,42,.12);padding:8px 12px;border-top:3px solid ${NAVY}}
.kpi:nth-child(2){border-top-color:${ORANGE}}
.kpi b{display:block;font-size:8px;letter-spacing:.14em;color:#64748b;text-transform:uppercase}
.kpi span{font-size:13px;font-weight:800;color:${NAVY}}
.kpi span.folio{color:${ROJO}}
.card{border:1px solid #e2e8f0;border-radius:10px;margin-bottom:10px;overflow:hidden;break-inside:avoid}
.card h2{font-size:10.5px;font-weight:800;color:${NAVY};text-transform:uppercase;letter-spacing:.07em;padding:7px 12px;background:#f1f5f9;border-left:4px solid ${ORANGE}}
.grid{display:grid;grid-template-columns:1fr 1fr 1fr}
.grid div{padding:6px 12px;border-top:1px solid #eef2f7}
.grid div:nth-child(-n+3){border-top:0}
.grid b{display:block;font-size:8px;color:#64748b;letter-spacing:.08em;text-transform:uppercase}
.grid span{font-size:10.5px;font-weight:600}
.txt{padding:8px 12px;line-height:1.5;white-space:pre-wrap}
table{width:100%;border-collapse:collapse}
th{text-align:left;font-size:8.5px;color:#64748b;letter-spacing:.08em;text-transform:uppercase;padding:6px 12px;border-bottom:1px solid #e2e8f0}
td{padding:6px 12px;border-bottom:1px solid #f1f5f9}
.num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
.pill{display:inline-block;padding:2px 10px;border-radius:20px;background:rgba(232,119,34,.12);color:#c2410c;font-weight:800;font-size:10px}
tr.tot td{font-weight:800;color:${NAVY};background:#f8fafc}
.alerta{color:${ROJO};font-weight:700}
.bar{display:flex;height:14px;border-radius:7px;overflow:hidden;margin:8px 12px 4px;background:#eef2f7}
.leg{display:flex;gap:14px;font-size:9px;color:#475569;padding:0 12px 8px}
.leg i{display:inline-block;width:8px;height:8px;border-radius:2px;margin-right:4px}
.firmas{display:flex;gap:14px;margin-top:6px;break-inside:avoid}
.f{flex:1;border:1px dashed #cbd5e1;border-radius:10px;padding:8px 10px 10px;text-align:center}
.f .z{height:52px;display:flex;align-items:center;justify-content:center;flex-direction:column}
.f .z img{max-height:50px;max-width:180px;object-fit:contain}
.f .n{font-weight:800;color:${NAVY};font-size:10px;border-top:1px solid #94a3b8;padding-top:4px}
.f .p{font-size:8.5px;color:#64748b}
.f .d{font-size:8.5px;color:${BLUE}}
.nota{margin-top:8px;font-size:8.5px;color:#64748b;text-align:center}
.foot{position:fixed;bottom:0;left:0;right:0;height:9mm;background:${NAVY};color:#cbd5e1;font-size:8.5px;display:flex;align-items:center;justify-content:space-between;padding:0 14mm}
.foot em{color:#fff}
`;

export interface Kpi { etiqueta: string; valor: string; folio?: boolean; pill?: boolean }
export interface Firma { nombre: string; puesto: string; contenido?: string } // contenido: HTML (imagen de firma o fecha)

/** Arma el documento completo con el formato institucional */
export function documentoInstitucional(op: {
  tituloPestana: string; titulo: string; subtitulo: string;
  kpis: Kpi[]; cuerpo: string; firmas: Firma[]; nota?: string; referencia: string;
}): string {
  const kpis = op.kpis.map(k => `<div class="kpi"><b>${esc(k.etiqueta)}</b><span class="${k.folio ? 'folio' : ''}">${k.pill ? `<span class="pill">${k.valor}</span>` : k.valor}</span></div>`).join('');
  const firmas = op.firmas.map(f => `<div class="f"><div class="z">${f.contenido ?? ''}</div><div class="n">${f.nombre}</div><div class="p">${f.puesto}</div></div>`).join('');
  return `<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8"/><title>${esc(op.tituloPestana)}</title><style>${CSS}</style></head>
<body>
<div class="band"><div><div class="k">RED DE COLEGIOS MANO AMIGA</div><h1>${esc(op.titulo)}</h1><div class="s">${esc(op.subtitulo)}</div></div><div class="logo"><img src="${LOGO_MANO_AMIGA}" alt="Mano Amiga"/></div></div>
<div class="wrap">
<div class="kpis">${kpis}</div>
${op.cuerpo}
<div class="firmas">${firmas}</div>
${op.nota ? `<p class="nota">${op.nota}</p>` : ''}
</div>
<div class="foot"><em>${PIE_INSTITUCIONAL}</em><span>${esc(op.referencia)} · Sistema RCMA</span></div>
</body></html>`;
}

/** Bloque de datos en 3 columnas */
export const grid = (pares: [string, string][]) =>
  `<div class="grid">${pares.map(([k, v]) => `<div><b>${esc(k)}</b><span>${v}</span></div>`).join('')}</div>`;
/** Tarjeta con título */
export const tarjeta = (titulo: string, contenido: string) => `<div class="card"><h2>${titulo}</h2>${contenido}</div>`;

/** Barra de financiamiento (fuentes con monto > 0) */
export function barraFinanciamiento(fuentes: { nombre: string; monto: number }[], total: number): string {
  const colores = [NAVY, BLUE, ORANGE, '#94a3b8'];
  if (!total) return '';
  const partes = fuentes.map((f, i) => ({ ...f, color: colores[i % colores.length] })).filter(f => f.monto > 0);
  const bar = partes.map(p => `<div style="width:${Math.min(100, (p.monto / total) * 100).toFixed(1)}%;background:${p.color}"></div>`).join('');
  const leg = partes.map(p => `<span><i style="background:${p.color}"></i>${esc(p.nombre)} ${Math.round((p.monto / total) * 100)}%</span>`).join('');
  return `<div class="bar">${bar}</div><div class="leg">${leg}</div>`;
}
