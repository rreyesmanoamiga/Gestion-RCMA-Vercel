// ─────────────────────────────────────────────────────────────────────────────
// SISTEMA RCMA — Generador de Presentación
// Ejecutar: node generar.js
// ─────────────────────────────────────────────────────────────────────────────
const pptxgen = require("pptxgenjs");
const pres    = new pptxgen();

pres.layout = "LAYOUT_16x9";
pres.title  = "Sistema RCMA — Presentación Ejecutiva";
pres.author = "Coordinación de Obras — Colegios Mano Amiga";

// ── Paleta ────────────────────────────────────────────────────────────────────
const C = {
  dark:      "0F172A",   // slate-900
  blue:      "1E40AF",   // blue-800
  blueLight: "DBEAFE",   // blue-100
  accent:    "0EA5E9",   // sky-500
  white:     "FFFFFF",
  offWhite:  "F8FAFC",
  gray:      "64748B",
  grayLight: "E2E8F0",
  green:     "16A34A",
  amber:     "D97706",
  red:       "DC2626",
  purple:    "7C3AED",
};

const makeShadow = () => ({ type: "outer", blur: 8, offset: 3, angle: 135, color: "000000", opacity: 0.12 });
const W = 10, H = 5.625;

// ── Helper: card con sombra ───────────────────────────────────────────────────
function addCard(slide, x, y, w, h, color = C.white) {
  slide.addShape(pres.shapes.RECTANGLE, {
    x, y, w, h,
    fill: { color },
    line: { color: C.grayLight, width: 0.5 },
    shadow: makeShadow(),
  });
}

// ── Helper: badge de módulo ───────────────────────────────────────────────────
function addBadge(slide, x, y, text, bg, fg = C.white) {
  slide.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w: 1.5, h: 0.32, fill: { color: bg }, line: { color: bg }, rectRadius: 0.05 });
  slide.addText(text, { x, y, w: 1.5, h: 0.32, fontSize: 8, bold: true, color: fg, align: "center", valign: "middle", margin: 0 });
}

// ─────────────────────────────────────────────────────────────────────────────
// SLIDE 1 — PORTADA
// ─────────────────────────────────────────────────────────────────────────────
{
  const s = pres.addSlide();
  s.background = { color: C.dark };

  // Acento azul izquierdo
  s.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: 0.06, h: H, fill: { color: C.accent }, line: { color: C.accent } });

  // Bloque azul decorativo derecho
  s.addShape(pres.shapes.RECTANGLE, { x: 7.2, y: 0, w: 2.8, h: H, fill: { color: "111827" }, line: { color: "111827" } });
  s.addShape(pres.shapes.RECTANGLE, { x: 7.8, y: 1.2, w: 1.8, h: 1.8, fill: { color: C.blue, transparency: 60 }, line: { color: C.blue, transparency: 60 } });
  s.addShape(pres.shapes.RECTANGLE, { x: 8.2, y: 2.5, w: 1.4, h: 1.4, fill: { color: C.accent, transparency: 70 }, line: { color: C.accent, transparency: 70 } });

  // Tag
  s.addShape(pres.shapes.RECTANGLE, { x: 0.5, y: 1.3, w: 2.2, h: 0.3, fill: { color: C.blue }, line: { color: C.blue } });
  s.addText("COORDINACIÓN DE OBRAS", { x: 0.5, y: 1.3, w: 2.2, h: 0.3, fontSize: 8, bold: true, color: C.white, align: "center", valign: "middle", margin: 0 });

  // Título centrado verticalmente
  s.addText("SISTEMA RCMA", { x: 0.5, y: 1.75, w: 6.4, h: 1.4, fontSize: 52, bold: true, color: C.white, fontFace: "Arial Black", charSpacing: 2, valign: "middle" });
  s.addText("Plataforma de Gestión de Infraestructura", { x: 0.5, y: 3.22, w: 6.4, h: 0.38, fontSize: 17, color: C.accent, fontFace: "Calibri" });
  s.addText("Colegios Mano Amiga", { x: 0.5, y: 3.65, w: 6.4, h: 0.3, fontSize: 12, color: "94A3B8", fontFace: "Calibri", italic: true });

  // Separador
  s.addShape(pres.shapes.RECTANGLE, { x: 0.5, y: 4.08, w: 3.0, h: 0.03, fill: { color: C.accent }, line: { color: C.accent } });

  // Info pie
  s.addText([
    { text: "Versión 2026  |  ", options: { color: "94A3B8" } },
    { text: "Sistema Cloud  |  ", options: { color: "94A3B8" } },
    { text: "rreyes@manoamiga.edu.mx", options: { color: C.accent } },
  ], { x: 0.5, y: 5.18, w: 6.5, h: 0.3, fontSize: 9, fontFace: "Calibri" });
}

// ─────────────────────────────────────────────────────────────────────────────
// SLIDE 2 — ¿QUÉ ES SISTEMA RCMA?
// ─────────────────────────────────────────────────────────────────────────────
{
  const s = pres.addSlide();
  s.background = { color: C.offWhite };

  s.addText("¿Qué es el Sistema RCMA?", { x: 0.5, y: 0.3, w: 9, h: 0.6, fontSize: 28, bold: true, color: C.dark, fontFace: "Arial Black" });
  s.addShape(pres.shapes.RECTANGLE, { x: 0.5, y: 0.95, w: 9, h: 0.03, fill: { color: C.grayLight }, line: { color: C.grayLight } });

  // Descripción
  s.addText("Plataforma web institucional desarrollada para la Coordinación de Obras de Colegios Mano Amiga, que centraliza la gestión de proyectos, tickets, inspecciones y pendientes en tiempo real desde cualquier dispositivo.", {
    x: 0.5, y: 1.05, w: 7.5, h: 0.82, fontSize: 12, color: C.gray, fontFace: "Calibri", valign: "middle",
  });

  // Cards de pilares
  const pilares = [
    { icon: "☁️", title: "Cloud + Offline", desc: "Funciona sin internet,\nsincroniza automáticamente", color: C.blue },
    { icon: "🔒", title: "Roles y Permisos", desc: "Control granular por\nusuario y módulo", color: C.purple },
    { icon: "📧", title: "Notificaciones", desc: "Email institucional\nautomático en tiempo real", color: C.green },
    { icon: "📊", title: "Reportes PDF/Excel", desc: "Generación automática\npara presentaciones", color: C.amber },
  ];

  pilares.forEach((p, i) => {
    const x = 0.35 + i * 2.35;
    addCard(s, x, 2.05, 2.2, 3.1);
    s.addText(p.icon, { x, y: 2.25, w: 2.2, h: 0.55, fontSize: 26, align: "center" });
    s.addShape(pres.shapes.RECTANGLE, { x: x + 0.1, y: 2.9, w: 2.0, h: 0.05, fill: { color: p.color }, line: { color: p.color } });
    s.addText(p.title, { x, y: 3.02, w: 2.2, h: 0.35, fontSize: 11, bold: true, color: C.dark, align: "center", fontFace: "Calibri" });
    s.addText(p.desc, { x, y: 3.42, w: 2.2, h: 0.8, fontSize: 9.5, color: C.gray, align: "center", fontFace: "Calibri" });
  });

  // Stat derecha
  // Stat "13" — esquina superior derecha compacto
  addCard(s, 8.2, 0.95, 1.55, 1.1, C.dark);
  s.addText("13", { x: 8.2, y: 0.95, w: 1.55, h: 0.65, fontSize: 40, bold: true, color: C.accent, align: "center", fontFace: "Arial Black" });
  s.addText("módulos", { x: 8.2, y: 1.55, w: 1.55, h: 0.22, fontSize: 8, color: "94A3B8", align: "center", fontFace: "Calibri" });

  s.addText("Sistema RCMA  ·  Colegios Mano Amiga  ·  2026", { x: 0, y: 5.35, w: W, h: 0.25, fontSize: 8, color: "CBD5E1", align: "center" });
}

// ─────────────────────────────────────────────────────────────────────────────
// SLIDE 3 — MAPA DE MÓDULOS
// ─────────────────────────────────────────────────────────────────────────────
{
  const s = pres.addSlide();
  s.background = { color: C.dark };

  s.addText("Módulos del Sistema", { x: 0.5, y: 0.25, w: 9, h: 0.55, fontSize: 28, bold: true, color: C.white, fontFace: "Arial Black" });
  s.addText("Acceso controlado por permisos individuales por usuario", { x: 0.5, y: 0.8, w: 9, h: 0.3, fontSize: 11, color: "94A3B8", fontFace: "Calibri" });

  const modulos = [
    { icon: "📊", name: "Dashboard",         desc: "KPIs en tiempo real",       color: C.accent },
    { icon: "🎫", name: "Tickets TCMM",       desc: "Control de obra y OPEX",    color: "EF4444" },
    { icon: "📁", name: "Proyectos",          desc: "Gestión de obras activas",  color: "3B82F6" },
    { icon: "📐", name: "Anteproyectos",      desc: "Solicitudes de diseño",     color: "8B5CF6" },
    { icon: "✅", name: "Checklists",         desc: "Inspección visual",         color: C.green },
    { icon: "📅", name: "Calendario",         desc: "Eventos y mantenimientos",  color: "F59E0B" },
    { icon: "⏳", name: "Pendientes",         desc: "Seguimiento de tareas",     color: "06B6D4" },
    { icon: "📋", name: "Solicitud Proyecto", desc: "Formulario público",        color: "EC4899" },
    { icon: "📩", name: "Sol. Recibidas",     desc: "Gestión de solicitudes",    color: "10B981" },
    { icon: "📈", name: "Reportes",           desc: "PDF y Excel ejecutivo",     color: "F97316" },
    { icon: "🔐", name: "Accesos",            desc: "Usuarios y permisos",       color: "6366F1" },
  ];

  const cols = 4, rows = 3;
  modulos.forEach((m, i) => {
    const col = i % cols, row = Math.floor(i / cols);
    const x = 0.35 + col * 2.35, y = 1.25 + row * 1.35;
    s.addShape(pres.shapes.RECTANGLE, { x, y, w: 2.2, h: 1.1, fill: { color: "1E293B" }, line: { color: m.color, width: 0.75 }, shadow: makeShadow() });
    s.addShape(pres.shapes.RECTANGLE, { x, y, w: 0.06, h: 1.1, fill: { color: m.color }, line: { color: m.color } });
    s.addText(m.icon, { x: x + 0.12, y: y + 0.08, w: 0.5, h: 0.45, fontSize: 18, align: "center" });
    s.addText(m.name, { x: x + 0.62, y: y + 0.08, w: 1.52, h: 0.32, fontSize: 10, bold: true, color: C.white, fontFace: "Calibri", valign: "middle", margin: 0 });
    s.addText(m.desc, { x: x + 0.62, y: y + 0.45, w: 1.52, h: 0.35, fontSize: 8, color: "94A3B8", fontFace: "Calibri", valign: "top", margin: 0 });
  });

  // Admin badge
  s.addShape(pres.shapes.RECTANGLE, { x: 9.4 - 2.2, y: 1.25 + 2 * 1.35, w: 2.2, h: 1.1, fill: { color: "1E293B" }, line: { color: "475569", width: 0.75 } });
  s.addShape(pres.shapes.RECTANGLE, { x: 9.4 - 2.2, y: 1.25 + 2 * 1.35, w: 0.06, h: 1.1, fill: { color: "475569" }, line: { color: "475569" } });
  s.addText("🛡️", { x: 9.4 - 2.2 + 0.12, y: 1.25 + 2 * 1.35 + 0.08, w: 0.5, h: 0.45, fontSize: 18, align: "center" });
  s.addText("Solo Admin", { x: 9.4 - 2.2 + 0.62, y: 1.25 + 2 * 1.35 + 0.08, w: 1.52, h: 0.32, fontSize: 9, bold: false, color: "475569", fontFace: "Calibri", italic: true, valign: "middle", margin: 0 });
  s.addText("Accesos + Sol. Recibidas", { x: 9.4 - 2.2 + 0.62, y: 1.25 + 2 * 1.35 + 0.45, w: 1.52, h: 0.35, fontSize: 7.5, color: "334155", fontFace: "Calibri", valign: "top", margin: 0 });

  s.addText("Sistema RCMA  ·  Colegios Mano Amiga  ·  2026", { x: 0, y: 5.35, w: W, h: 0.25, fontSize: 8, color: "334155", align: "center" });
}

// ─────────────────────────────────────────────────────────────────────────────
// SLIDE 4 — PROYECTOS Y TICKETS
// ─────────────────────────────────────────────────────────────────────────────
{
  const s = pres.addSlide();
  s.background = { color: C.offWhite };

  s.addText("Proyectos & Tickets TCMM", { x: 0.5, y: 0.25, w: 9, h: 0.55, fontSize: 26, bold: true, color: C.dark, fontFace: "Arial Black" });
  s.addShape(pres.shapes.RECTANGLE, { x: 0.5, y: 0.85, w: 9, h: 0.03, fill: { color: C.grayLight }, line: { color: C.grayLight } });

  // Proyectos — lado izquierdo
  addCard(s, 0.4, 1.0, 4.4, 4.0);
  s.addShape(pres.shapes.RECTANGLE, { x: 0.4, y: 1.0, w: 4.4, h: 0.45, fill: { color: "1E3A5F" }, line: { color: "1E3A5F" } });
  s.addText("📁  PROYECTOS", { x: 0.5, y: 1.0, w: 4.2, h: 0.45, fontSize: 12, bold: true, color: C.white, fontFace: "Calibri", valign: "middle", margin: 0 });

  const proyFeat = [
    "Tarjetas con estatus, prioridad y tipo",
    "Filtro multi-estado simultáneo",
    "Ficha detalle con presupuesto",
    "KPIs: Total, Con/Sin Ticket, Completados",
    "Cancelación en cascada desde Tickets",
    "Vinculación con Tickets TCMM",
  ];
  proyFeat.forEach((f, i) => {
    s.addShape(pres.shapes.OVAL, { x: 0.55, y: 1.58 + i * 0.5, w: 0.12, h: 0.12, fill: { color: C.blue }, line: { color: C.blue } });
    s.addText(f, { x: 0.78, y: 1.52 + i * 0.5, w: 3.8, h: 0.3, fontSize: 10, color: C.dark, fontFace: "Calibri", valign: "middle", margin: 0 });
  });

  // Tickets — lado derecho
  addCard(s, 5.2, 1.0, 4.4, 4.0);
  s.addShape(pres.shapes.RECTANGLE, { x: 5.2, y: 1.0, w: 4.4, h: 0.45, fill: { color: "7F1D1D" }, line: { color: "7F1D1D" } });
  s.addText("🎫  TICKETS TCMM", { x: 5.3, y: 1.0, w: 4.2, h: 0.45, fontSize: 12, bold: true, color: C.white, fontFace: "Calibri", valign: "middle", margin: 0 });

  const tickFeat = [
    "Folio automático TCMM000",
    "Control de presupuesto y proveedor",
    "Plan de financiamiento (FBC/OPEX)",
    "Monto total excluye cancelados",
    "Cancela proyecto vinculado en automático",
    "KPIs por territorio y estatus",
  ];
  tickFeat.forEach((f, i) => {
    s.addShape(pres.shapes.OVAL, { x: 5.35, y: 1.58 + i * 0.5, w: 0.12, h: 0.12, fill: { color: C.red }, line: { color: C.red } });
    s.addText(f, { x: 5.58, y: 1.52 + i * 0.5, w: 3.8, h: 0.3, fontSize: 10, color: C.dark, fontFace: "Calibri", valign: "middle", margin: 0 });
  });

  s.addText("Sistema RCMA  ·  Colegios Mano Amiga  ·  2026", { x: 0, y: 5.35, w: W, h: 0.25, fontSize: 8, color: "CBD5E1", align: "center" });
}

// ─────────────────────────────────────────────────────────────────────────────
// SLIDE 5 — ANTEPROYECTOS Y PENDIENTES
// ─────────────────────────────────────────────────────────────────────────────
{
  const s = pres.addSlide();
  s.background = { color: C.offWhite };

  s.addText("Anteproyectos & Pendientes", { x: 0.5, y: 0.25, w: 9, h: 0.55, fontSize: 26, bold: true, color: C.dark, fontFace: "Arial Black" });
  s.addShape(pres.shapes.RECTANGLE, { x: 0.5, y: 0.85, w: 9, h: 0.03, fill: { color: C.grayLight }, line: { color: C.grayLight } });

  // Anteproyectos
  addCard(s, 0.4, 1.0, 4.4, 4.0);
  s.addShape(pres.shapes.RECTANGLE, { x: 0.4, y: 1.0, w: 4.4, h: 0.45, fill: { color: "4C1D95" }, line: { color: "4C1D95" } });
  s.addText("📐  ANTEPROYECTOS", { x: 0.5, y: 1.0, w: 4.2, h: 0.45, fontSize: 12, bold: true, color: C.white, fontFace: "Calibri", valign: "middle", margin: 0 });

  const anteFeat = [
    "Fecha de solicitud y entrega",
    "Presupuesto estimado en MXN",
    "Ruta de carpeta OneDrive",
    "KPIs: Solicitados, Entregados, Pendientes",
    "Presupuesto total + Vinculados a proyectos",
    "Vinculación con proyectos TCMM",
  ];
  anteFeat.forEach((f, i) => {
    s.addShape(pres.shapes.OVAL, { x: 0.55, y: 1.58 + i * 0.5, w: 0.12, h: 0.12, fill: { color: C.purple }, line: { color: C.purple } });
    s.addText(f, { x: 0.78, y: 1.52 + i * 0.5, w: 3.8, h: 0.3, fontSize: 10, color: C.dark, fontFace: "Calibri", valign: "middle", margin: 0 });
  });

  // Pendientes
  addCard(s, 5.2, 1.0, 4.4, 4.0);
  s.addShape(pres.shapes.RECTANGLE, { x: 5.2, y: 1.0, w: 4.4, h: 0.45, fill: { color: "0C4A6E" }, line: { color: "0C4A6E" } });
  s.addText("⏳  PENDIENTES", { x: 5.3, y: 1.0, w: 4.2, h: 0.45, fontSize: 12, bold: true, color: C.white, fontFace: "Calibri", valign: "middle", margin: 0 });

  const pendFeat = [
    "KPIs: Total, En Progreso, Pausados",
    "Prioridades urgentes destacadas",
    "División por territorios en KPIs",
    "Badge azul clickeable al proyecto",
    "\"Sin vinculación\" en gris claro",
    "Sin campo presupuesto (evita duplicidad)",
  ];
  pendFeat.forEach((f, i) => {
    s.addShape(pres.shapes.OVAL, { x: 5.35, y: 1.58 + i * 0.5, w: 0.12, h: 0.12, fill: { color: C.accent }, line: { color: C.accent } });
    s.addText(f, { x: 5.58, y: 1.52 + i * 0.5, w: 3.8, h: 0.3, fontSize: 10, color: C.dark, fontFace: "Calibri", valign: "middle", margin: 0 });
  });

  s.addText("Sistema RCMA  ·  Colegios Mano Amiga  ·  2026", { x: 0, y: 5.35, w: W, h: 0.25, fontSize: 8, color: "CBD5E1", align: "center" });
}

// ─────────────────────────────────────────────────────────────────────────────
// SLIDE 6 — CHECKLISTS DE INSPECCIÓN
// ─────────────────────────────────────────────────────────────────────────────
{
  const s = pres.addSlide();
  s.background = { color: C.dark };

  s.addText("Checklists de Inspección", { x: 0.5, y: 0.25, w: 9, h: 0.55, fontSize: 26, bold: true, color: C.white, fontFace: "Arial Black" });
  s.addText("Validación visual de infraestructuras escolares", { x: 0.5, y: 0.82, w: 9, h: 0.3, fontSize: 11, color: "94A3B8", fontFace: "Calibri" });

  // Cards de características
  const feats = [
    { icon: "🔍", title: "Inspección por Ítems", desc: "Cada ítem con estado individual: Bueno, Regular, Malo o Crítico. El estado general se calcula automáticamente del peor ítem.", color: C.green },
    { icon: "📄", title: "PDF Profesional", desc: "Reporte con logo institucional, resumen de condiciones con KPIs y tabla de ítems inspeccionados.", color: C.accent },
    { icon: "🏗️", title: "Tipos de Material", desc: "Pétreos, Metálicos, Aglomerantes, Cerámicos, Madera y Sintéticos. Clasificación técnica completa.", color: C.amber },
    { icon: "🔗", title: "Integración Total", desc: "Filtros por territorio, colegio y material. Vinculado al colegio y ECO responsable automáticamente.", color: C.purple },
  ];

  feats.forEach((f, i) => {
    const x = 0.35 + (i % 2) * 4.7, y = 1.3 + Math.floor(i / 2) * 1.8;
    s.addShape(pres.shapes.RECTANGLE, { x, y, w: 4.4, h: 1.55, fill: { color: "1E293B" }, line: { color: f.color, width: 0.75 }, shadow: makeShadow() });
    s.addText(f.icon, { x: x + 0.15, y: y + 0.15, w: 0.7, h: 0.6, fontSize: 22, align: "center" });
    s.addShape(pres.shapes.RECTANGLE, { x: x + 0.9, y: y + 0.18, w: 3.35, h: 0.05, fill: { color: f.color }, line: { color: f.color } });
    s.addText(f.title, { x: x + 0.9, y: y + 0.28, w: 3.35, h: 0.32, fontSize: 11, bold: true, color: C.white, fontFace: "Calibri", margin: 0 });
    s.addText(f.desc, { x: x + 0.9, y: y + 0.65, w: 3.35, h: 0.75, fontSize: 9, color: "94A3B8", fontFace: "Calibri", margin: 0 });
  });

  s.addText("Sistema RCMA  ·  Colegios Mano Amiga  ·  2026", { x: 0, y: 5.35, w: W, h: 0.25, fontSize: 8, color: "334155", align: "center" });
}

// ─────────────────────────────────────────────────────────────────────────────
// SLIDE 7 — NOTIFICACIONES POR EMAIL
// ─────────────────────────────────────────────────────────────────────────────
{
  const s = pres.addSlide();
  s.background = { color: C.offWhite };

  s.addText("Notificaciones por Email", { x: 0.5, y: 0.25, w: 9, h: 0.55, fontSize: 26, bold: true, color: C.dark, fontFace: "Arial Black" });
  s.addShape(pres.shapes.RECTANGLE, { x: 0.5, y: 0.85, w: 9, h: 0.03, fill: { color: C.grayLight }, line: { color: C.grayLight } });

  // Tag tecnología
  s.addShape(pres.shapes.RECTANGLE, { x: 0.5, y: 1.0, w: 3.5, h: 0.32, fill: { color: C.blue }, line: { color: C.blue } });
  s.addText("Supabase Edge Functions  ·  SMTP Outlook 365", { x: 0.5, y: 1.0, w: 3.5, h: 0.32, fontSize: 8.5, bold: true, color: C.white, align: "center", valign: "middle", margin: 0 });

  // Flujos
  const flujos = [
    {
      num: "01", evento: "Invitación de Usuario", quien: "Admin → Nuevo usuario",
      desc: "Al agregar un nuevo usuario desde Accesos, se envía automáticamente un email con botón de activación y creación de contraseña.",
      color: C.blue,
    },
    {
      num: "02", evento: "Nueva Solicitud Recibida", quien: "Sistema → Administrador",
      desc: "Cuando alguien envía una solicitud de proyecto, el administrador recibe notificación instantánea con todos los datos del solicitante.",
      color: C.green,
    },
    {
      num: "03", evento: "Solicitud Confirmada", quien: "Admin → Solicitante",
      desc: "Al marcar una solicitud como 'Recibida', el solicitante recibe confirmación con badge verde, datos del proyecto y fecha de recepción.",
      color: C.amber,
    },
  ];

  flujos.forEach((f, i) => {
    const y = 1.45 + i * 1.3;
    addCard(s, 0.4, y, 9.2, 1.1);
    s.addShape(pres.shapes.RECTANGLE, { x: 0.4, y, w: 0.7, h: 1.1, fill: { color: f.color }, line: { color: f.color } });
    s.addText(f.num, { x: 0.4, y, w: 0.7, h: 1.1, fontSize: 22, bold: true, color: C.white, align: "center", valign: "middle", fontFace: "Arial Black" });
    s.addText(f.evento, { x: 1.25, y: y + 0.1, w: 3.5, h: 0.32, fontSize: 12, bold: true, color: C.dark, fontFace: "Calibri", margin: 0 });
    s.addText(f.quien, { x: 1.25, y: y + 0.42, w: 3.5, h: 0.22, fontSize: 9, color: f.color, fontFace: "Calibri", bold: true, margin: 0 });
    s.addText(f.desc, { x: 4.9, y: y + 0.1, w: 4.55, h: 0.88, fontSize: 9.5, color: C.gray, fontFace: "Calibri", valign: "middle", margin: 0 });
    s.addShape(pres.shapes.RECTANGLE, { x: 4.8, y: y + 0.2, w: 0.02, h: 0.7, fill: { color: C.grayLight }, line: { color: C.grayLight } });
  });

  s.addText("Sistema RCMA  ·  Colegios Mano Amiga  ·  2026", { x: 0, y: 5.35, w: W, h: 0.25, fontSize: 8, color: "CBD5E1", align: "center" });
}

// ─────────────────────────────────────────────────────────────────────────────
// SLIDE 8 — REPORTES Y EXPORTACIÓN
// ─────────────────────────────────────────────────────────────────────────────
{
  const s = pres.addSlide();
  s.background = { color: C.dark };

  s.addText("Reportes y Exportación", { x: 0.5, y: 0.25, w: 9, h: 0.55, fontSize: 26, bold: true, color: C.white, fontFace: "Arial Black" });
  s.addText("Documentación ejecutiva lista para presentar al comité directivo", { x: 0.5, y: 0.82, w: 9, h: 0.3, fontSize: 11, color: "94A3B8", fontFace: "Calibri" });

  // PDF Card
  addCard(s, 0.4, 1.25, 4.5, 3.7, "1E293B");
  s.addShape(pres.shapes.RECTANGLE, { x: 0.4, y: 1.25, w: 4.5, h: 0.5, fill: { color: "7F1D1D" }, line: { color: "7F1D1D" } });
  s.addText("📄  REPORTE PDF — RESUMEN GENERAL", { x: 0.5, y: 1.25, w: 4.3, h: 0.5, fontSize: 10, bold: true, color: C.white, fontFace: "Calibri", valign: "middle", margin: 0 });
  const pdfItems = ["Logo institucional Colegios Mano Amiga", "Resumen ejecutivo con KPIs", "Proyectos por territorio con gráfica de barras", "Detalle de proyectos activos", "Tickets TCMM por territorio", "Checklists: PDF individual por inspección"];
  pdfItems.forEach((item, i) => {
    s.addShape(pres.shapes.OVAL, { x: 0.6, y: 1.9 + i * 0.4, w: 0.1, h: 0.1, fill: { color: "EF4444" }, line: { color: "EF4444" } });
    s.addText(item, { x: 0.82, y: 1.85 + i * 0.4, w: 3.85, h: 0.28, fontSize: 9.5, color: "CBD5E1", fontFace: "Calibri", margin: 0 });
  });

  // Excel Card
  addCard(s, 5.1, 1.25, 4.5, 3.7, "1E293B");
  s.addShape(pres.shapes.RECTANGLE, { x: 5.1, y: 1.25, w: 4.5, h: 0.5, fill: { color: "14532D" }, line: { color: "14532D" } });
  s.addText("📊  MATRIZ EXCEL — CONCENTRADO RCMA", { x: 5.2, y: 1.25, w: 4.3, h: 0.5, fontSize: 10, bold: true, color: C.white, fontFace: "Calibri", valign: "middle", margin: 0 });
  const xlsItems = ["7 hojas: Resumen + 1 por módulo", "Encabezados con diseño corporativo dark", "Filtros AutoFilter en cada columna", "Filas alternadas para mejor lectura", "Presupuestos con formato $ MXN", "Nombre automático con fecha del día"];
  xlsItems.forEach((item, i) => {
    s.addShape(pres.shapes.OVAL, { x: 5.3, y: 1.9 + i * 0.4, w: 0.1, h: 0.1, fill: { color: C.green }, line: { color: C.green } });
    s.addText(item, { x: 5.52, y: 1.85 + i * 0.4, w: 3.85, h: 0.28, fontSize: 9.5, color: "CBD5E1", fontFace: "Calibri", margin: 0 });
  });

  s.addText("Sistema RCMA  ·  Colegios Mano Amiga  ·  2026", { x: 0, y: 5.35, w: W, h: 0.25, fontSize: 8, color: "334155", align: "center" });
}

// ─────────────────────────────────────────────────────────────────────────────
// SLIDE 9 — ACCESOS Y PERMISOS
// ─────────────────────────────────────────────────────────────────────────────
{
  const s = pres.addSlide();
  s.background = { color: C.offWhite };

  s.addText("Control de Accesos y Permisos", { x: 0.5, y: 0.25, w: 9, h: 0.55, fontSize: 26, bold: true, color: C.dark, fontFace: "Arial Black" });
  s.addShape(pres.shapes.RECTANGLE, { x: 0.5, y: 0.85, w: 9, h: 0.03, fill: { color: C.grayLight }, line: { color: C.grayLight } });

  // Izquierda — descripción
  s.addText("Control granular de acceso", { x: 0.5, y: 1.0, w: 4.5, h: 0.38, fontSize: 14, bold: true, color: C.dark, fontFace: "Calibri" });
  s.addText("Cada usuario tiene permisos individuales por módulo. El Sidebar se adapta automáticamente mostrando solo los módulos autorizados.", {
    x: 0.5, y: 1.42, w: 4.5, h: 0.7, fontSize: 11, color: C.gray, fontFace: "Calibri",
  });

  const permsData = [
    { modulo: "Dashboard",        perms: ["Ver Dashboard"] },
    { modulo: "Proyectos",        perms: ["Ver", "Crear", "Editar", "Eliminar"] },
    { modulo: "Tickets TCMM",     perms: ["Ver", "Crear", "Editar", "Eliminar"] },
    { modulo: "Anteproyectos",    perms: ["Ver", "Crear", "Editar", "Eliminar"] },
    { modulo: "Checklists",       perms: ["Ver", "Crear", "Editar", "Eliminar"] },
    { modulo: "Pendientes",       perms: ["Ver", "Crear", "Editar", "Eliminar"] },
    { modulo: "Reportes",         perms: ["Ver", "Crear", "Editar", "Eliminar"] },
  ];

  permsData.forEach((p, i) => {
    const y = 2.25 + i * 0.4;
    s.addText(p.modulo, { x: 0.5, y, w: 2.0, h: 0.3, fontSize: 9, bold: true, color: C.dark, fontFace: "Calibri", margin: 0 });
    p.perms.forEach((perm, j) => {
      s.addShape(pres.shapes.RECTANGLE, { x: 2.7 + j * 0.52, y: y + 0.03, w: 0.48, h: 0.22, fill: { color: C.blueLight }, line: { color: "BFDBFE" } });
      s.addText(perm, { x: 2.7 + j * 0.52, y: y + 0.03, w: 0.48, h: 0.22, fontSize: 7, color: C.blue, align: "center", valign: "middle", margin: 0 });
    });
  });

  // Derecha — flujo de invitación
  addCard(s, 5.2, 1.0, 4.4, 4.25, C.dark);
  s.addText("Flujo de Invitación", { x: 5.4, y: 1.12, w: 4.0, h: 0.35, fontSize: 13, bold: true, color: C.white, fontFace: "Calibri" });

  const steps = [
    { n: "1", t: "Admin crea usuario", d: "Asigna permisos granulares en Accesos" },
    { n: "2", t: "Email automático", d: "Supabase + SMTP Outlook envía invitación" },
    { n: "3", t: "Usuario activa cuenta", d: "Crea contraseña desde el link del email" },
    { n: "4", t: "Acceso controlado", d: "Sidebar muestra solo sus módulos" },
  ];
  steps.forEach((st, i) => {
    const y = 1.6 + i * 0.85;
    s.addShape(pres.shapes.RECTANGLE, { x: 5.3, y, w: 0.38, h: 0.38, fill: { color: C.blue }, line: { color: C.blue } });
    s.addText(st.n, { x: 5.3, y, w: 0.38, h: 0.38, fontSize: 14, bold: true, color: C.white, align: "center", valign: "middle", fontFace: "Arial Black", margin: 0 });
    s.addText(st.t, { x: 5.82, y: y + 0.01, w: 3.55, h: 0.22, fontSize: 10, bold: true, color: C.white, fontFace: "Calibri", margin: 0 });
    s.addText(st.d, { x: 5.82, y: y + 0.24, w: 3.55, h: 0.22, fontSize: 8.5, color: "94A3B8", fontFace: "Calibri", margin: 0 });
    if (i < 3) s.addShape(pres.shapes.RECTANGLE, { x: 5.46, y: y + 0.4, w: 0.06, h: 0.42, fill: { color: "334155" }, line: { color: "334155" } });
  });

  s.addText("Sistema RCMA  ·  Colegios Mano Amiga  ·  2026", { x: 0, y: 5.35, w: W, h: 0.25, fontSize: 8, color: "CBD5E1", align: "center" });
}

// ─────────────────────────────────────────────────────────────────────────────
// SLIDE 10 — TECNOLOGÍA
// ─────────────────────────────────────────────────────────────────────────────
{
  const s = pres.addSlide();
  s.background = { color: C.dark };

  s.addText("Stack Tecnológico", { x: 0.5, y: 0.25, w: 9, h: 0.55, fontSize: 26, bold: true, color: C.white, fontFace: "Arial Black" });
  s.addText("100% cloud — sin instalación — accesible desde cualquier dispositivo", { x: 0.5, y: 0.82, w: 9, h: 0.3, fontSize: 11, color: "94A3B8", fontFace: "Calibri" });

  const stack = [
    { cat: "Frontend",  items: ["React 18 + Vite", "TypeScript", "Tailwind CSS", "TanStack Query"], color: "3B82F6" },
    { cat: "Backend",   items: ["Supabase (PostgreSQL)", "Row Level Security", "Edge Functions", "Auth + Storage"], color: "10B981" },
    { cat: "Deploy",    items: ["Vercel (CDN Global)", "GitHub Actions CI/CD", "Auto-deploy en push", "SSL/HTTPS automático"], color: "F59E0B" },
    { cat: "Offline",   items: ["IndexedDB local", "Sync automático", "Cola de cambios", "Indicador de estado"], color: "8B5CF6" },
    { cat: "Email",     items: ["Supabase Edge Fn.", "SMTP Outlook 365", "Templates HTML", "Secrets cifrados"], color: "EC4899" },
    { cat: "Reportes",  items: ["jsPDF + html2canvas", "xlsx-js-style", "PptxGenJS", "Logo institucional"], color: "F97316" },
  ];

  stack.forEach((item, i) => {
    const col = i % 3, row = Math.floor(i / 3);
    const x = 0.35 + col * 3.15, y = 1.25 + row * 2.0;
    s.addShape(pres.shapes.RECTANGLE, { x, y, w: 2.95, h: 1.7, fill: { color: "1E293B" }, line: { color: item.color, width: 0.75 }, shadow: makeShadow() });
    s.addShape(pres.shapes.RECTANGLE, { x, y, w: 2.95, h: 0.38, fill: { color: item.color }, line: { color: item.color } });
    s.addText(item.cat.toUpperCase(), { x, y, w: 2.95, h: 0.38, fontSize: 11, bold: true, color: C.white, align: "center", valign: "middle", fontFace: "Calibri", margin: 0 });
    item.items.forEach((it, j) => {
      s.addShape(pres.shapes.OVAL, { x: x + 0.15, y: y + 0.5 + j * 0.3, w: 0.08, h: 0.08, fill: { color: item.color }, line: { color: item.color } });
      s.addText(it, { x: x + 0.32, y: y + 0.44 + j * 0.3, w: 2.5, h: 0.26, fontSize: 9, color: "CBD5E1", fontFace: "Calibri", margin: 0 });
    });
  });

  s.addText("Sistema RCMA  ·  Colegios Mano Amiga  ·  2026", { x: 0, y: 5.35, w: W, h: 0.25, fontSize: 8, color: "334155", align: "center" });
}

// ─────────────────────────────────────────────────────────────────────────────
// SLIDE 11 — DIAGRAMA DE FLUJO
// ─────────────────────────────────────────────────────────────────────────────
{
  const s = pres.addSlide();
  s.background = { color: C.dark };

  s.addText("Flujo del Sistema", { x: 0.5, y: 0.2, w: 9, h: 0.5, fontSize: 26, bold: true, color: C.white, fontFace: "Arial Black" });
  s.addText("Cómo fluye la información entre módulos", { x: 0.5, y: 0.72, w: 9, h: 0.28, fontSize: 10, color: "94A3B8", fontFace: "Calibri" });

  // ── Nodos del flujo ────────────────────────────────────────────────────────
  const nodeW = 1.55, nodeH = 0.55;

  const drawNode = (slide, x, y, icon, label, bg, fg = C.white) => {
    slide.addShape(pres.shapes.RECTANGLE, { x, y, w: nodeW, h: nodeH, fill: { color: bg }, line: { color: bg }, shadow: makeShadow() });
    slide.addText(`${icon}  ${label}`, { x, y, w: nodeW, h: nodeH, fontSize: 8.5, bold: true, color: fg, align: "center", valign: "middle", fontFace: "Calibri", margin: 0 });
  };

  const arrow = (slide, x1, y1, x2, y2) => {
    slide.addShape(pres.shapes.LINE, { x: x1, y: y1, w: x2 - x1, h: y2 - y1, line: { color: "334155", width: 1.2, dashType: "solid" } });
  };

  // Fila 1 — Entradas al sistema
  drawNode(s, 0.3,  1.15, "📋", "Solicitud Proyecto", "1E3A5F");
  drawNode(s, 2.1,  1.15, "🎫", "Tickets TCMM", "7F1D1D");
  drawNode(s, 3.9,  1.15, "📁", "Proyectos",            "1E40AF");
  drawNode(s, 5.7,  1.15, "📐", "Anteproyectos",        "4C1D95");
  drawNode(s, 7.5,  1.15, "✅", "Checklists",           "14532D");

  // Flecha hacia abajo a módulo central
  [0.3, 2.1, 3.9, 5.7, 7.5].forEach(x => {
    arrow(s, x + nodeW / 2, 1.15 + nodeH, x + nodeW / 2, 2.05);
  });

  // Fila 2 — módulos de seguimiento
  drawNode(s, 0.3,  2.05, "⏳", "Pendientes",     "0C4A6E");
  drawNode(s, 2.1,  2.05, "📅", "Calendario",     "92400E");
  drawNode(s, 3.9,  2.05, "📊", "Dashboard KPIs","0F172A", C.accent);
  drawNode(s, 5.7,  2.05, "📩", "Sol. Recibidas", "064E3B");
  drawNode(s, 7.5,  2.05, "🔐", "Accesos Permisos","3730A3");

  // Flechas horizontales conectando hacia Dashboard
  // izquierda → dashboard
  s.addShape(pres.shapes.LINE, { x: 0.3 + nodeW, y: 2.05 + nodeH/2, w: 3.9 - (0.3 + nodeW), h: 0, line: { color: "334155", width: 1.2 } });
  s.addShape(pres.shapes.LINE, { x: 2.1 + nodeW, y: 2.05 + nodeH/2, w: 3.9 - (2.1 + nodeW), h: 0, line: { color: "334155", width: 1.2 } });
  // derecha → dashboard
  s.addShape(pres.shapes.LINE, { x: 3.9 + nodeW, y: 2.05 + nodeH/2, w: 5.7 - (3.9 + nodeW), h: 0, line: { color: "334155", width: 1.2 } });
  s.addShape(pres.shapes.LINE, { x: 5.7 + nodeW, y: 2.05 + nodeH/2, w: 7.5 - (5.7 + nodeW), h: 0, line: { color: "334155", width: 1.2 } });

  // Flecha dashboard hacia abajo a salidas
  arrow(s, 3.9 + nodeW / 2, 2.05 + nodeH, 3.9 + nodeW / 2, 3.1);

  // Fila 3 — Salidas / reportes
  const outW = 2.6;
  s.addShape(pres.shapes.RECTANGLE, { x: 0.5, y: 3.1, w: outW, h: 0.6, fill: { color: "1E293B" }, line: { color: C.accent, width: 0.75 } });
  s.addText("📄  PDF Ejecutivo", { x: 0.5, y: 3.1, w: outW, h: 0.6, fontSize: 9, bold: true, color: C.white, align: "center", valign: "middle", fontFace: "Calibri" });

  s.addShape(pres.shapes.RECTANGLE, { x: 3.7, y: 3.1, w: outW, h: 0.6, fill: { color: "1E293B" }, line: { color: C.green, width: 0.75 } });
  s.addText("📊  Matriz Excel", { x: 3.7, y: 3.1, w: outW, h: 0.6, fontSize: 9, bold: true, color: C.white, align: "center", valign: "middle", fontFace: "Calibri" });

  s.addShape(pres.shapes.RECTANGLE, { x: 6.9, y: 3.1, w: outW, h: 0.6, fill: { color: "1E293B" }, line: { color: C.amber, width: 0.75 } });
  s.addText("📧  Email Notif.", { x: 6.9, y: 3.1, w: outW, h: 0.6, fontSize: 9, bold: true, color: C.white, align: "center", valign: "middle", fontFace: "Calibri" });

  // Flechas desde dashboard a salidas
  arrow(s, 3.9 + nodeW/2, 3.1, 0.5 + outW/2, 3.1);
  arrow(s, 3.9 + nodeW/2, 3.1, 6.9 + outW/2, 3.1);

  // Leyenda base tecnológica
  s.addShape(pres.shapes.RECTANGLE, { x: 0.3, y: 3.9, w: 9.4, h: 0.45, fill: { color: "1E293B" }, line: { color: "334155" } });
  s.addText("🔧  React + Vite  ·  Supabase PostgreSQL  ·  Edge Functions  ·  Vercel CDN  ·  SMTP Outlook 365  ·  IndexedDB Offline", {
    x: 0.3, y: 3.9, w: 9.4, h: 0.45, fontSize: 8.5, color: "64748B", align: "center", valign: "middle", fontFace: "Calibri",
  });

  // Etiquetas de filas
  s.addText("ENTRADA", { x: 9.55, y: 1.25, w: 0.85, h: 0.35, fontSize: 7, bold: true, color: "64748B", align: "center", fontFace: "Calibri" });
  s.addText("GESTIÓN", { x: 9.55, y: 2.15, w: 0.85, h: 0.35, fontSize: 7, bold: true, color: "64748B", align: "center", fontFace: "Calibri" });
  s.addText("SALIDA",  { x: 9.55, y: 3.2,  w: 0.85, h: 0.35, fontSize: 7, bold: true, color: "64748B", align: "center", fontFace: "Calibri" });

  s.addText("Sistema RCMA  ·  Colegios Mano Amiga  ·  2026", { x: 0, y: 5.35, w: W, h: 0.25, fontSize: 8, color: "334155", align: "center" });
}

// ─────────────────────────────────────────────────────────────────────────────
// SLIDE 12 — BORRADOR PARA CAPTURAS DE PANTALLA
// ─────────────────────────────────────────────────────────────────────────────
{
  const s = pres.addSlide();
  s.background = { color: C.offWhite };

  // Título editable
  s.addShape(pres.shapes.RECTANGLE, { x: 0.4, y: 0.2, w: 9.2, h: 0.62, fill: { color: C.dark }, line: { color: C.dark } });
  s.addText("[ NOMBRE DEL MÓDULO ]", { x: 0.4, y: 0.2, w: 7.5, h: 0.62, fontSize: 18, bold: true, color: C.white, fontFace: "Arial Black", valign: "middle", margin: 0 });
  s.addShape(pres.shapes.RECTANGLE, { x: 8.1, y: 0.2, w: 1.5, h: 0.62, fill: { color: C.blue }, line: { color: C.blue } });
  s.addText("Sistema RCMA", { x: 8.1, y: 0.2, w: 1.5, h: 0.62, fontSize: 7.5, bold: true, color: C.white, align: "center", valign: "middle", fontFace: "Calibri", margin: 0 });

  // Placeholder principal de captura — área grande
  s.addShape(pres.shapes.RECTANGLE, {
    x: 0.4, y: 1.0, w: 9.2, h: 3.6,
    fill: { color: "F1F5F9" },
    line: { color: "CBD5E1", width: 1.5, dashType: "dashDot" },
  });
  s.addText("INSERTAR CAPTURA DE PANTALLA", { x: 0.4, y: 1.0, w: 9.2, h: 2.4, fontSize: 16, bold: true, color: "94A3B8", align: "center", valign: "bottom", fontFace: "Calibri" });
  s.addText("Insertar > Imagenes  o  arrastrar el archivo PNG/JPG", { x: 0.4, y: 3.4, w: 9.2, h: 1.2, fontSize: 10, color: "CBD5E1", align: "center", valign: "top", fontFace: "Calibri", italic: true });

  // Descripción editable abajo
  s.addShape(pres.shapes.RECTANGLE, { x: 0.4, y: 4.72, w: 9.2, h: 0.55, fill: { color: C.white }, line: { color: C.grayLight } });
  s.addText("[ Descripción breve del módulo o funcionalidad mostrada en la captura ]", {
    x: 0.5, y: 4.72, w: 9.0, h: 0.55, fontSize: 10, color: "94A3B8", italic: true, fontFace: "Calibri", valign: "middle",
  });

  // Nota de instrucción
  s.addText("💡  Duplica esta diapositiva (clic derecho → Duplicar) para agregar más capturas", {
    x: 0.4, y: 5.28, w: 9.2, h: 0.25, fontSize: 8, color: "CBD5E1", fontFace: "Calibri", align: "center",
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// SLIDE 11 — CIERRE
// ─────────────────────────────────────────────────────────────────────────────
{
  const s = pres.addSlide();
  s.background = { color: C.dark };

  s.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: 0.06, h: H, fill: { color: C.accent }, line: { color: C.accent } });
  s.addShape(pres.shapes.RECTANGLE, { x: 7.2, y: 0, w: 2.8, h: H, fill: { color: "111827" }, line: { color: "111827" } });

  s.addText("Sistema RCMA", { x: 0.5, y: 1.0, w: 6.4, h: 0.7, fontSize: 44, bold: true, color: C.white, fontFace: "Arial Black", charSpacing: 2 });
  s.addShape(pres.shapes.RECTANGLE, { x: 0.5, y: 1.75, w: 3.5, h: 0.04, fill: { color: C.accent }, line: { color: C.accent } });
  s.addText("Plataforma completa y en producción", { x: 0.5, y: 1.9, w: 6.4, h: 0.4, fontSize: 16, color: C.accent, fontFace: "Calibri" });

  const logros = [
    "13 módulos integrados y funcionales",
    "Notificaciones email institucional activas",
    "Exportación PDF y Excel ejecutivo",
    "Control de accesos granular por usuario",
    "Funciona online y offline con sincronización",
  ];
  logros.forEach((l, i) => {
    s.addShape(pres.shapes.RECTANGLE, { x: 0.5, y: 2.45 + i * 0.38, w: 0.25, h: 0.22, fill: { color: C.green }, line: { color: C.green } });
    s.addText("✓", { x: 0.5, y: 2.45 + i * 0.38, w: 0.25, h: 0.22, fontSize: 10, bold: true, color: C.white, align: "center", valign: "middle", margin: 0 });
    s.addText(l, { x: 0.88, y: 2.45 + i * 0.38, w: 5.6, h: 0.28, fontSize: 11, color: "CBD5E1", fontFace: "Calibri", margin: 0 });
  });

  s.addText("rreyes@manoamiga.edu.mx", { x: 0.5, y: 5.1, w: 4.0, h: 0.3, fontSize: 10, color: C.accent, fontFace: "Calibri" });
  s.addText("gestion-rcma-vercel.vercel.app", { x: 0.5, y: 4.8, w: 4.0, h: 0.28, fontSize: 10, color: "64748B", fontFace: "Calibri", italic: true });
}

// ─────────────────────────────────────────────────────────────────────────────
pres.writeFile({ fileName: "Sistema_RCMA_Presentacion_2026.pptx" })
  .then(() => console.log("✅  Sistema_RCMA_Presentacion_2026.pptx generado correctamente"))
  .catch(err => console.error("❌  Error:", err));
