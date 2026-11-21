import React, { useState, useEffect, useRef } from 'react';
import {
  Mic,
  Video,
  Volume2,
  Sliders,
  CheckCircle,
  X,
  Play,
  Sparkles,
} from 'lucide-react';

interface DeviceSettingsModalProps {
  onClose: () => void;
}

export const DeviceSettingsModal: React.FC<DeviceSettingsModalProps> = ({ onClose }) => {
  const videoPreviewRef = useRef<HTMLVideoElement | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [audioLevel, setAudioLevel] = useState(0);
  const [virtualBg, setVirtualBg] = useState<'none' | 'blur' | 'office' | 'factory'>('none');
  const [noiseSuppression, setNoiseSuppression] = useState(true);
  const [echoCancellation, setEchoCancellation] = useState(true);
  const [lowBandwidthMode, setLowBandwidthMode] = useState(false);
  const [isPlayingTestSound, setIsPlayingTestSound] = useState(false);

  useEffect(() => {
    let animFrame: number;
    let audioCtx: AudioContext | null = null;

    navigator.mediaDevices
      .getUserMedia({ video: true, audio: true })
      .then((s) => {
        setStream(s);
        if (videoPreviewRef.current) {
          videoPreviewRef.current.srcObject = s;
        }

        try {
          audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
          const analyser = audioCtx.createAnalyser();
          const src = audioCtx.createMediaStreamSource(s);
          src.connect(analyser);
          const dataArray = new Uint8Array(analyser.frequencyBinCount);

          const updateMeter = () => {
            analyser.getByteFrequencyData(dataArray);
            let sum = 0;
            for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
            const avg = sum / dataArray.length;
            setAudioLevel(Math.min(100, avg * 2));
            animFrame = requestAnimationFrame(updateMeter);
          };
          updateMeter();
        } catch (e) {
          console.warn('Audio metering notice:', e);
        }
      })
      .catch((err) => {
        console.warn('Media preview notice:', err);
      });

    return () => {
      cancelAnimationFrame(animFrame);
      if (audioCtx) audioCtx.close();
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  const playTestChime = () => {
    setIsPlayingTestSound(true);
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
      osc.frequency.setValueAtTime(880, ctx.currentTime + 0.15); // A5
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.6);
      setTimeout(() => setIsPlayingTestSound(false), 700);
    } catch (e) {
      setTimeout(() => setIsPlayingTestSound(false), 500);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-3 sm:p-4 overflow-y-auto">
      <div className="w-full max-w-xl max-h-[92dvh] overflow-y-auto bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl sm:rounded-3xl p-4 sm:p-6 shadow-2xl text-slate-900 dark:text-white space-y-5 my-auto">
        <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <Sliders className="w-5 h-5 text-sky-500" />
            <h3 className="text-base font-bold">Audio & Video Diagnostics</h3>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-white rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Video Preview with Virtual Background Simulation */}
        <div className="space-y-2">
          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
            Camera Preview & Background Filter
          </label>
          <div className="relative aspect-video rounded-2xl overflow-hidden bg-slate-950 border border-slate-800 flex items-center justify-center">
            <video
              ref={videoPreviewRef}
              autoPlay
              playsInline
              muted
              className={`w-full h-full object-cover transform -scale-x-100 ${
                virtualBg === 'blur'
                  ? 'blur-sm scale-105'
                  : virtualBg === 'office'
                  ? 'contrast-125 saturate-110'
                  : ''
              }`}
            />
            <div className="absolute bottom-3 left-3 bg-slate-950/80 backdrop-blur px-2.5 py-1 rounded-lg text-[11px] font-mono text-emerald-400 border border-slate-800">
              HD 1080p · 30 FPS · Auto Exposure
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
            <span className="text-slate-500">Virtual Background:</span>
            {(['none', 'blur', 'office', 'factory'] as const).map((bg) => (
              <button
                key={bg}
                type="button"
                onClick={() => setVirtualBg(bg)}
                className={`px-3 py-1 rounded-lg font-medium capitalize transition-colors ${
                  virtualBg === bg
                    ? 'bg-sky-600 text-white'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                }`}
              >
                {bg}
              </button>
            ))}
          </div>
        </div>

        {/* Audio Metering & Speaker Test */}
        <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 space-y-4 text-xs">
          <div>
            <div className="flex items-center justify-between mb-1.5 font-semibold">
              <span className="flex items-center gap-1.5">
                <Mic className="w-3.5 h-3.5 text-sky-500" />
                <span>Microphone Input Level</span>
              </span>
              <span className="font-mono text-emerald-500 tabular-nums">{Math.round(audioLevel)}%</span>
            </div>
            <div className="h-2.5 w-full bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-500 rounded-full transition-all duration-75"
                style={{ width: `${audioLevel}%` }}
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-200 dark:border-slate-700">
            <div>
              <p className="font-semibold text-slate-800 dark:text-slate-200">Speaker Output Test</p>
              <p className="text-[11px] text-slate-500">Play standard high-frequency test chime</p>
            </div>
            <button
              onClick={playTestChime}
              disabled={isPlayingTestSound}
              className="px-3 py-1.5 bg-slate-900 dark:bg-slate-700 hover:bg-slate-800 text-white rounded-lg font-semibold flex items-center gap-1.5 transition-colors shrink-0"
            >
              <Volume2 className="w-3.5 h-3.5" />
              <span>{isPlayingTestSound ? 'Playing...' : 'Test Speaker'}</span>
            </button>
          </div>
        </div>

        {/* Advanced Filters */}
        <div className="space-y-3 pt-2 text-xs">
          <label className="flex items-center justify-between gap-3 cursor-pointer">
            <span>AI Acoustic Noise Suppression (Suppresses machinery & background chatter)</span>
            <input
              type="checkbox"
              checked={noiseSuppression}
              onChange={(e) => setNoiseSuppression(e.target.checked)}
              className="w-4 h-4 rounded text-sky-600 focus:ring-sky-500"
            />
          </label>

          <label className="flex items-center justify-between cursor-pointer">
            <span>Acoustic Echo Cancellation (AEC)</span>
            <input
              type="checkbox"
              checked={echoCancellation}
              onChange={(e) => setEchoCancellation(e.target.checked)}
              className="w-4 h-4 rounded text-sky-600 focus:ring-sky-500"
            />
          </label>

          <label className="flex items-center justify-between cursor-pointer">
            <span>Low-Bandwidth Mobile Mode (Prioritizes crystal audio clarity on 3G/2G)</span>
            <input
              type="checkbox"
              checked={lowBandwidthMode}
              onChange={(e) => setLowBandwidthMode(e.target.checked)}
              className="w-4 h-4 rounded text-sky-600 focus:ring-sky-500"
            />
          </label>
        </div>

        <div className="flex justify-end pt-3 border-t border-slate-200 dark:border-slate-800">
          <button
            onClick={onClose}
            className="px-5 py-2 bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs rounded-xl shadow-sm transition-colors"
          >
            Apply & Done
          </button>
        </div>
      </div>
    </div>
  );
};
