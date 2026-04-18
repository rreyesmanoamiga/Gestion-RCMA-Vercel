import React, { useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { Camera, X, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export default function PhotoUploader({ photos = [], onChange, label = "Fotos", maxPhotos = 10 }) {
  const [uploading, setUploading] = React.useState(false);
  const fileRef = useRef(null);

  const handleUpload = async (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    setUploading(true);
    const newPhotos = [...photos];
    for (const file of files) {
      if (newPhotos.length >= maxPhotos) break;
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      newPhotos.push(file_url);
    }
    onChange(newPhotos);
    setUploading(false);
    if (fileRef.current) fileRef.current.value = '';
  };

  const removePhoto = (index) => {
    onChange(photos.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-foreground">{label}</label>
      <div className="flex flex-wrap gap-3">
        {photos.map((url, i) => (
          <div key={i} className="relative w-20 h-20 rounded-lg overflow-hidden border border-border group">
            <img src={url} alt="" className="w-full h-full object-cover" />
            <button
              type="button"
              onClick={() => removePhoto(i)}
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
              'w-20 h-20 rounded-lg border-2 border-dashed border-border flex flex-col items-center justify-center gap-1 text-muted-foreground hover:border-primary hover:text-primary transition-colors',
              uploading && 'opacity-50 cursor-not-allowed'
            )}
          >
            {uploading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <>
                <Camera className="w-5 h-5" />
                <span className="text-[10px]">Agregar</span>
              </>
            )}
          </button>
        )}
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        onChange={handleUpload}
        className="hidden"
      />
    </div>
  );
}