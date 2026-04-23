import { useRef, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Camera, X, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_SIZE_MB   = 5;

interface PhotoUploaderProps {
  photos?: string[];
  onChange: (photos: string[]) => void;
  label?: string;
  maxPhotos?: number;
}

export default function PhotoUploader({
  photos    = [],
  onChange,
  label     = 'Fotos',
  maxPhotos = 10,
}: PhotoUploaderProps) {
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files ?? []);
    if (!selected.length) return;

    const slots = maxPhotos - photos.length;
    const files  = selected.slice(0, slots);

    const valid = files.filter(file => {
      if (!ALLOWED_TYPES.includes(file.type)) {
        toast.error(`Tipo no permitido: ${file.name} (${file.type})`);
        return false;
      }
      if (file.size > MAX_SIZE_MB * 1024 * 1024) {
        toast.error(`${file.name} supera el límite de ${MAX_SIZE_MB} MB`);
        return false;
      }
      return true;
    });

    if (!valid.length) {
      if (fileRef.current) fileRef.current.value = '';
      return;
    }

    setUploading(true);
    try {
      const urls = await Promise.all(
        valid.map(async (file) => {
          const ext  = file.name.split('.').pop();
          const path = `${Date.now()}-${crypto.randomUUID()}.${ext}`;

          const { error: uploadError } = await supabase.storage
            .from('photos')
            .upload(path, file);

          if (uploadError) throw uploadError;

          const { data: { publicUrl } } = supabase.storage
            .from('photos')
            .getPublicUrl(path);

          return publicUrl;
        })
      );

      onChange([...photos, ...urls]);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error desconocido';
      toast.error('Error al subir la imagen: ' + message);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const removePhoto = async (index: number) => {
    const url  = photos[index];
    const path = url.split('/photos/')[1];
    try {
      await supabase.storage.from('photos').remove([path]);
    } catch (err) {
      console.warn('No se pudo eliminar el archivo de Storage:', err);
    }
    onChange(photos.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-slate-700">{label}</label>
      <div className="flex flex-wrap gap-3">
        {photos.map((url, i) => (
          <div key={i} className="relative w-20 h-20 rounded-lg overflow-hidden border border-slate-200 group">
            <img src={url} alt={`Foto ${i + 1}`} className="w-full h-full object-cover" />
            <button
              type="button"
              onClick={() => removePhoto(i)}
              aria-label={`Eliminar foto ${i + 1}`}
              className="absolute top-1 right-1 w-5 h-5 bg-black/60 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <X className="w-3 h-3 text-white" />
            </button>
          </div>
        ))}

        {photos.length < maxPhotos && (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className={cn(
              'w-20 h-20 rounded-lg border-2 border-dashed border-slate-300 flex flex-col items-center justify-center gap-1 text-slate-400 hover:border-slate-900 hover:text-slate-900 transition-colors bg-slate-50',
              uploading && 'opacity-50 cursor-not-allowed'
            )}
          >
            {uploading ? (
              <Loader2 className="w-5 h-5 animate-spin text-slate-900" />
            ) : (
              <>
                <Camera className="w-5 h-5" />
                <span className="text-[10px] font-medium">Agregar</span>
              </>
            )}
          </button>
        )}
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        multiple
        onChange={handleUpload}
        className="hidden"
      />

      <p className="text-[10px] text-slate-400">
        Máx. {maxPhotos} fotos · {MAX_SIZE_MB} MB por imagen · JPG, PNG, WebP, GIF
      </p>
    </div>
  );
}