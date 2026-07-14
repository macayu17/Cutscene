import { mapBoxToCapture, scrollMatches } from '@cutscene/trace';
import { useEffect, useRef, type RefObject } from 'react';
import { eventById, useEditorStore } from './store';
import { cameraAt, cameraMatrix } from './camera';
import { pageEventAt } from './bundle';

function SemanticBox() {
  const bundle = useEditorStore((state) => state.bundle);
  const selectedEventId = useEditorStore((state) => state.selectedEventId);
  const hoveredEventId = useEditorStore((state) => state.hoveredEventId);
  const playheadMs = useEditorStore((state) => state.playheadMs);
  if (!bundle) return null;
  const event = eventById(bundle.events, hoveredEventId ?? selectedEventId);
  const traceTime = (playheadMs - bundle.clock.intercept) / bundle.clock.slope;
  const current = pageEventAt(bundle.events, traceTime);
  const show = event?.target && current && scrollMatches(event.scroll, current.scroll);
  const box = show && event.target ? mapBoxToCapture(event.target.boundingBox, event.viewport, bundle.meta.capture) : null;
  return box ? <div className="semantic-box" style={{ left: `${box.x / bundle.meta.capture.width * 100}%`,
    top: `${box.y / bundle.meta.capture.height * 100}%`, width: `${box.width / bundle.meta.capture.width * 100}%`,
    height: `${box.height / bundle.meta.capture.height * 100}%` }}/> : null;
}

export function VideoView({ video }: { video: RefObject<HTMLVideoElement | null> }) {
  const bundle = useEditorStore((state) => state.bundle);
  const mediaUrl = useEditorStore((state) => state.mediaUrl);
  const segments = useEditorStore((state) => state.segments);
  const setPlayhead = useEditorStore((state) => state.setPlayhead);
  const transform = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = video.current;
    const surface = transform.current;
    if (!element || !surface || !bundle) return;
    let frame = 0;
    let publishedAt = Number.NEGATIVE_INFINITY;
    const sync = (publish = false) => {
      const timeMs = element.currentTime * 1_000;
      const camera = cameraAt(timeMs, segments, bundle.meta.viewport, bundle.meta.capture);
      const matrix = cameraMatrix(camera, bundle.meta.capture, { width: surface.clientWidth, height: surface.clientHeight });
      surface.style.transform = `matrix(${matrix.scale}, 0, 0, ${matrix.scale}, ${matrix.translateX}, ${matrix.translateY})`;
      if (publish || Math.abs(timeMs - publishedAt) >= 50) { setPlayhead(timeMs); publishedAt = timeMs; }
    };
    const tick = () => {
      sync();
      if (!element.paused && !element.ended) frame = requestAnimationFrame(tick);
    };
    const start = () => {
      cancelAnimationFrame(frame);
      tick();
    };
    const stop = () => {
      cancelAnimationFrame(frame);
      sync(true);
    };
    element.addEventListener('play', start);
    element.addEventListener('pause', stop);
    element.addEventListener('ended', stop);
    element.addEventListener('seeked', stop);
    const resize = new ResizeObserver(() => sync());
    resize.observe(surface);
    if (element.paused) sync(true); else start();
    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      element.removeEventListener('play', start);
      element.removeEventListener('pause', stop);
      element.removeEventListener('ended', stop);
      element.removeEventListener('seeked', stop);
    };
  }, [bundle, mediaUrl, segments, setPlayhead, video]);
  if (!bundle || !mediaUrl) return null;
  return <div className="video-stage" style={{ aspectRatio: `${bundle.meta.capture.width}/${bundle.meta.capture.height}` }}>
    <div ref={transform} className="video-transform">
      <video ref={video} src={mediaUrl} controls/>
      <SemanticBox/>
    </div>
  </div>;
}
