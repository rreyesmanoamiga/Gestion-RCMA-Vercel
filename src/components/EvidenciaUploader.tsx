import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { useSharePointUpload } from '@/hooks/useSharePointUpload';
import { Camera, ExternalLink, Trash2, Upload, ImageIcon } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

interface EvidenciaUploaderProps {
  referenciaId: string;          // ID del ítem (checklist_item_id o minimo_id)
  modulo: 'checklist' | 'minimos';
  territorio?: string;
  colegio?: string;
  label?: string;                // Nombre del ítem para la carpeta
  isAdmin: boolean;
}

export default function EvidenciaUploader({
  referenciaId, modulo, territorio, colegio, label, isAdmin
}: EvidenciaUploaderProps) {
  const qc = useQueryClient();
  const { upload, uploading } = useSharePointUpload();
  const [dragOver, setDragOver] = useState(false);

  // Archivos ya subidos para este ítem
  const { data: archivos = [] } = useQuery({
    queryKey: ['sharepoint_archivos', referenciaId],
    queryFn: async () => {
      const { data } = await supabase
        .from('sharepoint_archivos')
        .select('*')
        .eq('referencia_id', referenciaId)
        .order('created_at');
      return data ?? [];
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from('sharepoint_archivos').delete().eq('id', id);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sharepoint_archivos', referenciaId] }),
  });

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const allowed = ['image/jpeg','image/png','image/heic','image/webp','application/pdf'];

    for (const file of Array.from(files)) {
      if (!allowed.includes(file.type)) {
        toast.error(`Tipo de archivo no permitido: ${file.name}`);
        continue;
      }
      if (file.size > 20 * 1024 * 1024) {
        toast.error(`Archivo muy grande (máx 20MB): ${file.name}`);
        continue;
      }

      const result = await upload(file, {
        modulo: 'Evidencias',
        territorio,
        colegio,
        referencia: `${modulo === 'checklist' ? 'Checklists' : 'Minimos'}/${label ?? referenciaId}`,
      });

      if (result) {
        await supabase.from('sharepoint_archivos').insert({
          modulo,
          referencia_id: referenciaId,
          nombre:        result.fileName,
          web_url:       result.webUrl,
          carpeta:       `Evidencias/${territorio}/${colegio}`,
          subido_por:    (await supabase.auth.getUser()).data.user?.email ?? '',
        });
        qc.invalidateQueries({ queryKey: ['sharepoint_archivos', referenciaId] });
      }
    }
  };

  return (
    <div className="space-y-2 mt-2">
      {/* Zona de subida */}
      <div
        className={`border-2 border-dashed rounded-lg p-3 text-center transition cursor-pointer
          ${dragOver ? 'border-teal-400 bg-teal-50' : 'border-slate-200 hover:border-teal-300 hover:bg-slate-50'}
          ${uploading ? 'opacity-50 pointer-events-none' : ''}`}
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={e => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); }}
        onClick={() => { const input = document.createElement('input'); input.type='file'; input.multiple=true; input.accept='image/*,.pdf'; input.onchange=e=>handleFiles((e.target as HTMLInputElement).files); input.click(); }}
      >
        {uploading ? (
          <p className="text-xs text-teal-600 font-semibold">Subiendo a SharePoint...</p>
        ) : (
          <div className="flex items-center justify-center gap-2">
            <Camera className="w-4 h-4 text-slate-400" />
            <p className="text-xs text-slate-500">
              <span className="font-semibold text-teal-600">Agregar evidencia</span> · Arrastra fotos o da clic
            </p>
          </div>
        )}
      </div>

      {/* Archivos subidos */}
      {archivos.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {archivos.map((a: any) => (
            <div key={a.id} className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1">
              <ImageIcon className="w-3 h-3 text-teal-500 shrink-0" />
              <span className="text-[10px] text-slate-600 max-w-[120px] truncate">{a.nombre}</span>
              <a href={a.web_url} target="_blank" rel="noreferrer"
                className="p-0.5 text-blue-500 hover:text-blue-700 transition" title="Ver en SharePoint">
                <ExternalLink className="w-3 h-3" />
              </a>
              {isAdmin && (
                <button type="button" onClick={() => deleteMutation.mutate(a.id)}
                  className="p-0.5 text-red-400 hover:text-red-600 transition">
                  <Trash2 className="w-3 h-3" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {archivos.length > 0 && (
        <p className="text-[10px] text-slate-400">
          {archivos.length} evidencia{archivos.length > 1 ? 's' : ''} · {format(new Date(archivos[archivos.length-1].created_at), "d MMM yyyy HH:mm", { locale: es })}
        </p>
      )}
    </div>
  );
}
