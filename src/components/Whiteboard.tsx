import React, { useRef, useState, useEffect } from 'react';
import {
  PenTool,
  Minus,
  Square,
  Circle,
  ArrowUpRight,
  Type,
  Eraser,
  RotateCcw,
  Download,
  Trash2,
  Highlighter,
} from 'lucide-react';
import { realtime } from '../services/websocket';
import { WhiteboardStroke } from '../types';

interface WhiteboardProps {
  meetingCode: string;
  currentUser: { uid: string; displayName: string };
}

export const Whiteboard: React.FC<WhiteboardProps> = ({ meetingCode, currentUser }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [tool, setTool] = useState<'draw' | 'highlighter' | 'line' | 'rect' | 'circle' | 'arrow' | 'eraser'>('draw');
  const [color, setColor] = useState('#38bdf8'); // Sky blue default
  const [strokeWidth, setStrokeWidth] = useState(3);
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentPoints, setCurrentPoints] = useState<{ x: number; y: number }[]>([]);
  const startPosRef = useRef<{ x: number; y: number } | null>(null);

  const colors = [
    '#ffffff', // White
    '#38bdf8', // Sky Blue
    '#34d399', // Emerald
    '#fbbf24', // Amber
    '#f87171', // Red/Coral
    '#c084fc', // Purple
    '#94a3b8', // Slate
  ];

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Resize canvas to match display size
    const resizeCanvas = () => {
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * window.devicePixelRatio;
      canvas.height = rect.height * window.devicePixelRatio;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
      }
    };

    resizeCanvas();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resizeCanvas) : null;
    if (ro && canvas.parentElement) ro.observe(canvas.parentElement);
    window.addEventListener('resize', resizeCanvas);

    // Listen to remote whiteboard events
    const unsubStroke = realtime.on('whiteboard-stroke-received', (data) => {
      if (data.stroke) {
        renderStroke(data.stroke);
      }
    });

    const unsubClear = realtime.on('whiteboard-cleared', () => {
      const ctx = canvas?.getContext('2d');
      if (ctx && canvas) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    });

    return () => {
      if (ro) ro.disconnect();
      window.removeEventListener('resize', resizeCanvas);
      unsubStroke();
      unsubClear();
    };
  }, []);

  const renderStroke = (stroke: WhiteboardStroke) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.save();
    ctx.strokeStyle = stroke.type === 'eraser' ? '#0f172a' : stroke.color;
    ctx.lineWidth = stroke.size;
    ctx.globalAlpha = stroke.type === 'highlighter' ? 0.35 : 1.0;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (stroke.type === 'draw' || stroke.type === 'eraser' || stroke.type === 'highlighter') {
      if (stroke.points.length > 1) {
        ctx.beginPath();
        ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
        for (let i = 1; i < stroke.points.length; i++) {
          ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
        }
        ctx.stroke();
      }
    } else if (stroke.type === 'line' && stroke.points.length >= 2) {
      const p1 = stroke.points[0];
      const p2 = stroke.points[stroke.points.length - 1];
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
    } else if (stroke.type === 'rect' && stroke.points.length >= 2) {
      const p1 = stroke.points[0];
      const p2 = stroke.points[stroke.points.length - 1];
      ctx.strokeRect(p1.x, p1.y, p2.x - p1.x, p2.y - p1.y);
    } else if (stroke.type === 'circle' && stroke.points.length >= 2) {
      const p1 = stroke.points[0];
      const p2 = stroke.points[stroke.points.length - 1];
      const radius = Math.hypot(p2.x - p1.x, p2.y - p1.y);
      ctx.beginPath();
      ctx.arc(p1.x, p1.y, radius, 0, 2 * Math.PI);
      ctx.stroke();
    } else if (stroke.type === 'arrow' && stroke.points.length >= 2) {
      const from = stroke.points[0];
      const to = stroke.points[stroke.points.length - 1];
      const headlen = 14;
      const dx = to.x - from.x;
      const dy = to.y - from.y;
      const angle = Math.atan2(dy, dx);
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(to.x, to.y);
      ctx.lineTo(to.x - headlen * Math.cos(angle - Math.PI / 6), to.y - headlen * Math.sin(angle - Math.PI / 6));
      ctx.lineTo(to.x - headlen * Math.cos(angle + Math.PI / 6), to.y - headlen * Math.sin(angle + Math.PI / 6));
      ctx.lineTo(to.x, to.y);
      ctx.fillStyle = stroke.color;
      ctx.fill();
    }

    ctx.restore();
  };

  const getCanvasCoords = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    const coords = getCanvasCoords(e);
    setIsDrawing(true);
    startPosRef.current = coords;
    setCurrentPoints([coords]);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const coords = getCanvasCoords(e);
    const updatedPoints = [...currentPoints, coords];
    setCurrentPoints(updatedPoints);

    if (tool === 'draw' || tool === 'eraser' || tool === 'highlighter') {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (ctx && currentPoints.length > 0) {
        ctx.save();
        ctx.strokeStyle = tool === 'eraser' ? '#0f172a' : color;
        ctx.lineWidth = strokeWidth * (tool === 'eraser' ? 3 : tool === 'highlighter' ? 4 : 1);
        ctx.globalAlpha = tool === 'highlighter' ? 0.35 : 1.0;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        const prev = currentPoints[currentPoints.length - 1];
        ctx.moveTo(prev.x, prev.y);
        ctx.lineTo(coords.x, coords.y);
        ctx.stroke();
        ctx.restore();
      }
    }
  };

  const handleMouseUp = () => {
    if (!isDrawing) return;
    setIsDrawing(false);

    if (currentPoints.length > 0) {
      const stroke: WhiteboardStroke = {
        id: `strk-${Date.now()}`,
        type: tool,
        points: currentPoints,
        color,
        size: strokeWidth * (tool === 'eraser' ? 3 : tool === 'highlighter' ? 4 : 1),
        userId: currentUser.uid,
      };

      // Draw final shape if geometric
      if (tool === 'line' || tool === 'rect' || tool === 'circle' || tool === 'arrow') {
        renderStroke(stroke);
      }

      // Broadcast to other participants via WebSocket
      realtime.send('whiteboard-stroke', meetingCode, { stroke });
    }

    setCurrentPoints([]);
    startPosRef.current = null;
  };

  const handleClear = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      realtime.send('whiteboard-clear', meetingCode, {});
    }
  };

  const handleDownload = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = `7Sunday_Meet_Whiteboard_${meetingCode}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  };

  return (
    <div className="flex flex-col h-full w-full bg-slate-900 select-none overflow-hidden relative">
      {/* Top Floating Whiteboard Toolbar */}
      <div className="absolute top-2 sm:top-4 left-2 right-2 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 sm:w-auto flex flex-wrap lg:flex-nowrap items-center justify-center gap-1 sm:gap-1.5 p-1.5 bg-slate-950/90 backdrop-blur-md rounded-2xl border border-slate-800 shadow-2xl z-20">
        {/* Tool buttons */}
        <button
          onClick={() => setTool('draw')}
          className={`p-2 rounded-xl text-xs transition-colors ${
            tool === 'draw' ? 'bg-sky-600 text-white shadow-sm' : 'text-slate-400 hover:text-white hover:bg-slate-800'
          }`}
          title="Pen Tool"
        >
          <PenTool className="w-4 h-4" />
        </button>

        <button
          onClick={() => setTool('highlighter')}
          className={`p-2 rounded-xl text-xs transition-colors ${
            tool === 'highlighter' ? 'bg-sky-600 text-white shadow-sm' : 'text-slate-400 hover:text-white hover:bg-slate-800'
          }`}
          title="Highlighter"
        >
          <Highlighter className="w-4 h-4" />
        </button>

        <button
          onClick={() => setTool('line')}
          className={`p-2 rounded-xl text-xs transition-colors ${
            tool === 'line' ? 'bg-sky-600 text-white shadow-sm' : 'text-slate-400 hover:text-white hover:bg-slate-800'
          }`}
          title="Line"
        >
          <Minus className="w-4 h-4" />
        </button>

        <button
          onClick={() => setTool('rect')}
          className={`p-2 rounded-xl text-xs transition-colors ${
            tool === 'rect' ? 'bg-sky-600 text-white shadow-sm' : 'text-slate-400 hover:text-white hover:bg-slate-800'
          }`}
          title="Rectangle"
        >
          <Square className="w-4 h-4" />
        </button>

        <button
          onClick={() => setTool('circle')}
          className={`p-2 rounded-xl text-xs transition-colors ${
            tool === 'circle' ? 'bg-sky-600 text-white shadow-sm' : 'text-slate-400 hover:text-white hover:bg-slate-800'
          }`}
          title="Circle"
        >
          <Circle className="w-4 h-4" />
        </button>

        <button
          onClick={() => setTool('arrow')}
          className={`p-2 rounded-xl text-xs transition-colors ${
            tool === 'arrow' ? 'bg-sky-600 text-white shadow-sm' : 'text-slate-400 hover:text-white hover:bg-slate-800'
          }`}
          title="Arrow"
        >
          <ArrowUpRight className="w-4 h-4" />
        </button>

        <button
          onClick={() => setTool('eraser')}
          className={`p-2 rounded-xl text-xs transition-colors ${
            tool === 'eraser' ? 'bg-sky-600 text-white shadow-sm' : 'text-slate-400 hover:text-white hover:bg-slate-800'
          }`}
          title="Eraser"
        >
          <Eraser className="w-4 h-4" />
        </button>

        <div className="w-px h-5 bg-slate-800 mx-1" />

        {/* Color Palette */}
        <div className="flex items-center gap-1">
          {colors.map((c) => (
            <button
              key={c}
              onClick={() => setColor(c)}
              className={`w-5 h-5 rounded-full transition-transform ${
                color === c ? 'scale-125 ring-2 ring-white ring-offset-2 ring-offset-slate-900' : 'hover:scale-110'
              }`}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>

        <div className="w-px h-5 bg-slate-800 mx-1" />

        {/* Actions */}
        <button
          onClick={handleClear}
          className="p-2 text-slate-400 hover:text-red-400 hover:bg-slate-800 rounded-xl transition-colors"
          title="Clear Board"
        >
          <Trash2 className="w-4 h-4" />
        </button>

        <button
          onClick={handleDownload}
          className="p-2 text-slate-400 hover:text-emerald-400 hover:bg-slate-800 rounded-xl transition-colors"
          title="Download Board as PNG"
        >
          <Download className="w-4 h-4" />
        </button>
      </div>

      {/* Canvas */}
      <canvas
        ref={canvasRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handleMouseUp}
        onPointerCancel={handleMouseUp}
        className="w-full h-full cursor-crosshair touch-none"
      />
    </div>
  );
};
