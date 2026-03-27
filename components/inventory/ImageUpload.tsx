'use client';

import { useRef, useState } from 'react';
import Image from 'next/image';
import { ImageIcon, Pencil, X, Loader2 } from 'lucide-react';
import { supabase } from '@/utils/supabase/client';

interface ImageUploadProps {
  inventoryItemId: string;
  currentImageUrl: string | null;
  canEdit: boolean;
  onImageUpdated?: (newUrl: string | null) => void;
}

export default function ImageUpload({
  inventoryItemId,
  currentImageUrl,
  canEdit,
  onImageUpdated,
}: ImageUploadProps) {
  const [imageUrl, setImageUrl] = useState<string | null>(currentImageUrl);
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function getToken(): Promise<string | null> {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token ?? null;
  }

  function handleContainerClick() {
    if (!canEdit || loading) return;
    fileInputRef.current?.click();
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    // Preview inmediato
    const localPreview = URL.createObjectURL(file);
    setPreview(localPreview);
    setError(null);
    setLoading(true);

    try {
      const token = await getToken();
      if (!token) {
        setError('No autenticado. Recarga la página.');
        setPreview(null);
        return;
      }

      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch(`/api/inventory/${inventoryItemId}/image`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Error al subir la imagen.');
        setPreview(null);
        return;
      }

      setImageUrl(data.imageUrl);
      setPreview(null);
      onImageUpdated?.(data.imageUrl);
    } catch {
      setError('Error de conexión al subir la imagen.');
      setPreview(null);
    } finally {
      setLoading(false);
      // Limpiar input para permitir seleccionar el mismo archivo de nuevo
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function handleDelete(e: React.MouseEvent) {
    e.stopPropagation();
    if (!canEdit || loading) return;
    setLoading(true);
    setError(null);

    try {
      const token = await getToken();
      if (!token) {
        setError('No autenticado. Recarga la página.');
        return;
      }

      const res = await fetch(`/api/inventory/${inventoryItemId}/image`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Error al eliminar la imagen.');
        return;
      }

      setImageUrl(null);
      onImageUpdated?.(null);
    } catch {
      setError('Error de conexión al eliminar la imagen.');
    } finally {
      setLoading(false);
    }
  }

  const displayUrl = preview ?? imageUrl;
  const hasImage = !!displayUrl;

  return (
    <div className="flex flex-col gap-2">
      <div
        onClick={handleContainerClick}
        className={[
          'relative w-full aspect-square rounded-xl overflow-hidden border-2 transition-colors',
          hasImage
            ? 'border-gray-200'
            : 'border-dashed border-gray-300 bg-gray-50',
          canEdit && !loading && !hasImage
            ? 'cursor-pointer hover:border-blue-400 hover:bg-blue-50'
            : '',
          loading ? 'opacity-60' : '',
        ].join(' ')}
      >
        {hasImage ? (
          <Image
            src={displayUrl}
            alt="Imagen del producto"
            fill
            className="object-cover"
            sizes="(max-width: 768px) 100vw, 300px"
          />
        ) : (
          <div className="flex flex-col items-center justify-center h-full gap-2 p-4 text-gray-400 select-none">
            <ImageIcon className="w-10 h-10" />
            {canEdit && (
              <span className="text-sm text-center">Subir imagen del producto</span>
            )}
          </div>
        )}

        {/* Overlay de carga */}
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/70">
            <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
          </div>
        )}

        {/* Botón cambiar imagen (cuando ya hay imagen y puede editar) */}
        {hasImage && canEdit && !loading && (
          <button
            type="button"
            onClick={handleContainerClick}
            className="absolute bottom-2 left-2 flex items-center gap-1 px-2 py-1 text-xs bg-white/90 rounded-md shadow text-gray-700 hover:bg-white transition-colors"
          >
            <Pencil className="w-3 h-3" />
            Cambiar
          </button>
        )}

        {/* Botón eliminar */}
        {hasImage && canEdit && !loading && (
          <button
            type="button"
            onClick={handleDelete}
            className="absolute top-2 right-2 p-1 bg-white/90 rounded-full shadow text-red-500 hover:bg-white hover:text-red-600 transition-colors"
            title="Eliminar imagen"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {error && (
        <p className="text-sm text-red-600">{error}</p>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={handleFileChange}
        disabled={loading}
      />
    </div>
  );
}
