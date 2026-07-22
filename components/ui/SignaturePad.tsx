'use client';
import { useRef, useState, useEffect, useCallback } from 'react';
import { Eraser } from 'lucide-react';

interface SignaturePadProps {
  onChange?: (hasSignature: boolean) => void;
}

export interface SignaturePadHandle {
  isEmpty: () => boolean;
  toBlob: () => Promise<Blob | null>;
  clear: () => void;
}

export function useSignaturePad() {
  return useRef<SignaturePadHandle>(null);
}

export default function SignaturePad({
  ref,
  onChange,
}: SignaturePadProps & { ref?: React.Ref<SignaturePadHandle> }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const hasDrawn = useRef(false);
  const [isEmpty, setIsEmpty] = useState(true);

  const getCtx = () => canvasRef.current?.getContext('2d') ?? null;

  const setupCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * ratio;
    canvas.height = rect.height * ratio;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#1a1a2e';
  }, []);

  useEffect(() => {
    setupCanvas();
    window.addEventListener('resize', setupCanvas);
    return () => window.removeEventListener('resize', setupCanvas);
  }, [setupCanvas]);

  const pos = (e: React.PointerEvent) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const start = (e: React.PointerEvent) => {
    e.preventDefault();
    canvasRef.current?.setPointerCapture(e.pointerId);
    drawing.current = true;
    const ctx = getCtx();
    if (!ctx) return;
    const { x, y } = pos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const move = (e: React.PointerEvent) => {
    if (!drawing.current) return;
    e.preventDefault();
    const ctx = getCtx();
    if (!ctx) return;
    const { x, y } = pos(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    if (!hasDrawn.current) {
      hasDrawn.current = true;
      setIsEmpty(false);
      onChange?.(true);
    }
  };

  const end = () => {
    drawing.current = false;
  };

  const clear = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = getCtx();
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    hasDrawn.current = false;
    setIsEmpty(true);
    onChange?.(false);
  }, [onChange]);

  useEffect(() => {
    if (!ref) return;
    const handle: SignaturePadHandle = {
      isEmpty: () => !hasDrawn.current,
      clear,
      toBlob: () =>
        new Promise((resolve) => {
          const canvas = canvasRef.current;
          if (!canvas || !hasDrawn.current) return resolve(null);
          canvas.toBlob((b) => resolve(b), 'image/png');
        }),
    };
    if (typeof ref === 'function') ref(handle);
    else (ref as React.RefObject<SignaturePadHandle | null>).current = handle;
  }, [ref, clear]);

  return (
    <div className="space-y-2">
      <div className="relative border-2 border-dashed border-gray-300 bg-gray-50">
        <canvas
          ref={canvasRef}
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={end}
          onPointerLeave={end}
          className="w-full h-48 touch-none cursor-crosshair block"
        />
        {isEmpty && (
          <span className="absolute inset-0 flex items-center justify-center text-gray-300 text-sm pointer-events-none select-none">
            Firme aquí
          </span>
        )}
      </div>
      <button
        type="button"
        onClick={clear}
        className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-red-600 transition-colors"
      >
        <Eraser size={14} /> Limpiar firma
      </button>
    </div>
  );
}
