import { useCallback, useState, useEffect } from 'react';

export function useNotificationSound() {
  const [isEnabled, setIsEnabled] = useState(() => {
    if (typeof window === 'undefined') return true;
    return localStorage.getItem('notification_sound_enabled') !== 'false';
  });

  // Persist preference
  useEffect(() => {
    localStorage.setItem('notification_sound_enabled', isEnabled.toString());
  }, [isEnabled]);

  // Generate notification sound using Web Audio API
  const playNotification = useCallback(() => {
    if (!isEnabled) return;

    try {
      const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContext) return;

      const audioContext = new AudioContext();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);

      // Pleasant notification sound - two-tone chime
      oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
      oscillator.frequency.setValueAtTime(1000, audioContext.currentTime + 0.1);
      oscillator.frequency.setValueAtTime(1200, audioContext.currentTime + 0.15);

      // Fade out
      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.35);

      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.35);

      // Clean up after sound finishes
      setTimeout(() => {
        audioContext.close();
      }, 500);
    } catch (e) {
      console.warn('Audio playback not supported:', e);
    }
  }, [isEnabled]);

  const toggleSound = useCallback(() => {
    setIsEnabled(prev => !prev);
  }, []);

  return { playNotification, isEnabled, setIsEnabled, toggleSound };
}
