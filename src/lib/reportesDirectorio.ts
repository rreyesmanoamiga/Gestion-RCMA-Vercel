import ExcelJS from 'exceljs';
import type { DirectorioColegio } from '@/lib/directorio';

// ─── Colores institucionales (mismos que el resto del sistema) ────────────
const NAVY   = 'FF00295A';
const ORANGE = 'FFED7102';
const SKY    = 'FF4F82C2';
const WHITE  = 'FFFFFFFF';

async function cargarLogoBuffer(): Promise<ArrayBuffer | null> {
  try {
    const res = await fetch('/logo.png');
    if (!res.ok) return null;
    return await res.arrayBuffer();
  } catch { return null; }
}

// ============================================================================
// EXCEL — Matriz completa de Directorio, un colegio por fila, agrupado por
// bloques de columnas (Identificación / Director / Administrador / CAR /
// ECO / Jurídico / Fiscal / Roles Federación).
// ============================================================================
export async function generarExcelDirectorio(colegios: DirectorioColegio[]) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Sistema RCMA';
  wb.created = new Date();

  const logoBuffer = await cargarLogoBuffer();
  const logoId = logoBuffer ? wb.addImage({ buffer: logoBuffer as any, extension: 'png' }) : null;

  const thinBorder = { style: 'thin' as const, color: { argb: 'FFD7DCE1' } };
  const borderAll = { top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder };

  // ── Grupos de columnas (encabezado de grupo + encabezado de campo) ──────
  const grupos: { titulo: string; color: string; campos: { label: string; key: keyof DirectorioColegio; width: number }[] }[] = [
    {
      titulo: 'IDENTIFICACIÓN', color: NAVY, campos: [
        { label: 'Código',            key: 'codigo',         width: 12 },
        { label: 'Nombre',            key: 'nombre',         width: 26 },
        { label: 'Nombre Oficial',    key: 'nombre_oficial', width: 34 },
        { label: 'Territorio',        key: 'territorio',     width: 12 },
        { label: 'RFC',               key: 'rfc',            width: 16 },
        { label: 'Teléfonos',         key: 'telefonos',      width: 16 },
        { label: 'Dirección Física',  key: 'dir_fisica',     width: 34 },
        { label: 'Dirección Fiscal',  key: 'dir_fiscal',     width: 34 },
      ],
    },
    {
      titulo: 'DIRECTOR', color: SKY, campos: [
        { label: 'Nombre',      key: 'dir_nombre',     width: 26 },
        { label: 'Correo',      key: 'dir_correo',     width: 26 },
        { label: 'Tel. Móvil',  key: 'dir_tel_movil',  width: 15 },
        { label: 'Tel. Fijo',   key: 'dir_tel_red',    width: 15 },
      ],
    },
    {
      titulo: 'ADMINISTRADOR', color: SKY, campos: [
        { label: 'Nombre',      key: 'adm_nombre',     width: 26 },
        { label: 'Correo',      key: 'adm_correo',     width: 26 },
        { label: 'Tel. Móvil',  key: 'adm_tel_movil',  width: 15 },
        { label: 'Tel. Fijo',   key: 'adm_tel_red',    width: 15 },
      ],
    },
    {
      titulo: 'CAR', color: ORANGE, campos: [
        { label: 'Nombre',      key: 'car_nombre',     width: 26 },
        { label: 'Correo',      key: 'car_correo',     width: 26 },
        { label: 'Tel. Móvil',  key: 'car_tel_movil',  width: 15 },
      ],
    },
    {
      titulo: 'GERENTE ECO', color: NAVY, campos: [
        { label: 'Nombre',      key: 'geo_nombre',     width: 26 },
        { label: 'Correo',      key: 'geo_correo',     width: 26 },
        { label: 'Tel. Móvil',  key: 'geo_tel_movil',  width: 15 },
      ],
    },
    {
      titulo: 'LÍDER DE PROYECTO ECO', color: NAVY, campos: [
        { label: 'Nombre',      key: 'leo_nombre',     width: 26 },
        { label: 'Correo',      key: 'leo_correo',     width: 26 },
        { label: 'Tel. Móvil',  key: 'leo_tel_movil',  width: 15 },
      ],
    },
    {
      titulo: 'GERENTE JURÍDICO OR-SER', color: SKY, campos: [
        { label: 'Nombre',      key: 'gjo_nombre',     width: 26 },
        { label: 'Correo',      key: 'gjo_correo',     width: 26 },
        { label: 'Tel. Móvil',  key: 'gjo_tel_movil',  width: 15 },
      ],
    },
    {
      titulo: 'LÍDER JURÍDICO OR-SER', color: SKY, campos: [
        { label: 'Nombre',      key: 'ljo_nombre',     width: 26 },
        { label: 'Correo',      key: 'ljo_correo',     width: 26 },
        { label: 'Tel. Móvil',  key: 'ljo_tel_movil',  width: 15 },
      ],
    },
    {
      titulo: 'DATOS FISCALES', color: ORANGE, campos: [
        { label: 'Sociedad',           key: 'sociedad',         width: 12 },
        { label: 'Centro Gestor',      key: 'centro_gestor',    width: 14 },
        { label: 'Contador',           key: 'contador_nombre',  width: 24 },
        { label: 'Correo Contador',    key: 'contador_correo',  width: 26 },
      ],
    },
    {
      titulo: 'ROLES FEDERACIÓN (solo fila GENERAL)', color: ORANGE, campos: [
        { label: 'Gerente',                    key: 'gerente_nombre',                 width: 26 },
        { label: 'Correo Gerente',              key: 'gerente_correo',                 width: 26 },
        { label: 'Director Nacional',           key: 'director_nacional_nombre',       width: 26 },
        { label: 'Correo Director Nacional',    key: 'director_nacional_correo',       width: 26 },
      ],
    },
  ];

  const camposFlat = grupos.flatMap(g => g.campos);
  const ultimaCol = camposFlat.length;

  const ws = wb.addWorksheet('Matriz Directorio');
  ws.views = [{ showGridLines: false, state: 'frozen', xSplit: 2, ySplit: 8 }];
  camposFlat.forEach((f, i) => ws.getColumn(i + 1).width = f.width);

  // ── Encabezado institucional (logo + título) ──
  ws.getRow(1).height = 34;
  ws.getRow(2).height = 20;
  ws.getRow(3).height = 6;
  if (logoId !== null) ws.addImage(logoId, { tl: { col: 0, row: 0 }, ext: { width: 70, height: 42 } });

  ws.mergeCells(1, 4, 1, ultimaCol);
  const t1 = ws.getCell(1, 4);
  t1.value = 'COLEGIOS MANO AMIGA — MATRIZ DE DIRECTORIO';
  t1.font = { bold: true, size: 13, color: { argb: NAVY }, name: 'Calibri' };
  t1.alignment = { vertical: 'middle' };

  ws.mergeCells(2, 4, 2, ultimaCol);
  const t2 = ws.getCell(2, 4);
  t2.value = `Generado: ${new Date().toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })}   |   ${colegios.length} registros`;
  t2.font = { bold: true, size: 10, color: { argb: ORANGE }, name: 'Calibri' };
  t2.alignment = { vertical: 'middle' };

  ws.mergeCells(3, 1, 3, ultimaCol);
  for (let c = 1; c <= ultimaCol; c++) ws.getCell(3, c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ORANGE } };

  // ── Fila 5: nombre del grupo (mergeado sobre sus columnas) ──
  const filaGrupo = 5;
  let colCursor = 1;
  grupos.forEach(g => {
    const inicio = colCursor;
    const fin = colCursor + g.campos.length - 1;
    if (fin > inicio) ws.mergeCells(filaGrupo, inicio, filaGrupo, fin);
    const cell = ws.getCell(filaGrupo, inicio);
    cell.value = g.titulo;
    cell.font = { bold: true, size: 9, color: { argb: WHITE }, name: 'Calibri' };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: g.color } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    for (let c = inicio; c <= fin; c++) ws.getCell(filaGrupo, c).border = borderAll;
    colCursor = fin + 1;
  });
  ws.getRow(filaGrupo).height = 18;

  // ── Fila 6: nombre del campo ──
  const filaCampo = 6;
  camposFlat.forEach((f, i) => {
    const cell = ws.getCell(filaCampo, i + 1);
    cell.value = f.label;
    cell.font = { bold: true, size: 9, color: { argb: 'FF1E293B' }, name: 'Calibri' };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEAF1FB' } };
    cell.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
    cell.border = borderAll;
  });
  ws.getRow(filaCampo).height = 18;

  // ── Filas de datos: un colegio por fila ──
  const ordenados = [...colegios].sort((a, b) => {
    // GENERAL al final, el resto alfabético por nombre
    if (a.codigo === 'GENERAL') return 1;
    if (b.codigo === 'GENERAL') return -1;
    return a.nombre.localeCompare(b.nombre);
  });

  let fr = filaCampo + 1;
  ordenados.forEach((c, i) => {
    if (i % 2 === 1) for (let ci = 1; ci <= ultimaCol; ci++) ws.getCell(fr, ci).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
    camposFlat.forEach((f, ci) => {
      const cell = ws.getCell(fr, ci + 1);
      const raw = c[f.key];
      cell.value = (raw === null || raw === undefined || raw === '') ? '—' : (raw as string);
      cell.font = { size: 9.5, name: 'Calibri', color: { argb: 'FF1E293B' } };
      cell.alignment = { horizontal: 'left', vertical: 'middle', indent: 1, wrapText: false };
      cell.border = borderAll;
    });
    fr++;
  });

  ws.getRow(4).height = 4; // separador visual delgado entre franja naranja y grupos

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Directorio_Matriz_${new Date().toISOString().slice(0, 10)}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
