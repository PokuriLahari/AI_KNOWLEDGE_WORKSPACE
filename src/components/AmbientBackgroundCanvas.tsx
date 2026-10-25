import React, { useEffect, useRef } from 'react';

export type BackgroundAnimationPreset =
  | 'constellation'
  | 'aurora'
  | 'matrix'
  | 'minimal';

interface AmbientBackgroundCanvasProps {
  preset: BackgroundAnimationPreset;
  theme: 'light' | 'dark';
  speedMultiplier?: number;
  customKeyframeUrl?: string | null;
  customVideoUrl?: string | null;
}

interface VectorNode {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  hue: number;
  pulsePhase: number;
}

interface DataPacket {
  fromIdx: number;
  toIdx: number;
  progress: number;
  speed: number;
}

export const AmbientBackgroundCanvas: React.FC<AmbientBackgroundCanvasProps> = ({
  preset,
  theme,
  speedMultiplier = 1,
  customKeyframeUrl,
  customVideoUrl,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const mouseRef = useRef<{ x: number; y: number; active: boolean }>({
    x: -1000,
    y: -1000,
    active: false,
  });

  useEffect(() => {
    if (preset === 'minimal') return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId = 0;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };

    const handleMouseMove = (e: MouseEvent) => {
      mouseRef.current.x = e.clientX;
      mouseRef.current.y = e.clientY;
      mouseRef.current.active = true;
    };

    const handleMouseLeave = () => {
      mouseRef.current.active = false;
    };

    window.addEventListener('resize', handleResize);
    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    window.addEventListener('mouseleave', handleMouseLeave);

    // Initialize vector nodes
    const nodeCount = Math.min(48, Math.max(24, Math.floor((width * height) / 34000)));
    const nodes: VectorNode[] = Array.from({ length: nodeCount }, (_, i) => ({
      x: Math.random() * width,
      y: Math.random() * height,
      vx: (Math.random() - 0.5) * 0.55 * speedMultiplier,
      vy: (Math.random() - 0.5) * 0.55 * speedMultiplier,
      radius: 2 + (i % 3) * 1.1,
      hue: i % 3 === 0 ? 238 : i % 3 === 1 ? 198 : 262, // Indigo, Sky, Violet
      pulsePhase: Math.random() * Math.PI * 2,
    }));

    const packets: DataPacket[] = Array.from({ length: 10 }, () => ({
      fromIdx: Math.floor(Math.random() * nodeCount),
      toIdx: Math.floor(Math.random() * nodeCount),
      progress: Math.random(),
      speed: (0.006 + Math.random() * 0.008) * speedMultiplier,
    }));

    let time = 0;

    const render = () => {
      time += 0.012 * speedMultiplier;
      ctx.clearRect(0, 0, width, height);

      const isDark = theme === 'dark';

      if (preset === 'aurora') {
        // Multi-layered Nano Banana Aurora Silk waves
        for (let layer = 0; layer < 3; layer++) {
          ctx.beginPath();
          const baseY = height * (0.28 + layer * 0.22);
          ctx.moveTo(0, height);
          for (let x = 0; x <= width; x += 32) {
            const wave1 =
              Math.sin(x * 0.0022 + time * (0.9 + layer * 0.2) + layer) * 64;
            const wave2 =
              Math.cos(x * 0.0045 - time * 0.6 + layer * 2) * 32;
            ctx.lineTo(x, baseY + wave1 + wave2);
          }
          ctx.lineTo(width, height);
          ctx.closePath();

          const grad = ctx.createLinearGradient(0, baseY - 100, width, height);
          if (layer === 0) {
            grad.addColorStop(
              0,
              isDark ? 'rgba(79, 70, 229, 0.10)' : 'rgba(79, 70, 229, 0.065)'
            );
            grad.addColorStop(
              1,
              isDark ? 'rgba(14, 165, 233, 0.02)' : 'rgba(14, 165, 233, 0.015)'
            );
          } else if (layer === 1) {
            grad.addColorStop(
              0,
              isDark ? 'rgba(14, 165, 233, 0.09)' : 'rgba(14, 165, 233, 0.055)'
            );
            grad.addColorStop(
              1,
              isDark ? 'rgba(139, 92, 246, 0.02)' : 'rgba(139, 92, 246, 0.01)'
            );
          } else {
            grad.addColorStop(
              0,
              isDark ? 'rgba(99, 102, 241, 0.08)' : 'rgba(99, 102, 241, 0.045)'
            );
            grad.addColorStop(1, 'rgba(99, 102, 241, 0)');
          }
          ctx.fillStyle = grad;
          ctx.fill();
        }
      }

      if (preset === 'matrix') {
        // Isometric Vector Horizon Lattice + floating semantic particles
        const spacing = 64;
        ctx.strokeStyle = isDark
          ? 'rgba(99, 102, 241, 0.07)'
          : 'rgba(79, 70, 229, 0.055)';
        ctx.lineWidth = 1;

        const offset = (time * 18) % spacing;
        for (let x = -spacing; x < width + spacing; x += spacing) {
          ctx.beginPath();
          ctx.moveTo(x + offset, 0);
          ctx.lineTo(x + offset - 120, height);
          ctx.stroke();
        }
        for (let y = -spacing; y < height + spacing; y += spacing) {
          ctx.beginPath();
          ctx.moveTo(0, y + offset);
          ctx.lineTo(width, y + offset);
          ctx.stroke();
        }
      }

      // Render interactive vector nodes and RRF edges for 'constellation' (and subtle nodes for 'aurora'/'matrix')
      const connectionDist = preset === 'constellation' ? 175 : 130;

      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i];
        n.x += n.vx;
        n.y += n.vy;
        n.pulsePhase += 0.03;

        if (n.x < 0 || n.x > width) n.vx *= -1;
        if (n.y < 0 || n.y > height) n.vy *= -1;

        // Subtle cursor gravity / interaction
        if (mouseRef.current.active) {
          const dx = mouseRef.current.x - n.x;
          const dy = mouseRef.current.y - n.y;
          const dist = Math.hypot(dx, dy);
          if (dist < 180 && dist > 1) {
            n.x -= (dx / dist) * 0.45;
            n.y -= (dy / dist) * 0.45;
          }
        }

        // Draw edges
        for (let j = i + 1; j < nodes.length; j++) {
          const m = nodes[j];
          const dx = m.x - n.x;
          const dy = m.y - n.y;
          const dist = Math.hypot(dx, dy);

          if (dist < connectionDist) {
            const alpha =
              (1 - dist / connectionDist) *
              (preset === 'constellation'
                ? isDark
                  ? 0.22
                  : 0.16
                : isDark
                  ? 0.1
                  : 0.08);
            ctx.strokeStyle = isDark
              ? `rgba(129, 140, 248, ${alpha})`
              : `rgba(79, 70, 229, ${alpha})`;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(n.x, n.y);
            ctx.lineTo(m.x, m.y);
            ctx.stroke();
          }
        }

        // Draw node core
        const pulse = 0.75 + Math.sin(n.pulsePhase) * 0.25;
        ctx.fillStyle = isDark
          ? `hsla(${n.hue}, 85%, 72%, ${0.42 * pulse})`
          : `hsla(${n.hue}, 78%, 54%, ${0.34 * pulse})`;
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.radius * pulse, 0, Math.PI * 2);
        ctx.fill();
      }

      // Draw animated RRF data packets traveling between vector nodes
      if (preset === 'constellation') {
        for (const pkt of packets) {
          const a = nodes[pkt.fromIdx];
          const b = nodes[pkt.toIdx];
          if (!a || !b) continue;

          const dist = Math.hypot(b.x - a.x, b.y - a.y);
          if (dist > connectionDist * 1.4) {
            pkt.fromIdx = Math.floor(Math.random() * nodes.length);
            pkt.toIdx = (pkt.fromIdx + 1 + Math.floor(Math.random() * 5)) % nodes.length;
            pkt.progress = 0;
            continue;
          }

          pkt.progress += pkt.speed;
          if (pkt.progress >= 1) {
            pkt.fromIdx = pkt.toIdx;
            pkt.toIdx = Math.floor(Math.random() * nodes.length);
            pkt.progress = 0;
          }

          const px = a.x + (b.x - a.x) * pkt.progress;
          const py = a.y + (b.y - a.y) * pkt.progress;

          ctx.fillStyle = isDark
            ? 'rgba(56, 189, 248, 0.75)'
            : 'rgba(79, 70, 229, 0.65)';
          ctx.beginPath();
          ctx.arc(px, py, 2.4, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      animationFrameId = window.requestAnimationFrame(render);
    };

    render();

    return () => {
      window.cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseleave', handleMouseLeave);
    };
  }, [preset, theme, speedMultiplier]);

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-0 overflow-hidden"
    >
      {/* Optional Custom Omni Video Background Loop */}
      {customVideoUrl && (
        <video
          src={customVideoUrl}
          autoPlay
          loop
          muted
          playsInline
          className="absolute inset-0 w-full h-full object-cover opacity-20 dark:opacity-25 mix-blend-multiply dark:mix-blend-screen"
        />
      )}

      {/* Optional Custom Nano Banana Generated Keyframe Backdrop */}
      {customKeyframeUrl && !customVideoUrl && (
        <img
          src={customKeyframeUrl}
          alt=""
          className="absolute inset-0 w-full h-full object-cover opacity-25 dark:opacity-20 transition-opacity duration-700"
        />
      )}

      {/* Ambient Floating Gradient Orbs (CSS Hardware-Accelerated) */}
      <div
        className={`absolute -top-32 -left-24 w-[520px] h-[520px] rounded-full blur-[120px] transition-opacity duration-700 ${
          theme === 'dark'
            ? 'bg-indigo-600/12'
            : 'bg-indigo-400/15'
        }`}
      />
      <div
        className={`absolute top-1/3 -right-32 w-[480px] h-[480px] rounded-full blur-[130px] transition-opacity duration-700 ${
          theme === 'dark'
            ? 'bg-sky-500/10'
            : 'bg-sky-400/12'
        }`}
      />

      {/* Interactive 60fps Canvas Layer */}
      {preset !== 'minimal' && (
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full block"
        />
      )}
    </div>
  );
};
