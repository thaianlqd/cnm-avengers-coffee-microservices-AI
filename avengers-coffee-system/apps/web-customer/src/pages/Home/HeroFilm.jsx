import { useEffect, useRef, useState } from 'react';

const FILM_ID = 'ByXL5WCSXys';
let youtubeReady;

function loadYoutube() {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (!youtubeReady) {
    youtubeReady = new Promise((resolve, reject) => {
      const previous = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        previous?.();
        resolve(window.YT);
      };
      const script = document.createElement('script');
      script.src = 'https://www.youtube.com/iframe_api';
      script.onerror = () => { youtubeReady = undefined; reject(new Error('Film unavailable')); };
      document.head.appendChild(script);
    });
  }
  return youtubeReady;
}

export default function HeroFilm({ isEn }) {
  const container = useRef(null);
  const player = useRef(null);
  const paused = useRef(false);
  const inView = useRef(true);
  const [hasPlayed, setHasPlayed] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [failed, setFailed] = useState(false);
  const [motionAllowed, setMotionAllowed] = useState(() => !window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const change = () => setMotionAllowed(!preference.matches);
    preference.addEventListener('change', change);
    return () => preference.removeEventListener('change', change);
  }, []);

  useEffect(() => {
    if (!motionAllowed) return;
    let cancelled = false;
    let revealTimer;
    const mount = container.current;
    const host = document.createElement('div');
    mount.appendChild(host);
    loadYoutube().then(YT => {
      if (cancelled) return;
      player.current = new YT.Player(host, {
        videoId: FILM_ID,
        playerVars: {
          autoplay: 1, mute: 1, controls: 0, disablekb: 1, playsinline: 1,
          loop: 1, playlist: FILM_ID, rel: 0, start: 12, cc_load_policy: 0, iv_load_policy: 3,
          origin: window.location.origin,
        },
        events: {
          onReady: ({ target }) => {
            if (cancelled) return;
            const iframe = target.getIframe();
            iframe.setAttribute('tabindex', '-1');
            iframe.setAttribute('aria-hidden', 'true');
            iframe.setAttribute('title', 'Highlands Coffee — Là của chúng mình');
            target.mute();
            target.setOption?.('captions', 'track', {});
            if (inView.current && !paused.current && !document.hidden) target.playVideo();
            else target.pauseVideo();
          },
          onStateChange: ({ data }) => {
            if (cancelled) return;
            window.clearTimeout(revealTimer);
            if (data === YT.PlayerState.PLAYING) {
              setHasPlayed(true);
              player.current?.setOption?.('captions', 'track', {});
              // Let the embedded player's transient playback chrome fade before
              // revealing the film. The local photograph stays visible meanwhile.
              revealTimer = window.setTimeout(() => {
                if (!cancelled) setIsPlaying(true);
              }, 3500);
            } else setIsPlaying(false);
          },
          onError: () => { if (!cancelled) setFailed(true); },
          onApiChange: ({ target }) => {
            target.setOption?.('captions', 'track', {});
          },
        },
      });
    }).catch(() => { if (!cancelled) setFailed(true); });
    const syncPlayback = () => {
      if (!player.current?.playVideo) return;
      if (inView.current && !paused.current && !document.hidden) player.current.playVideo();
      else player.current.pauseVideo();
    };
    const observer = new IntersectionObserver(([entry]) => {
      inView.current = entry.isIntersecting;
      syncPlayback();
    }, { threshold: 0.05 });
    observer.observe(mount);
    document.addEventListener('visibilitychange', syncPlayback);
    return () => {
      cancelled = true;
      window.clearTimeout(revealTimer);
      observer.disconnect();
      document.removeEventListener('visibilitychange', syncPlayback);
      player.current?.destroy?.();
      player.current = null;
      mount.replaceChildren();
    };
  }, [motionAllowed]);

  const toggle = () => {
    paused.current = !paused.current;
    setIsPaused(paused.current);
    if (paused.current) player.current?.pauseVideo?.();
    else player.current?.playVideo?.();
  };

  return <>
    <div className={`hc-film ${isPlaying && !failed && motionAllowed ? 'hc-film--playing' : ''}`} aria-hidden="true">
      <img className="hc-film-poster" src="/hc-assets/8W1A6722_1.jpg" alt="" fetchPriority="high" />
      <div className="hc-film-player" ref={container} />
    </div>
    {motionAllowed && hasPlayed && !failed && <button type="button" className="hc-film-toggle" onClick={toggle} aria-label={isPaused ? (isEn ? 'Play background video' : 'Phát video nền') : (isEn ? 'Pause background video' : 'Tạm dừng video nền')} aria-pressed={isPaused}>
      {isPaused ? <svg viewBox="0 0 24 24" fill="currentColor"><path d="m9 5 11 7-11 7z" /></svg> : <svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 5h3v14H7zm7 0h3v14h-3z" /></svg>}
    </button>}
  </>;
}
