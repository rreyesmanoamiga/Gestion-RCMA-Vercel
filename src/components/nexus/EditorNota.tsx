// Editor de Notas NEXUS: formato (fuente, tamaño, color, listas, casillas) y
// etiquetas por renglón al estilo OneNote. La nota se guarda como HTML en el
// mismo campo `contenido`; las notas viejas en texto plano se siguen leyendo.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';
import DOMPurify from 'dompurify';
import { Tag, X } from 'lucide-react';

export const ETIQUETAS_NOTA = [
  { emoji: '⭐', label: 'Importante' },
  { emoji: '❗', label: 'Crítico' },
  { emoji: '❓', label: 'Pregunta' },
  { emoji: '💡', label: 'Idea' },
  { emoji: '📞', label: 'Llamar / devolver llamada' },
  { emoji: '📅', label: 'Programar reunión' },
  { emoji: '👔', label: 'Hablar con el jefe' },
  { emoji: '✉️', label: 'Enviar por correo' },
  { emoji: '💲', label: 'Costo / presupuesto' },
  { emoji: '📍', label: 'Visita a sitio' },
] as const;

const TOOLBAR_ID = 'nexus-nota-toolbar';
const FORMATOS = ['font', 'size', 'bold', 'italic', 'underline', 'strike', 'color', 'background', 'list', 'align', 'link'];

const esHTML = (s: string) => /<\/?[a-z][\s\S]*>/i.test(s);
const escapar = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Texto plano viejo → párrafos para el editor */
function aHTML(contenido: string) {
  if (!contenido) return '';
  if (esHTML(contenido)) return contenido;
  return contenido.split('\n').map(l => `<p>${l ? escapar(l) : '<br>'}</p>`).join('');
}

/** Texto de la nota sin formato (resumen de la tarjeta y búsqueda) */
export function textoNota(contenido: string | null | undefined): string {
  if (!contenido) return '';
  if (!esHTML(contenido)) return contenido;
  const conSaltos = contenido.replace(/<\/(p|li|h[1-6])>/gi, '$&\n').replace(/<br\s*\/?>/gi, '\n');
  const doc = new DOMParser().parseFromString(conSaltos, 'text/html');
  return (doc.body.textContent ?? '').replace(/\n{3,}/g, '\n\n').trim();
}

/** Nota con su formato, en solo lectura (contenido limpio con DOMPurify) */
export function VistaNota({ contenido }: { contenido: string }) {
  const html = useMemo(() => DOMPurify.sanitize(aHTML(contenido)), [contenido]);
  if (!textoNota(contenido)) return <span className="text-slate-400 italic">Sin contenido</span>;
  return (
    <div className="ql-snow">
      <div className="ql-editor" style={{ padding: 0, height: 'auto', fontSize: 14, fontFamily: 'inherit' }} dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}

// Textos de la barra en español (Quill los trae en inglés)
const ESTILOS = `
.nexus-nota .ql-toolbar.ql-snow{border:1px solid #cbd5e1;border-radius:8px 8px 0 0;background:#f8fafc;font-family:inherit;position:relative}
.nexus-nota .ql-container.ql-snow{height:auto;border:1px solid #cbd5e1;border-top:0;border-radius:0 0 8px 8px;font-size:14px;font-family:inherit}
.nexus-nota .ql-editor{height:auto;min-height:var(--nota-alto,220px);max-height:60vh;overflow-y:auto}
.nexus-nota .ql-editor.ql-blank::before{font-style:normal;color:#94a3b8}
.nexus-nota.ql-snow .ql-editor{font-size:14px;color:#334155;font-family:inherit}
.nexus-nota .ql-snow .ql-picker.ql-font .ql-picker-label::before,.nexus-nota .ql-snow .ql-picker.ql-font .ql-picker-item::before{content:'Normal'}
.nexus-nota .ql-snow .ql-picker.ql-font .ql-picker-label[data-value=serif]::before,.nexus-nota .ql-snow .ql-picker.ql-font .ql-picker-item[data-value=serif]::before{content:'Serif'}
.nexus-nota .ql-snow .ql-picker.ql-font .ql-picker-label[data-value=monospace]::before,.nexus-nota .ql-snow .ql-picker.ql-font .ql-picker-item[data-value=monospace]::before{content:'Monoespaciada'}
.nexus-nota .ql-snow .ql-picker.ql-size .ql-picker-label::before,.nexus-nota .ql-snow .ql-picker.ql-size .ql-picker-item::before{content:'Normal'}
.nexus-nota .ql-snow .ql-picker.ql-size .ql-picker-label[data-value=small]::before,.nexus-nota .ql-snow .ql-picker.ql-size .ql-picker-item[data-value=small]::before{content:'Pequeña'}
.nexus-nota .ql-snow .ql-picker.ql-size .ql-picker-label[data-value=large]::before,.nexus-nota .ql-snow .ql-picker.ql-size .ql-picker-item[data-value=large]::before{content:'Grande'}
.nexus-nota .ql-snow .ql-picker.ql-size .ql-picker-label[data-value=huge]::before,.nexus-nota .ql-snow .ql-picker.ql-size .ql-picker-item[data-value=huge]::before{content:'Muy grande'}
.nexus-nota .ql-snow .ql-picker.ql-font{width:118px}.nexus-nota .ql-snow .ql-picker.ql-size{width:92px}
.nexus-nota .ql-snow .ql-tooltip{z-index:20}
.nexus-nota .ql-snow .ql-tooltip::before{content:'Abrir:'}
.nexus-nota .ql-snow .ql-tooltip[data-mode=link]::before{content:'Enlace:'}
.nexus-nota .ql-snow .ql-tooltip a.ql-action::after{content:'Editar'}
.nexus-nota .ql-snow .ql-tooltip.ql-editing a.ql-action::after{content:'Guardar'}
.nexus-nota .ql-snow .ql-tooltip a.ql-remove::before{content:'Quitar'}
`;

export default function EditorNota({ value, onChange, placeholder, alto }: { value: string; onChange: (html: string) => void; placeholder?: string; alto?: string }) {
  const ref = useRef<ReactQuill>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menu, setMenu] = useState(false);
  const inicial = useMemo(() => aHTML(value), []); // eslint-disable-line react-hooks/exhaustive-deps

  const modules = useMemo(() => ({ toolbar: { container: `#${TOOLBAR_ID}` } }), []);

  useEffect(() => {
    if (!menu) return;
    const cerrar = (e: MouseEvent) => { if (!menuRef.current?.contains(e.target as Node)) setMenu(false); };
    document.addEventListener('mousedown', cerrar);
    return () => document.removeEventListener('mousedown', cerrar);
  }, [menu]);

  /** Pone (o quita) la etiqueta al inicio del renglón donde está el cursor */
  const etiquetar = (emoji: string | null) => {
    const q = ref.current?.getEditor();
    if (!q) return;
    const sel = q.getSelection(true);
    const [, offset] = q.getLine(sel.index);
    const inicio = sel.index - offset;
    const actual = ETIQUETAS_NOTA.find(t => q.getText(inicio, t.emoji.length + 1) === t.emoji + ' ');
    let cursor = sel.index;
    if (actual) { q.deleteText(inicio, actual.emoji.length + 1, 'user'); cursor -= actual.emoji.length + 1; }
    if (emoji) { q.insertText(inicio, emoji + ' ', 'user'); cursor += emoji.length + 1; }
    q.setSelection(Math.max(inicio, cursor), 0, 'user');
    setMenu(false);
  };

  return (
    <div className="nexus-nota" style={alto ? ({ '--nota-alto': alto } as React.CSSProperties) : undefined}>
      <style>{ESTILOS}</style>
      <div id={TOOLBAR_ID}>
        <span className="ql-formats">
          <select className="ql-font" defaultValue=""><option value="" /><option value="serif" /><option value="monospace" /></select>
          <select className="ql-size" defaultValue=""><option value="small" /><option value="" /><option value="large" /><option value="huge" /></select>
        </span>
        <span className="ql-formats">
          <button type="button" className="ql-bold" title="Negritas" />
          <button type="button" className="ql-italic" title="Cursiva" />
          <button type="button" className="ql-underline" title="Subrayado" />
          <button type="button" className="ql-strike" title="Tachado" />
        </span>
        <span className="ql-formats">
          <select className="ql-color" title="Color de letra" />
          <select className="ql-background" title="Resaltar" />
        </span>
        <span className="ql-formats">
          <button type="button" className="ql-list" value="ordered" title="Lista numerada" />
          <button type="button" className="ql-list" value="bullet" title="Viñetas" />
          <button type="button" className="ql-list" value="check" title="Tareas (casillas)" />
          <select className="ql-align" title="Alinear" />
        </span>
        <span className="ql-formats">
          <button type="button" className="ql-link" title="Enlace" />
          <button type="button" className="ql-clean" title="Quitar formato" />
        </span>
        <span className="ql-formats" style={{ float: 'right', marginRight: 0 }}>
          <div ref={menuRef} className="relative inline-block">
            <div role="button" tabIndex={0} onMouseDown={e => e.preventDefault()} onClick={() => setMenu(m => !m)}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:border-slate-400 cursor-pointer select-none"
              title="Etiquetas">
              <Tag className="w-3.5 h-3.5" /> Etiquetas
            </div>
            {menu && (
              <div className="absolute right-0 top-full mt-1 w-60 bg-white border border-slate-200 rounded-xl shadow-xl p-1.5 z-30 text-left">
                <p className="px-2 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wide">Etiqueta en el renglón</p>
                {ETIQUETAS_NOTA.map(t => (
                  <div key={t.emoji} role="button" tabIndex={0} onMouseDown={e => e.preventDefault()} onClick={() => etiquetar(t.emoji)}
                    className="flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-slate-700 hover:bg-slate-100 cursor-pointer select-none">
                    <span className="w-5 text-center">{t.emoji}</span>{t.label}
                  </div>
                ))}
                <div role="button" tabIndex={0} onMouseDown={e => e.preventDefault()} onClick={() => etiquetar(null)}
                  className="flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-slate-400 hover:bg-slate-100 border-t border-slate-100 mt-1 cursor-pointer select-none">
                  <span className="w-5 flex justify-center"><X className="w-4 h-4" /></span>Quitar etiqueta
                </div>
              </div>
            )}
          </div>
        </span>
      </div>
      <ReactQuill ref={ref} theme="snow" defaultValue={inicial} modules={modules} formats={FORMATOS}
        placeholder={placeholder}
        onChange={(html, _d, _s, editor) => onChange(editor.getText().trim() ? html : '')} />
    </div>
  );
}
