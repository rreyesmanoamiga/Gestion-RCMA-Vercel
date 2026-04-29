import React, { useMemo } from 'react';
import { db } from '@/lib/db';
import { supabase } from '@/lib/supabaseClient';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart3, Download, FileSpreadsheet, FileText,
  PieChart, Filter, TrendingUp, ClockAlert,
} from 'lucide-react';
import PageHeader from '@/components/shared/PageHeader';

const btnOutline = "flex items-center gap-2 px-4 py-2.5 border border-slate-300 rounded-lg text-sm font-bold text-slate-700 hover:bg-slate-50 transition-all shadow-sm disabled:opacity-40 disabled:cursor-not-allowed";
const cardClass  = "bg-white p-6 rounded-xl border border-slate-200 shadow-sm";

interface Project  { id: string; name?: string; status?: string; progress?: number; territorio?: string; }
interface Solicitud { id: string; nombre_centro?: string; nombre_proyecto?: string; estatus?: string; created_at?: string; }
interface Ticket   { id: string; folio?: string; territorio?: string; proyecto_id?: string; }
interface Stats    { total: number; completed: number; avgProgress: number; }

async function loadJsPDF(): Promise<typeof import('jspdf').jsPDF> {
  const w = window as Window & { jspdf?: { jsPDF: typeof import('jspdf').jsPDF } };
  if (w.jspdf?.jsPDF) return w.jspdf.jsPDF;
  await new Promise<void>((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
    s.onload = () => resolve(); s.onerror = () => reject(new Error('jsPDF load error'));
    document.head.appendChild(s);
  });
  return w.jspdf!.jsPDF;
}

function drawBar(
  doc: InstanceType<typeof import('jspdf').jsPDF>,
  x: number, y: number, bw: number,
  active: number, completed: number, label: string,
) {
  const total = active + completed;
  const maxH = 20; const bw2 = Math.floor((bw - 6) / 2); const base = y + maxH;
  const hA = total > 0 ? Math.max(2, Math.round((active    / total) * maxH)) : 0;
  const hC = total > 0 ? Math.max(2, Math.round((completed / total) * maxH)) : 0;
  if (hA > 0) {
    doc.setFillColor(59, 130, 246); doc.rect(x, base - hA, bw2, hA, 'F');
    doc.setFontSize(6.5); doc.setFont('helvetica','bold'); doc.setTextColor(30,30,30);
    doc.text(String(active), x + bw2/2, base - hA - 1.5, { align:'center' });
  }
  if (hC > 0) {
    doc.setFillColor(34, 197, 94); doc.rect(x + bw2 + 3, base - hC, bw2, hC, 'F');
    doc.setFontSize(6.5); doc.setFont('helvetica','bold'); doc.setTextColor(30,30,30);
    doc.text(String(completed), x + bw2 + 3 + bw2/2, base - hC - 1.5, { align:'center' });
  }
  doc.setDrawColor(210,210,210); doc.line(x-1, base+0.5, x+bw, base+0.5);
  doc.setFontSize(6.5); doc.setFont('helvetica','normal'); doc.setTextColor(80,80,80);
  doc.text(label.length > 11 ? label.slice(0,9)+'\u2026' : label, x+bw/2, base+5, { align:'center' });
}

async function exportResumenPDF({ stats, projects, checklists, solicitudes, tickets }: {
  stats: Stats; projects: Project[]; checklists: unknown[];
  solicitudes: Solicitud[]; tickets: Ticket[];
}): Promise<void> {
  const JsPDF = await loadJsPDF();
  const doc = new JsPDF({ orientation:'portrait', unit:'mm', format:'a4' });
  const now = new Date().toLocaleDateString('es-MX', { year:'numeric', month:'long', day:'numeric' });
  const W = 210; let y = 20;

  const line = (text: string, size=10, bold=false, color:[number,number,number]=[30,30,30]) => {
    doc.setFontSize(size); doc.setFont('helvetica', bold?'bold':'normal');
    doc.setTextColor(...color); doc.text(text, 20, y); y += size*0.5+2;
  };
  const divider = () => { doc.setDrawColor(220,220,220); doc.line(20,y,W-20,y); y+=6; };

  // Encabezado
  doc.setFillColor(15,23,42); doc.rect(0,0,W,28,'F');
  doc.setFontSize(16); doc.setFont('helvetica','bold'); doc.setTextColor(255,255,255);
  doc.text('Reporte General \u2014 Colegios Mano Amiga', 20, 13);
  doc.setFontSize(9); doc.setFont('helvetica','normal'); doc.setTextColor(180,180,200);
  doc.text('Generado el ' + now, 20, 22);
  try {
    const logoImg = await new Promise<string>((res,rej) => {
      const img = new Image(); img.crossOrigin='anonymous';
      img.onload = () => { const c=document.createElement('canvas'); c.width=img.width; c.height=img.height; c.getContext('2d')!.drawImage(img,0,0); res(c.toDataURL('image/png')); };
      img.onerror=rej; img.src='/logo.png';
    });
    doc.addImage(logoImg,'PNG',W-38,2,24,24);
  } catch { /* sin logo */ }
  y = 40;

  // Resumen ejecutivo
  const active = projects.filter(p => p.status !== 'completado' && p.status !== 'cancelado');
  const avgA = active.length > 0 ? Math.round(active.reduce((a,p)=>a+(p.progress||0),0)/active.length) : 0;
  line('Resumen Ejecutivo', 13, true); y+=2; divider();
  line('Proyectos totales:         ' + stats.total);
  line('Proyectos activos:         ' + active.length);
  line('Proyectos completados:     ' + stats.completed);
  line('Avance promedio (activos): ' + avgA + '%');
  line('Inspecciones realizadas:   ' + checklists.length);
  line('Solicitudes recibidas:     ' + solicitudes.length);
  line('Tickets TCMM:              ' + tickets.length);
  y+=4;

  // Barras por territorio
  if (y > 200) { doc.addPage(); y=20; }
  line('Proyectos por Territorio', 13, true); y+=2; divider();
  doc.setFillColor(59,130,246); doc.rect(20,y-3,5,5,'F');
  doc.setFontSize(7.5); doc.setFont('helvetica','normal'); doc.setTextColor(50,50,50);
  doc.text('Activos', 27, y);
  doc.setFillColor(34,197,94); doc.rect(58,y-3,5,5,'F');
  doc.text('Completados', 65, y);
  y+=10;
  const ters = Array.from(new Set(projects.map(p=>p.territorio||'Sin territorio'))).sort();
  const COLS=4; const bw=(W-40)/COLS; const rowH=38; let col=0; let ry=y;
  ters.forEach(ter => {
    const tp=projects.filter(p=>(p.territorio||'Sin territorio')===ter);
    drawBar(doc, 20+col*bw, ry, bw-4,
      tp.filter(p=>p.status!=='completado'&&p.status!=='cancelado').length,
      tp.filter(p=>p.status==='completado').length, ter);
    col++; if(col>=COLS){col=0;ry+=rowH;if(ry+rowH>270){doc.addPage();ry=20;}}
  });
  y = ry + (col>0?rowH:0) + 6;
  if (y>250) { doc.addPage(); y=20; }

  // Tabla proyectos activos
  y+=4; line('Detalle de Proyectos Activos', 13, true); y+=2; divider();
  const pC = { n:20, s:110, p:150, t:170 };
  doc.setFillColor(241,245,249); doc.rect(18,y-4,W-36,8,'F');
  doc.setFontSize(8); doc.setFont('helvetica','bold'); doc.setTextColor(100,116,139);
  doc.text('Proyecto',pC.n,y); doc.text('Estado',pC.s,y); doc.text('Avance',pC.p,y); doc.text('Territorio',pC.t,y);
  y+=6; divider();
  doc.setFont('helvetica','normal'); doc.setTextColor(30,30,30);
  active.slice(0,40).forEach((p,i) => {
    if(y>270){doc.addPage();y=20;}
    if(i%2===0){doc.setFillColor(248,250,252);doc.rect(18,y-4,W-36,7,'F');}
    doc.setFontSize(8);
    doc.text(p.name&&p.name.length>45?p.name.slice(0,42)+'\u2026':(p.name||'\u2014'),pC.n,y);
    doc.text(p.status||'\u2014',pC.s,y);
    doc.text((p.progress||0)+'%',pC.p,y);
    doc.text(p.territorio||'\u2014',pC.t,y);
    y+=7;
  });
  if(active.length>40){y+=2;doc.setFontSize(8);doc.setTextColor(100,116,139);doc.text('... y '+(active.length-40)+' proyectos m\u00e1s.',20,y);y+=6;}

  // Tabla tickets por territorio
  if(y>230){doc.addPage();y=20;} y+=4;
  line('Tickets TCMM por Territorio', 13, true); y+=2; divider();
  const tTers = Array.from(new Set(tickets.map(t=>t.territorio||'Sin territorio'))).sort();
  doc.setFillColor(241,245,249); doc.rect(18,y-4,W-36,8,'F');
  doc.setFontSize(8); doc.setFont('helvetica','bold'); doc.setTextColor(100,116,139);
  doc.text('Territorio', 20, y); doc.text('Tickets TCMM', W-20, y, {align:'right'});
  y+=6; divider();
  doc.setFont('helvetica','normal'); doc.setTextColor(30,30,30);
  tTers.forEach((ter,i) => {
    if(y>270){doc.addPage();y=20;}
    if(i%2===0){doc.setFillColor(248,250,252);doc.rect(18,y-4,W-36,7,'F');}
    doc.setFontSize(8);
    doc.text(ter.length>50?ter.slice(0,47)+'\u2026':ter, 20, y);
    doc.text(String(tickets.filter(t=>(t.territorio||'Sin territorio')===ter).length), W-20, y, {align:'right'});
    y+=7;
  });
  y+=2;
  doc.setFillColor(15,23,42); doc.rect(18,y-4,W-36,8,'F');
  doc.setFontSize(8); doc.setFont('helvetica','bold'); doc.setTextColor(255,255,255);
  doc.text('TOTAL', 20, y); doc.text(String(tickets.length), W-20, y, {align:'right'});
  y+=10;
  doc.setFontSize(7.5); doc.setFont('helvetica','italic'); doc.setTextColor(100,116,139);
  const nota = 'Solicitudes recibidas (total): ' + solicitudes.length + '. Las solicitudes no registran territorio, por lo que se muestran solo como total global.';
  const nl = doc.splitTextToSize(nota, W-40);
  doc.text(nl, 20, y); y += nl.length*5;

  // Pie de pagina
  const pages = doc.getNumberOfPages();
  for(let i=1;i<=pages;i++){
    doc.setPage(i); doc.setFontSize(7); doc.setTextColor(160,160,160);
    doc.text('Sistema RCMA Cloud \u2014 P\u00e1gina '+i+' de '+pages, 20, 290);
    doc.text('Documento confidencial', W-20, 290, {align:'right'});
  }
  doc.save('reporte-mano-amiga-'+Date.now()+'.pdf');
}

export default function Reports() {
  const { data: rawProjects   = [] } = useQuery({ queryKey:['projects'],   queryFn:()=>db.Project.list('-created_at',500) });
  const { data: rawChecklists = [] } = useQuery({ queryKey:['checklists'], queryFn:()=>db.Checklist.list('-created_at',500) });
  const { data: rawSolicitudes = [] } = useQuery({
    queryKey: ['solicitudes'],
    queryFn: async () => {
      const { data, error } = await supabase.from('solicitudes').select('id,nombre_centro,nombre_proyecto,estatus,created_at').order('created_at',{ascending:false}).limit(500);
      if(error) throw error; return data??[];
    },
  });
  const { data: rawTickets = [] } = useQuery({
    queryKey: ['tickets'],
    queryFn: async () => {
      const { data, error } = await supabase.from('tickets').select('id,folio,territorio,proyecto_id').order('created_at',{ascending:false}).limit(500);
      if(error) throw error; return data??[];
    },
  });

  const projects    = rawProjects    as unknown as Project[];
  const checklists  = rawChecklists  as unknown[];
  const solicitudes = rawSolicitudes as unknown as Solicitud[];
  const tickets     = rawTickets     as unknown as Ticket[];

  const stats = useMemo(():Stats => ({
    total:       projects.length,
    completed:   projects.filter(p=>p.status==='completado').length,
    avgProgress: projects.length>0 ? Math.round(projects.reduce((a,p)=>a+(p.progress||0),0)/projects.length) : 0,
  }),[projects]);

  const activeProjects = useMemo(()=>projects.filter(p=>p.status!=='completado'&&p.status!=='cancelado'),[projects]);

  const terData = useMemo(()=>{
    const t = Array.from(new Set(tickets.map(t=>t.territorio||'Sin territorio'))).sort();
    return t.map(ter=>({ territorio:ter, count:tickets.filter(t=>(t.territorio||'Sin territorio')===ter).length }));
  },[tickets]);

  const handleExportPDF = () => exportResumenPDF({stats,projects,checklists,solicitudes,tickets}).catch(e=>console.error('Error generando PDF:',e));

  return (
    <div className="space-y-6 max-w-7xl mx-auto p-4">
      <PageHeader title="Reportes y Estadísticas" subtitle="Análisis de avance del Proyecto Levantamiento y mantenimiento" />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className={`${cardClass} border-l-4 border-l-slate-900`}>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Proyectos Activos</p>
          <div className="flex items-center justify-between">
            <h3 className="text-3xl font-black text-slate-900">{activeProjects.length}</h3>
            <BarChart3 className="w-8 h-8 text-slate-100" />
          </div>
          <p className="text-xs text-slate-400 mt-1">{stats.completed} completados · {stats.total} total</p>
        </div>
        <div className={`${cardClass} border-l-4 border-l-blue-600`}>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Avance General</p>
          <div className="flex items-center justify-between">
            <h3 className="text-3xl font-black text-slate-900">{stats.avgProgress}%</h3>
            <TrendingUp className="w-8 h-8 text-blue-50" />
          </div>
        </div>
        <div className={`${cardClass} border-l-4 border-l-green-500`}>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Inspecciones</p>
          <div className="flex items-center justify-between">
            <h3 className="text-3xl font-black text-slate-900">{checklists.length}</h3>
            <FileText className="w-8 h-8 text-green-50" />
          </div>
        </div>
        <div className={`${cardClass} border-l-4 border-l-amber-500`}>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Solicitudes</p>
          <div className="flex items-center justify-between">
            <h3 className="text-3xl font-black text-slate-900">{solicitudes.length}</h3>
            <ClockAlert className="w-8 h-8 text-amber-100" />
          </div>
          <p className="text-xs text-slate-400 mt-1">{tickets.length} tickets TCMM</p>
        </div>
      </div>

      {terData.length > 0 && (
        <div className={cardClass}>
          <h3 className="font-bold text-slate-900 mb-4 flex items-center gap-2">
            <PieChart className="w-4 h-4 text-blue-500" /> Tickets TCMM por Territorio
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[10px] font-black uppercase tracking-widest text-slate-400 border-b border-slate-100">
                  <th className="text-left pb-2 pr-4">Territorio</th>
                  <th className="text-right pb-2">Tickets TCMM</th>
                </tr>
              </thead>
              <tbody>
                {terData.map(({ territorio, count }) => (
                  <tr key={territorio} className="border-b border-slate-50 hover:bg-slate-50">
                    <td className="py-2 pr-4 text-slate-700 font-medium">{territorio}</td>
                    <td className="py-2 text-right tabular-nums font-bold text-slate-700">{count}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-slate-900 text-white text-xs font-bold">
                  <td className="py-2 px-2 rounded-l-lg">TOTAL</td>
                  <td className="py-2 text-right tabular-nums pr-2 rounded-r-lg">{tickets.length}</td>
                </tr>
              </tfoot>
            </table>
            <p className="text-xs text-slate-400 mt-2">Solicitudes recibidas (total): {solicitudes.length} — las solicitudes no registran territorio.</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className={cardClass}>
          <h3 className="font-bold text-slate-900 mb-4 flex items-center gap-2">
            <Download className="w-4 h-4 text-slate-400" /> Exportar Datos Técnicos
          </h3>
          <p className="text-xs text-slate-500 mb-6 leading-relaxed">
            Genera archivos para auditorías de obra, revisión de estimaciones o reportes de mantenimiento preventivo.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button className={btnOutline} onClick={handleExportPDF}>
              <FileText className="w-4 h-4 text-red-600" /> Resumen General (.pdf)
            </button>
            <button className={btnOutline} disabled title="Próximamente">
              <FileSpreadsheet className="w-4 h-4 text-green-600" /> Resumen de Obras (.xlsx)
            </button>
            <button className={btnOutline} disabled title="Próximamente">
              <PieChart className="w-4 h-4 text-blue-600" /> Estatus por Colegio
            </button>
            <button className={btnOutline} disabled title="Próximamente">
              <Filter className="w-4 h-4 text-slate-600" /> Reporte de Incidencias
            </button>
          </div>
        </div>
        <div className={`${cardClass} bg-slate-900 text-white border-none relative overflow-hidden flex flex-col justify-center`}>
          <div className="relative z-10">
            <img src="/logo.png" alt="Mano Amiga" className="h-14 w-auto object-contain mb-4" />
            <p className="text-slate-400 text-sm mb-6 max-w-sm">
              Todos los datos están sincronizados con tu base de datos central. Los cambios realizados en campo se reflejan aquí en tiempo real.
            </p>
            <div className="flex gap-2">
              <span className="px-3 py-1 bg-white/10 rounded-full text-[10px] font-bold uppercase tracking-widest">v2.0 Beta</span>
              <span className="px-3 py-1 bg-green-500/20 text-green-400 rounded-full text-[10px] font-bold uppercase tracking-widest">Sincronizado</span>
            </div>
          </div>
          <BarChart3 className="absolute -right-8 -bottom-8 w-48 h-48 text-white/5 -rotate-12" />
        </div>
      </div>
    </div>
  );
}
