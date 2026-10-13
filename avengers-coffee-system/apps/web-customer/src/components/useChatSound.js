import { useCallback, useEffect, useRef, useState } from 'react';

export default function useChatSound() {
  const [enabled, setEnabled] = useState(() => {
    try { return localStorage.getItem('avengers:chat:sound') !== 'off'; } catch { return true; }
  });
  const enabledRef = useRef(enabled);
  const context = useRef(null);
  const lastPlayed = useRef(0);
  useEffect(() => {
    enabledRef.current = enabled;
    try { localStorage.setItem('avengers:chat:sound', enabled ? 'on' : 'off'); } catch { /* Optional preference. */ }
  }, [enabled]);
  useEffect(() => {
    const unlock = () => {
      const Audio = window.AudioContext || window.webkitAudioContext;
      if (!Audio) return;
      try { context.current ||= new Audio(); context.current.resume().catch(() => {}); } catch { /* Audio is optional. */ }
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    return () => {
      window.removeEventListener('pointerdown', unlock); window.removeEventListener('keydown', unlock);
      context.current?.close().catch(() => {}); context.current = null;
    };
  }, []);
  const play = useCallback(() => {
    const audio = context.current;
    if (!enabledRef.current || !audio || audio.state !== 'running' || Date.now() - lastPlayed.current < 1000) return;
    lastPlayed.current = Date.now();
    [660, 880].forEach((frequency, index) => {
      const oscillator = audio.createOscillator(); const gain = audio.createGain();
      const start = audio.currentTime + index * .12;
      oscillator.type = 'sine'; oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0, start); gain.gain.linearRampToValueAtTime(.09, start + .015);
      gain.gain.exponentialRampToValueAtTime(.001, start + .14);
      oscillator.connect(gain); gain.connect(audio.destination);
      oscillator.start(start); oscillator.stop(start + .16);
      oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
    });
  }, []);
  return { soundEnabled: enabled, toggleSound: () => setEnabled(value => !value), playSound: play };
}
