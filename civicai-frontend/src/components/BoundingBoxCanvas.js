import React, { useEffect, useRef, useState } from 'react';
import { SEVERITY_COLORS } from '../utils/constants';

/**
 * Draws detection bounding boxes over an image.
 * Boxes expected as { x1, y1, x2, y2, class?, civic_class?, confidence? }
 * Coordinates may be absolute pixels or normalized 0–1.
 */
export default function BoundingBoxCanvas({
  imageUrl,
  boxes = [],
  severityLevel = 'High',
  className = '',
}) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const [natural, setNatural] = useState({ w: 0, h: 0 });
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!imageUrl) return undefined;
    setError(false);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => setNatural({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => setError(true);
    img.src = imageUrl;
    return undefined;
  }, [imageUrl]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container || !imageUrl || !natural.w) return undefined;

    const draw = () => {
      const maxW = container.clientWidth || 640;
      const scale = Math.min(1, maxW / natural.w);
      const displayW = Math.round(natural.w * scale);
      const displayH = Math.round(natural.h * scale);

      canvas.width = displayW;
      canvas.height = displayH;

      const ctx = canvas.getContext('2d');
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        ctx.clearRect(0, 0, displayW, displayH);
        ctx.drawImage(img, 0, 0, displayW, displayH);

        const stroke = SEVERITY_COLORS[severityLevel] || SEVERITY_COLORS.High;
        const looksNormalized = boxes.some(
          (b) =>
            (b.x2 != null && b.x2 <= 1.5) ||
            (b.width != null && b.width <= 1.5)
        );

        boxes.forEach((box) => {
          let x1;
          let y1;
          let x2;
          let y2;

          if (box.x1 != null && box.y1 != null && box.x2 != null && box.y2 != null) {
            x1 = box.x1;
            y1 = box.y1;
            x2 = box.x2;
            y2 = box.y2;
          } else if (box.x != null && box.y != null && box.width != null && box.height != null) {
            x1 = box.x;
            y1 = box.y;
            x2 = box.x + box.width;
            y2 = box.y + box.height;
          } else {
            return;
          }

          if (looksNormalized) {
            x1 *= natural.w;
            y1 *= natural.h;
            x2 *= natural.w;
            y2 *= natural.h;
          }

          const sx = x1 * scale;
          const sy = y1 * scale;
          const sw = (x2 - x1) * scale;
          const sh = (y2 - y1) * scale;

          ctx.strokeStyle = stroke;
          ctx.lineWidth = Math.max(2, 3 * scale);
          ctx.strokeRect(sx, sy, sw, sh);

          const label =
            box.civic_class || box.class || box.label || 'detection';
          const conf =
            box.confidence != null
              ? ` ${(Number(box.confidence) <= 1
                  ? Number(box.confidence) * 100
                  : Number(box.confidence)
                ).toFixed(0)}%`
              : '';

          const text = `${label}${conf}`;
          ctx.font = `600 ${Math.max(11, 12 * scale)}px "Source Sans 3", sans-serif`;
          const metrics = ctx.measureText(text);
          const padX = 6;
          const padY = 4;
          const th = Math.max(14, 16 * scale);
          ctx.fillStyle = stroke;
          ctx.fillRect(sx, Math.max(0, sy - th - 2), metrics.width + padX * 2, th + padY);
          ctx.fillStyle = '#fff';
          ctx.fillText(text, sx + padX, Math.max(th - 4, sy - 6));
        });
      };
      img.src = imageUrl;
    };

    draw();
    window.addEventListener('resize', draw);
    return () => window.removeEventListener('resize', draw);
  }, [imageUrl, boxes, natural, severityLevel]);

  if (error) {
    return (
      <div className={`flex items-center justify-center rounded-lg bg-slate-100 p-8 text-sm text-slate-500 ${className}`}>
        Unable to load image preview
      </div>
    );
  }

  return (
    <div ref={containerRef} className={`overflow-hidden rounded-lg bg-slate-900/5 ${className}`}>
      <canvas ref={canvasRef} className="mx-auto block max-w-full" />
    </div>
  );
}
