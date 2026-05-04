const pptxgen = require("pptxgenjs");
const pres    = new pptxgen();

pres.layout = "LAYOUT_16x9";
pres.title  = "Sistema RCMA — Propuesta Ejecutiva";
pres.author = "Coordinación de Obras — Colegios Mano Amiga";

const C = {
  dark:      "0F172A",
  blue:      "1E40AF",
  accent:    "0EA5E9",
  white:     "FFFFFF",
  offWhite:  "F8FAFC",
  gray:      "64748B",
  grayLight: "E2E8F0",
  green:     "16A34A",
  amber:     "D97706",
  red:       "DC2626",
  purple:    "7C3AED",
};

const W = 10, H = 5.625;
const makeShadow = () => ({ type: "outer", blur: 8, offset: 3, angle: 135, color: "000000", opacity: 0.12 });

function addCard(slide, x, y, w, h, color) {
  color = color || "FFFFFF";
  slide.addShape(pres.shapes.RECTANGLE, { x, y, w, h, fill: { color }, line: { color: "E2E8F0", width: 0.5 }, shadow: makeShadow() });
}

// ─────────────────────────────────────────────────────────────────────────────
// SLIDE 1 — PORTADA IMPACTO
// ─────────────────────────────────────────────────────────────────────────────
{
  const s = pres.addSlide();
  s.background = { color: C.dark };

  s.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: 0.06, h: H, fill: { color: C.accent }, line: { color: C.accent } });
  s.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: W, h: 0.06, fill: { color: C.accent }, line: { color: C.accent } });
  s.addShape(pres.shapes.RECTANGLE, { x: 7.2, y: 0, w: 2.8, h: H, fill: { color: "111827" }, line: { color: "111827" } });
  s.addShape(pres.shapes.RECTANGLE, { x: 7.6, y: 1.2, w: 2.0, h: 2.0, fill: { color: C.accent, transparency: 80 }, line: { color: C.accent, transparency: 80 } });
  s.addShape(pres.shapes.RECTANGLE, { x: 8.2, y: 3.0, w: 1.5, h: 1.5, fill: { color: C.blue, transparency: 75 }, line: { color: C.blue, transparency: 75 } });

  s.addShape(pres.shapes.RECTANGLE, { x: 0.5, y: 0.68, w: 3.2, h: 0.32, fill: { color: C.accent }, line: { color: C.accent } });
  s.addText("PROPUESTA EJECUTIVA 2026", { x: 0.5, y: 0.68, w: 3.2, h: 0.32, fontSize: 8, bold: true, color: C.white, align: "center", valign: "middle", margin: 0 });

  s.addText("¿Por qué invertir en", { x: 0.5, y: 1.15, w: 6.5, h: 0.36, fontSize: 18, color: "94A3B8", fontFace: "Calibri" });
  s.addText("SISTEMA RCMA?", { x: 0.5, y: 1.52, w: 6.5, h: 1.1, fontSize: 50, bold: true, color: C.white, fontFace: "Arial Black", charSpacing: 1 });
  s.addText("La plataforma que transforma la gestión de infraestructura escolar en Colegios Mano Amiga", {
    x: 0.5, y: 2.68, w: 6.5, h: 0.42, fontSize: 12, color: C.accent, fontFace: "Calibri", italic: true,
  });
  s.addShape(pres.shapes.RECTANGLE, { x: 0.5, y: 3.18, w: 2.5, h: 0.04, fill: { color: C.accent }, line: { color: C.accent } });
  s.addText("Ricardo Joanathan Reyes Medina  ·  Coordinación de Obras", { x: 0.5, y: 5.22, w: 6.5, h: 0.25, fontSize: 9, color: "64748B", fontFace: "Calibri" });
}

// ─────────────────────────────────────────────────────────────────────────────
// SLIDE 2 — EL PROBLEMA HOY (antes del sistema)
// ─────────────────────────────────────────────────────────────────────────────
{
  const s = pres.addSlide();
  s.background = { color: "FFF7ED" };

  s.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: W, h: 0.06, fill: { color: C.amber }, line: { color: C.amber } });
  s.addText("La Realidad Sin el Sistema", { x: 0.5, y: 0.22, w: 9, h: 0.55, fontSize: 26, bold: true, color: C.dark, fontFace: "Arial Black" });
  s.addText("Los problemas que se enfrentan hoy sin una plataforma centralizada", { x: 0.5, y: 0.82, w: 9, h: 0.28, fontSize: 11, color: C.gray, fontFace: "Calibri" });

  const problemas = [
    { icon: "📋", titulo: "Información dispersa",     desc: "Proyectos en Excel, WhatsApp, correos y papeles. Sin un solo lugar centralizado que dé visibilidad real al comité directivo." },
    { icon: "⏰", titulo: "Tiempo perdido",            desc: "Horas semanales armando reportes manualmente para presentar avances. Tiempo que podría dedicarse a supervisar obra." },
    { icon: "🔍", titulo: "Sin trazabilidad",          desc: "Imposible saber el historial de un proyecto, quién aprobó qué, cuándo se pausó o por qué se canceló." },
    { icon: "💸", titulo: "Presupuestos sin control",  desc: "Sin visibilidad en tiempo real de cuánto se está gastando, en qué proyectos y bajo qué plan de financiamiento." },
    { icon: "📡", titulo: "Sin alertas ni notif.",     desc: "Las solicitudes de los colegios se pierden en emails. No hay confirmación automática ni seguimiento sistematizado." },
    { icon: "📊", titulo: "Reportes al comité",        desc: "Presentaciones armadas a mano, datos desactualizados, sin formato profesional ni estandarizado para el comité." },
  ];

  problemas.forEach(function(p, i) {
    var col = i % 3, row = Math.floor(i / 3);
    var x = 0.38 + col * 3.12, y = 1.22 + row * 2.05;
    s.addShape(pres.shapes.RECTANGLE, { x, y, w: 2.95, h: 1.85, fill: { color: C.white }, line: { color: "FED7AA", width: 0.75 }, shadow: makeShadow() });
    s.addShape(pres.shapes.RECTANGLE, { x, y, w: 2.95, h: 0.06, fill: { color: C.amber }, line: { color: C.amber } });
    s.addText(p.icon, { x, y: y + 0.1, w: 2.95, h: 0.45, fontSize: 22, align: "center" });
    s.addText(p.titulo, { x, y: y + 0.55, w: 2.95, h: 0.3, fontSize: 10, bold: true, color: C.dark, align: "center", fontFace: "Calibri" });
    s.addText(p.desc, { x: x + 0.12, y: y + 0.88, w: 2.71, h: 0.88, fontSize: 8.5, color: C.gray, fontFace: "Calibri", align: "center" });
  });

  s.addText("Sistema RCMA  ·  Propuesta Ejecutiva  ·  2026", { x: 0, y: 5.35, w: W, h: 0.25, fontSize: 8, color: "CBD5E1", align: "center" });
}

// ─────────────────────────────────────────────────────────────────────────────
// SLIDE 3 — LA SOLUCIÓN (qué hace el sistema)
// ─────────────────────────────────────────────────────────────────────────────
{
  const s = pres.addSlide();
  s.background = { color: C.dark };

  s.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: W, h: 0.06, fill: { color: C.green }, line: { color: C.green } });
  s.addText("Sistema RCMA: La Solución", { x: 0.5, y: 0.22, w: 9, h: 0.55, fontSize: 26, bold: true, color: C.white, fontFace: "Arial Black" });
  s.addText("Una plataforma cloud que centraliza, automatiza y da visibilidad total a la Coordinación de Obras", {
    x: 0.5, y: 0.82, w: 9, h: 0.28, fontSize: 11, color: "94A3B8", fontFace: "Calibri",
  });

  const soluciones = [
    { icon: "📊", color: C.accent,  titulo: "Dashboard en tiempo real",  desc: "KPIs actualizados al instante: proyectos activos, presupuestos, tickets y pendientes — sin armarlo manualmente." },
    { icon: "🗂️", color: C.blue,   titulo: "13 módulos integrados",      desc: "Proyectos, Tickets TCMM, Anteproyectos, Checklists, Pendientes, Calendario y más, en un solo lugar." },
    { icon: "📧", color: C.green,   titulo: "Notificaciones automáticas", desc: "Emails institucionales automáticos: invitaciones, solicitudes y confirmaciones sin intervención manual." },
    { icon: "📄", color: C.purple,  titulo: "PDF y Excel ejecutivo",      desc: "Reportes profesionales con un clic — listos para presentar al comité directivo en cualquier momento." },
    { icon: "🔒", color: C.amber,   titulo: "Control de accesos",         desc: "Cada usuario ve solo lo que le corresponde. Permisos granulares por módulo y función." },
    { icon: "☁️", color: "14B8A6",  titulo: "Cloud + Offline",            desc: "Funciona desde cualquier dispositivo, en cualquier lugar. Sincroniza automaticamente cuando hay conexión." },
  ];

  soluciones.forEach(function(sol, i) {
    var col = i % 3, row = Math.floor(i / 3);
    var x = 0.38 + col * 3.12, y = 1.22 + row * 2.05;
    s.addShape(pres.shapes.RECTANGLE, { x, y, w: 2.95, h: 1.85, fill: { color: "1E293B" }, line: { color: sol.color, width: 0.75 }, shadow: makeShadow() });
    s.addShape(pres.shapes.RECTANGLE, { x, y, w: 2.95, h: 0.06, fill: { color: sol.color }, line: { color: sol.color } });
    s.addText(sol.icon, { x, y: y + 0.1, w: 2.95, h: 0.45, fontSize: 22, align: "center" });
    s.addText(sol.titulo, { x, y: y + 0.55, w: 2.95, h: 0.3, fontSize: 10, bold: true, color: C.white, align: "center", fontFace: "Calibri" });
    s.addText(sol.desc, { x: x + 0.12, y: y + 0.88, w: 2.71, h: 0.88, fontSize: 8.5, color: "94A3B8", fontFace: "Calibri", align: "center" });
  });

  s.addText("Sistema RCMA  ·  Propuesta Ejecutiva  ·  2026", { x: 0, y: 5.35, w: W, h: 0.25, fontSize: 8, color: "334155", align: "center" });
}

// ─────────────────────────────────────────────────────────────────────────────
// SLIDE 4 — BENEFICIOS vs RIESGOS (pros y contras)
// ─────────────────────────────────────────────────────────────────────────────
{
  const s = pres.addSlide();
  s.background = { color: C.offWhite };

  s.addText("Con el Sistema vs Sin el Sistema", { x: 0.4, y: 0.22, w: 9.2, h: 0.55, fontSize: 24, bold: true, color: C.dark, fontFace: "Arial Black" });
  s.addShape(pres.shapes.RECTANGLE, { x: 0.4, y: 0.82, w: 9.2, h: 0.03, fill: { color: C.grayLight }, line: { color: C.grayLight } });

  // Encabezados
  s.addShape(pres.shapes.RECTANGLE, { x: 0.4, y: 0.9, w: 4.5, h: 0.45, fill: { color: C.green }, line: { color: C.green } });
  s.addShape(pres.shapes.RECTANGLE, { x: 5.1, y: 0.9, w: 4.5, h: 0.45, fill: { color: C.red   }, line: { color: C.red   } });
  s.addText("CON SISTEMA RCMA", { x: 0.4, y: 0.9, w: 4.5, h: 0.45, fontSize: 13, bold: true, color: C.white, align: "center", valign: "middle", fontFace: "Calibri" });
  s.addText("SIN SISTEMA RCMA",  { x: 5.1, y: 0.9, w: 4.5, h: 0.45, fontSize: 13, bold: true, color: C.white, align: "center", valign: "middle", fontFace: "Calibri" });

  var pros = [
    "Visibilidad total de todos los proyectos",
    "Reportes ejecutivos listos en 1 clic",
    "Trazabilidad completa de cada decision",
    "Notificaciones automaticas a los colegios",
    "Control de presupuestos en tiempo real",
    "Acceso desde cualquier dispositivo",
    "Inspecciones con checklist digitalizado",
    "Historial permanente de obras y tickets",
  ];

  var cons = [
    "Informacion fragmentada en multiples archivos",
    "Horas perdidas armando reportes manualmente",
    "Sin registro de quien aprobó ni cuando",
    "Solicitudes perdidas en correos o WhatsApp",
    "Presupuestos desactualizados o desconocidos",
    "Dependencia de una sola persona con los datos",
    "Inspecciones en papel, sin formato ni respaldo",
    "Sin historial — si alguien sale, se pierde todo",
  ];

  pros.forEach(function(p, i) {
    var y = 1.42 + i * 0.49;
    var bg = i % 2 === 0 ? "F0FDF4" : C.white;
    s.addShape(pres.shapes.RECTANGLE, { x: 0.4, y, w: 4.5, h: 0.44, fill: { color: bg }, line: { color: "BBF7D0", width: 0.3 } });
    s.addShape(pres.shapes.OVAL, { x: 0.52, y: y + 0.14, w: 0.16, h: 0.16, fill: { color: C.green }, line: { color: C.green } });
    s.addText(p, { x: 0.76, y, w: 4.08, h: 0.44, fontSize: 9.5, color: "166534", fontFace: "Calibri", valign: "middle", margin: 0 });
  });

  cons.forEach(function(c, i) {
    var y = 1.42 + i * 0.49;
    var bg = i % 2 === 0 ? "FEF2F2" : C.white;
    s.addShape(pres.shapes.RECTANGLE, { x: 5.1, y, w: 4.5, h: 0.44, fill: { color: bg }, line: { color: "FECACA", width: 0.3 } });
    s.addShape(pres.shapes.OVAL, { x: 5.22, y: y + 0.14, w: 0.16, h: 0.16, fill: { color: C.red }, line: { color: C.red } });
    s.addText(c, { x: 5.46, y, w: 4.08, h: 0.44, fontSize: 9.5, color: "991B1B", fontFace: "Calibri", valign: "middle", margin: 0 });
  });

  s.addText("Sistema RCMA  ·  Propuesta Ejecutiva  ·  2026", { x: 0, y: 5.35, w: W, h: 0.25, fontSize: 8, color: "CBD5E1", align: "center" });
}

// ─────────────────────────────────────────────────────────────────────────────
// SLIDE 5 — IMPACTO EN NÚMEROS
// ─────────────────────────────────────────────────────────────────────────────
{
  const s = pres.addSlide();
  s.background = { color: C.dark };

  s.addText("Impacto en Numeros", { x: 0.5, y: 0.22, w: 9, h: 0.55, fontSize: 26, bold: true, color: C.white, fontFace: "Arial Black" });
  s.addText("Lo que el sistema representa en tiempo, dinero y operacion", { x: 0.5, y: 0.8, w: 9, h: 0.28, fontSize: 11, color: "94A3B8", fontFace: "Calibri" });

  var impactos = [
    { num: "13",       label: "módulos",          sub: "en una sola plataforma",          color: C.accent  },
    { num: "100%",     label: "propiedad",         sub: "del código y los datos",          color: C.green   },
    { num: "$45",      label: "USD/mes",           sub: "costo total de operación PRO",    color: C.blue    },
    { num: "0",        label: "licencias",         sub: "anuales de software externo",     color: C.purple  },
    { num: "3x",       label: "más barato",        sub: "que desarrollo en USA/Europa",    color: C.amber   },
    { num: "24/7",     label: "disponible",        sub: "cloud desde cualquier dispositivo",color: "14B8A6" },
  ];

  impactos.forEach(function(item, i) {
    var col = i % 3, row = Math.floor(i / 3);
    var x = 0.38 + col * 3.12, y = 1.2 + row * 2.0;
    s.addShape(pres.shapes.RECTANGLE, { x, y, w: 2.95, h: 1.75, fill: { color: "1E293B" }, line: { color: item.color, width: 0.75 }, shadow: makeShadow() });
    s.addShape(pres.shapes.RECTANGLE, { x, y, w: 2.95, h: 0.08, fill: { color: item.color }, line: { color: item.color } });
    s.addText(item.num, { x, y: y + 0.15, w: 2.95, h: 0.75, fontSize: 44, bold: true, color: item.color, align: "center", fontFace: "Arial Black" });
    s.addText(item.label, { x, y: y + 0.9,  w: 2.95, h: 0.32, fontSize: 13, bold: true, color: C.white, align: "center", fontFace: "Calibri" });
    s.addText(item.sub,   { x, y: y + 1.22, w: 2.95, h: 0.38, fontSize: 8.5, color: "64748B", align: "center", fontFace: "Calibri", italic: true });
  });

  s.addText("Sistema RCMA  ·  Propuesta Ejecutiva  ·  2026", { x: 0, y: 5.35, w: W, h: 0.25, fontSize: 8, color: "334155", align: "center" });
}

// ─────────────────────────────────────────────────────────────────────────────
// SLIDE 6 — ¿QUÉ PASA SI NO LO ADOPTAMOS?
// ─────────────────────────────────────────────────────────────────────────────
{
  const s = pres.addSlide();
  s.background = { color: "1A0000" };

  s.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: W, h: 0.06, fill: { color: C.red }, line: { color: C.red } });
  s.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: 0.06, h: H, fill: { color: C.red }, line: { color: C.red } });

  s.addText("¿Qué Pasa Si No lo Adoptamos?", { x: 0.5, y: 0.22, w: 9, h: 0.55, fontSize: 24, bold: true, color: C.white, fontFace: "Arial Black" });
  s.addText("Los riesgos reales de no contar con una plataforma centralizada", { x: 0.5, y: 0.82, w: 9, h: 0.28, fontSize: 11, color: "FCA5A5", fontFace: "Calibri" });

  var riesgos = [
    {
      num: "01", titulo: "Riesgo de pérdida de información",
      desc: "Sin un sistema centralizado, la información critica vive en computadoras personales. Si alguien del equipo sale, los datos se van con esa persona.",
      icon: "💾",
    },
    {
      num: "02", titulo: "Decisiones sin datos reales",
      desc: "El comité directivo toma decisiones con reportes desactualizados o armados a mano. Sin visibilidad en tiempo real, se aprueban proyectos sin contexto completo.",
      icon: "📉",
    },
    {
      num: "03", titulo: "Costo operativo invisible",
      desc: "Sin control de presupuestos integrado, es imposible saber cuanto se esta gastando realmente por territorio, colegio o tipo de obra en un momento dado.",
      icon: "💸",
    },
    {
      num: "04", titulo: "Ineficiencia que escala",
      desc: "Cada colegio nuevo, cada proyecto adicional multiplica el caos. Lo que hoy toma 2 horas de reporteo, con crecimiento tomara 6. El problema no se resuelve solo.",
      icon: "📈",
    },
  ];

  riesgos.forEach(function(r, i) {
    var y = 1.22 + i * 1.02;
    s.addShape(pres.shapes.RECTANGLE, { x: 0.4, y, w: 9.2, h: 0.88, fill: { color: "2D0000" }, line: { color: "7F1D1D", width: 0.5 } });
    s.addShape(pres.shapes.RECTANGLE, { x: 0.4, y, w: 0.55, h: 0.88, fill: { color: "7F1D1D" }, line: { color: "7F1D1D" } });
    s.addText(r.num, { x: 0.4, y, w: 0.55, h: 0.88, fontSize: 18, bold: true, color: "FCA5A5", align: "center", valign: "middle", fontFace: "Arial Black" });
    s.addText(r.icon + "  " + r.titulo, { x: 1.05, y: y + 0.06, w: 8.4, h: 0.3, fontSize: 11, bold: true, color: C.white, fontFace: "Calibri", margin: 0 });
    s.addText(r.desc, { x: 1.05, y: y + 0.38, w: 8.4, h: 0.44, fontSize: 9, color: "FCA5A5", fontFace: "Calibri", margin: 0 });
  });

  s.addText("Sistema RCMA  ·  Propuesta Ejecutiva  ·  2026", { x: 0, y: 5.35, w: W, h: 0.25, fontSize: 8, color: "7F1D1D", align: "center" });
}

// ─────────────────────────────────────────────────────────────────────────────
// SLIDE 7 — COMPARATIVA COSTO-BENEFICIO
// ─────────────────────────────────────────────────────────────────────────────
{
  const s = pres.addSlide();
  s.background = { color: C.offWhite };

  s.addText("Analisis Costo-Beneficio", { x: 0.4, y: 0.22, w: 9.2, h: 0.55, fontSize: 26, bold: true, color: C.dark, fontFace: "Arial Black" });
  s.addShape(pres.shapes.RECTANGLE, { x: 0.4, y: 0.82, w: 9.2, h: 0.03, fill: { color: C.grayLight }, line: { color: C.grayLight } });

  // Costo de adoptar
  addCard(s, 0.4, 0.95, 4.3, 4.15);
  s.addShape(pres.shapes.RECTANGLE, { x: 0.4, y: 0.95, w: 4.3, h: 0.48, fill: { color: C.green }, line: { color: C.green } });
  s.addText("ADOPTAR EL SISTEMA", { x: 0.5, y: 0.95, w: 4.1, h: 0.48, fontSize: 13, bold: true, color: C.white, align: "center", valign: "middle", fontFace: "Calibri" });

  s.addText("Inversion unica:", { x: 0.6, y: 1.52, w: 2.0, h: 0.3, fontSize: 9, bold: true, color: C.gray, fontFace: "Calibri" });
  s.addText("$0 USD", { x: 2.6, y: 1.52, w: 2.0, h: 0.3, fontSize: 14, bold: true, color: C.green, fontFace: "Arial Black", align: "right" });
  s.addText("(ya desarrollado)", { x: 0.6, y: 1.8, w: 3.9, h: 0.22, fontSize: 8, color: C.gray, fontFace: "Calibri", italic: true });

  s.addShape(pres.shapes.RECTANGLE, { x: 0.55, y: 2.1, w: 3.9, h: 0.02, fill: { color: C.grayLight }, line: { color: C.grayLight } });

  s.addText("Operación mensual:", { x: 0.6, y: 2.2, w: 2.5, h: 0.3, fontSize: 9, bold: true, color: C.gray, fontFace: "Calibri" });
  s.addText("$45 USD", { x: 2.6, y: 2.2, w: 2.0, h: 0.3, fontSize: 14, bold: true, color: C.blue, fontFace: "Arial Black", align: "right" });
  s.addText("~$900 MXN/mes (Vercel Pro + Supabase Pro)", { x: 0.6, y: 2.48, w: 3.9, h: 0.22, fontSize: 7.5, color: C.gray, fontFace: "Calibri", italic: true });

  s.addShape(pres.shapes.RECTANGLE, { x: 0.55, y: 2.78, w: 3.9, h: 0.02, fill: { color: C.grayLight }, line: { color: C.grayLight } });

  var bens = [
    "Centralización total de 13 procesos",
    "Reportes ejecutivos automaticos",
    "Trazabilidad y control de presupuestos",
    "Acceso 24/7 desde cualquier lugar",
    "Notificaciones y confirmaciones auto.",
    "100% propiedad de Colegios Mano Amiga",
  ];
  bens.forEach(function(b, i) {
    s.addShape(pres.shapes.OVAL, { x: 0.6, y: 2.92 + i * 0.35, w: 0.12, h: 0.12, fill: { color: C.green }, line: { color: C.green } });
    s.addText(b, { x: 0.82, y: 2.87 + i * 0.35, w: 3.72, h: 0.3, fontSize: 9.5, color: "166534", fontFace: "Calibri", valign: "middle", margin: 0 });
  });

  // Costo de NO adoptar
  addCard(s, 5.3, 0.95, 4.3, 4.15);
  s.addShape(pres.shapes.RECTANGLE, { x: 5.3, y: 0.95, w: 4.3, h: 0.48, fill: { color: C.red }, line: { color: C.red } });
  s.addText("NO ADOPTAR", { x: 5.4, y: 0.95, w: 4.1, h: 0.48, fontSize: 13, bold: true, color: C.white, align: "center", valign: "middle", fontFace: "Calibri" });

  s.addText("Costo mensual visible:", { x: 5.45, y: 1.52, w: 2.5, h: 0.3, fontSize: 9, bold: true, color: C.gray, fontFace: "Calibri" });
  s.addText("$0 USD", { x: 7.45, y: 1.52, w: 2.0, h: 0.3, fontSize: 14, bold: true, color: C.gray, fontFace: "Arial Black", align: "right" });
  s.addText("(aparentemente gratis)", { x: 5.45, y: 1.8, w: 3.9, h: 0.22, fontSize: 8, color: C.gray, fontFace: "Calibri", italic: true });

  s.addShape(pres.shapes.RECTANGLE, { x: 5.45, y: 2.1, w: 3.9, h: 0.02, fill: { color: C.grayLight }, line: { color: C.grayLight } });

  s.addText("Costo oculto real:", { x: 5.45, y: 2.2, w: 2.5, h: 0.3, fontSize: 9, bold: true, color: C.gray, fontFace: "Calibri" });
  s.addText("ALTO", { x: 7.45, y: 2.2, w: 2.0, h: 0.3, fontSize: 14, bold: true, color: C.red, fontFace: "Arial Black", align: "right" });
  s.addText("Horas perdidas, errores y riesgos no cuantificados", { x: 5.45, y: 2.48, w: 3.9, h: 0.22, fontSize: 7.5, color: C.gray, fontFace: "Calibri", italic: true });

  s.addShape(pres.shapes.RECTANGLE, { x: 5.45, y: 2.78, w: 3.9, h: 0.02, fill: { color: C.grayLight }, line: { color: C.grayLight } });

  var risks = [
    "Informacion dispersa sin centralizar",
    "Reportes manuales consumen tiempo valioso",
    "Sin trazabilidad ni historial de decisiones",
    "Dependencia de archivos personales",
    "Sin control real de presupuestos",
    "Riesgo de pérdida de datos criticos",
  ];
  risks.forEach(function(r, i) {
    s.addShape(pres.shapes.OVAL, { x: 5.45, y: 2.92 + i * 0.35, w: 0.12, h: 0.12, fill: { color: C.red }, line: { color: C.red } });
    s.addText(r, { x: 5.67, y: 2.87 + i * 0.35, w: 3.72, h: 0.3, fontSize: 9.5, color: "991B1B", fontFace: "Calibri", valign: "middle", margin: 0 });
  });

  s.addText("Sistema RCMA  ·  Propuesta Ejecutiva  ·  2026", { x: 0, y: 5.35, w: W, h: 0.25, fontSize: 8, color: "CBD5E1", align: "center" });
}

// ─────────────────────────────────────────────────────────────────────────────
// SLIDE 8 — TESTIMONIAL / CONTEXTO ACTUAL
// ─────────────────────────────────────────────────────────────────────────────
{
  const s = pres.addSlide();
  s.background = { color: C.dark };

  s.addText("Ya Está Funcionando", { x: 0.5, y: 0.22, w: 9, h: 0.55, fontSize: 26, bold: true, color: C.white, fontFace: "Arial Black" });
  s.addText("El sistema no es una propuesta futura — ya existe, ya esta en produccion y ya genera valor", {
    x: 0.5, y: 0.82, w: 9, h: 0.28, fontSize: 11, color: "94A3B8", fontFace: "Calibri",
  });

  var logros = [
    { icon: "✅", text: "Sistema en producción en gestion-rcma-vercel.vercel.app",        color: C.green  },
    { icon: "🎫", text: "19 Tickets TCMM registrados y controlados",                       color: C.red    },
    { icon: "📁", text: "29 Proyectos gestionados con avance en tiempo real",              color: C.blue   },
    { icon: "✅", text: "Checklists de inspección con PDF profesional generado",           color: C.green  },
    { icon: "📧", text: "Notificaciones email via SMTP Outlook institucional activas",     color: C.accent },
    { icon: "📊", text: "Reportes PDF y Matriz Excel listos para el comité directivo",    color: C.purple },
    { icon: "🔐", text: "Control de accesos con permisos granulares por usuario",         color: C.amber  },
    { icon: "📱", text: "Funcional en desktop, tablet y movil — online y offline",        color: "14B8A6" },
  ];

  logros.forEach(function(l, i) {
    var col = i % 2, row = Math.floor(i / 2);
    var x = 0.4 + col * 4.8, y = 1.15 + row * 1.08;
    s.addShape(pres.shapes.RECTANGLE, { x, y, w: 4.55, h: 0.9, fill: { color: "1E293B" }, line: { color: l.color, width: 0.5 }, shadow: makeShadow() });
    s.addShape(pres.shapes.RECTANGLE, { x, y, w: 0.06, h: 0.9, fill: { color: l.color }, line: { color: l.color } });
    s.addText(l.icon, { x: x + 0.12, y, w: 0.55, h: 0.9, fontSize: 20, valign: "middle", align: "center" });
    s.addText(l.text, { x: x + 0.72, y, w: 3.72, h: 0.9, fontSize: 9.5, color: "CBD5E1", fontFace: "Calibri", valign: "middle", margin: 0 });
  });

  s.addText("Sistema RCMA  ·  Propuesta Ejecutiva  ·  2026", { x: 0, y: 5.35, w: W, h: 0.25, fontSize: 8, color: "334155", align: "center" });
}

// ─────────────────────────────────────────────────────────────────────────────
// SLIDE 9 — PLAN DE ADOPCIÓN
// ─────────────────────────────────────────────────────────────────────────────
{
  const s = pres.addSlide();
  s.background = { color: C.offWhite };

  s.addText("Plan de Adopcion", { x: 0.4, y: 0.22, w: 9.2, h: 0.55, fontSize: 26, bold: true, color: C.dark, fontFace: "Arial Black" });
  s.addShape(pres.shapes.RECTANGLE, { x: 0.4, y: 0.82, w: 9.2, h: 0.03, fill: { color: C.grayLight }, line: { color: C.grayLight } });

  var fases = [
    {
      fase: "INMEDIATO",
      sub: "Hoy — Sin costo adicional",
      color: C.green,
      items: ["Sistema ya disponible en produccion", "Capacitacion al equipo de coordinacion", "Migracion de proyectos activos al sistema", "Configuracion de permisos por usuario"],
    },
    {
      fase: "CORTO PLAZO",
      sub: "1-3 meses — $45 USD/mes",
      color: C.blue,
      items: ["Activar plan Pro (Vercel + Supabase)", "Capacitar a ECOs de cada territorio", "Integrar solicitudes de todos los colegios", "Presentar primer reporte al comite"],
    },
    {
      fase: "MEDIANO PLAZO",
      sub: "3-12 meses — Crecimiento",
      color: C.purple,
      items: ["Expansion a todos los territorios", "Nuevos modulos segun necesidades", "Analisis de datos historicos acumulados", "Dashboard personalizado para directivos"],
    },
  ];

  fases.forEach(function(f, i) {
    var x = 0.38 + i * 3.15;
    s.addShape(pres.shapes.RECTANGLE, { x, y: 1.05, w: 2.98, h: 4.2, fill: { color: C.white }, line: { color: f.color, width: 0.75 }, shadow: makeShadow() });
    s.addShape(pres.shapes.RECTANGLE, { x, y: 1.05, w: 2.98, h: 0.65, fill: { color: f.color }, line: { color: f.color } });
    s.addText(f.fase, { x, y: 1.05, w: 2.98, h: 0.38, fontSize: 12, bold: true, color: C.white, align: "center", valign: "middle", fontFace: "Calibri", margin: 0 });
    s.addText(f.sub,  { x, y: 1.43, w: 2.98, h: 0.27, fontSize: 8.5, color: C.white, align: "center", valign: "middle", fontFace: "Calibri", italic: true, margin: 0 });
    f.items.forEach(function(item, j) {
      s.addShape(pres.shapes.RECTANGLE, { x: x + 0.15, y: 1.82 + j * 0.78, w: 2.68, h: 0.6, fill: { color: "F8FAFC" }, line: { color: C.grayLight } });
      s.addShape(pres.shapes.RECTANGLE, { x: x + 0.15, y: 1.82 + j * 0.78, w: 0.06, h: 0.6, fill: { color: f.color }, line: { color: f.color } });
      s.addText(item, { x: x + 0.28, y: 1.82 + j * 0.78, w: 2.5, h: 0.6, fontSize: 8.5, color: C.dark, fontFace: "Calibri", valign: "middle", margin: 0 });
    });
  });

  s.addText("Sistema RCMA  ·  Propuesta Ejecutiva  ·  2026", { x: 0, y: 5.35, w: W, h: 0.25, fontSize: 8, color: "CBD5E1", align: "center" });
}

// ─────────────────────────────────────────────────────────────────────────────
// SLIDE 10 — CIERRE / LLAMADA A LA ACCIÓN
// ─────────────────────────────────────────────────────────────────────────────
{
  const s = pres.addSlide();
  s.background = { color: C.dark };

  s.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: 0.06, h: H, fill: { color: C.green }, line: { color: C.green } });
  s.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: W, h: 0.06, fill: { color: C.green }, line: { color: C.green } });
  s.addShape(pres.shapes.RECTANGLE, { x: 7.2, y: 0, w: 2.8, h: H, fill: { color: "111827" }, line: { color: "111827" } });

  s.addText("La decision es simple", { x: 0.5, y: 0.55, w: 6.4, h: 0.35, fontSize: 14, color: "94A3B8", fontFace: "Calibri" });
  s.addText("Adoptar el Sistema RCMA", { x: 0.5, y: 0.92, w: 6.4, h: 0.75, fontSize: 30, bold: true, color: C.white, fontFace: "Arial Black", valign: "middle" });
  s.addShape(pres.shapes.RECTANGLE, { x: 0.5, y: 1.72, w: 4.0, h: 0.04, fill: { color: C.green }, line: { color: C.green } });

  var acciones = [
    { icon: "✓", text: "Sistema listo — sin tiempo de desarrollo",    color: C.green },
    { icon: "✓", text: "Costo de operacion: $45 USD/mes",             color: C.green },
    { icon: "✓", text: "Codigo 100% propiedad de la organizacion",    color: C.green },
    { icon: "✓", text: "Capacitacion y soporte incluidos",            color: C.green },
  ];
  acciones.forEach(function(a, i) {
    s.addShape(pres.shapes.RECTANGLE, { x: 0.5, y: 1.88 + i * 0.58, w: 0.28, h: 0.28, fill: { color: C.green }, line: { color: C.green } });
    s.addText(a.icon, { x: 0.5, y: 1.88 + i * 0.58, w: 0.28, h: 0.28, fontSize: 11, bold: true, color: C.white, align: "center", valign: "middle", margin: 0 });
    s.addText(a.text, { x: 0.88, y: 1.88 + i * 0.58, w: 5.7, h: 0.42, fontSize: 12, color: "CBD5E1", fontFace: "Calibri", valign: "middle", margin: 0 });
  });

  // Dato derecha
  s.addText("$45", { x: 7.4, y: 0.9, w: 2.3, h: 0.9, fontSize: 64, bold: true, color: C.green, align: "center", fontFace: "Arial Black" });
  s.addText("USD / mes", { x: 7.4, y: 1.75, w: 2.3, h: 0.3, fontSize: 11, color: "94A3B8", align: "center", fontFace: "Calibri" });
  s.addShape(pres.shapes.RECTANGLE, { x: 7.5, y: 2.18, w: 2.1, h: 0.03, fill: { color: "334155" }, line: { color: "334155" } });
  s.addText("vs costo oculto", { x: 7.3, y: 2.28, w: 2.5, h: 0.28, fontSize: 9, color: "475569", align: "center", fontFace: "Calibri", italic: true });
  s.addText("de NO tenerlo", { x: 7.3, y: 2.52, w: 2.5, h: 0.28, fontSize: 9, bold: true, color: C.red, align: "center", fontFace: "Calibri" });

  s.addText("Ricardo Joanathan Reyes Medina", { x: 0.5, y: 4.92, w: 6.4, h: 0.25, fontSize: 10, bold: true, color: C.white, fontFace: "Calibri" });
  s.addText("rreyes@manoamiga.edu.mx  ·  gestion-rcma-vercel.vercel.app", { x: 0.5, y: 5.18, w: 6.4, h: 0.25, fontSize: 9, color: "64748B", fontFace: "Calibri" });
}

// ─────────────────────────────────────────────────────────────────────────────
pres.writeFile({ fileName: "Sistema_RCMA_Propuesta_Ejecutiva_2026.pptx" })
  .then(function() { console.log("✅  Sistema_RCMA_Propuesta_Ejecutiva_2026.pptx generado correctamente"); })
  .catch(function(err) { console.error("❌  Error:", err); });
