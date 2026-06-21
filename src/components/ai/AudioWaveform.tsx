import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

interface AudioWaveformProps {
  stream: MediaStream | null;
  isActive: boolean;
  className?: string;
}

const BAR_COUNT = 32;

export function AudioWaveform({ stream, isActive, className }: AudioWaveformProps) {
  const [bars, setBars] = useState<number[]>(Array(BAR_COUNT).fill(4));
  const animationRef = useRef<number | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    if (!stream || !isActive) {
      setBars(Array(BAR_COUNT).fill(4));
      return;
    }

    const audioContext = new AudioContext();
    audioContextRef.current = audioContext;
    
    const source = audioContext.createMediaStreamSource(stream);
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 128;
    analyser.smoothingTimeConstant = 0.4;
    source.connect(analyser);
    analyserRef.current = analyser;

    const dataArray = new Uint8Array(analyser.frequencyBinCount);

    const draw = () => {
      if (!analyserRef.current) return;
      
      analyserRef.current.getByteFrequencyData(dataArray);
      
      // Sample bars from frequency data
      const newBars: number[] = [];
      const step = Math.floor(dataArray.length / BAR_COUNT);
      
      for (let i = 0; i < BAR_COUNT; i++) {
        const index = i * step;
        const value = dataArray[index];
        // Map 0-255 to 4-40 (min height to max height)
        const height = Math.max(4, (value / 255) * 40);
        newBars.push(height);
      }
      
      setBars(newBars);
      animationRef.current = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, [stream, isActive]);

  return (
    <div 
      className={cn(
        "flex items-center justify-center gap-0.5 h-10",
        className
      )}
    >
      {bars.map((height, index) => (
        <div
          key={index}
          className="bg-primary rounded-full transition-all duration-75"
          style={{
            width: '3px',
            height: `${height}px`,
            opacity: 0.7 + (height / 40) * 0.3,
          }}
        />
      ))}
    </div>
  );
}
