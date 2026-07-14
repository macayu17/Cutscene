import { mapBoxToCapture, scrollMatches } from '@cutscene/trace';
import { useEffect, type RefObject } from 'react';
import { eventById, useEditorStore } from './store';
import { segmentStrength } from './segments';

export function VideoView({ video }: { video: RefObject<HTMLVideoElement | null> }) {
  const { bundle, mediaUrl, selectedEventId, hoveredEventId, playheadMs, segments, setPlayhead } = useEditorStore();
  useEffect(() => {
    const element = video.current;
    if (!element) return;
    let frame = 0;
    const sync = () => setPlayhead(element.currentTime * 1_000);
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
      sync();
    };
    element.addEventListener('play', start);
    element.addEventListener('pause', stop);
    element.addEventListener('ended', stop);
    element.addEventListener('seeked', sync);
    if (!element.paused) start();
    return () => {
      cancelAnimationFrame(frame);
      element.removeEventListener('play', start);
      element.removeEventListener('pause', stop);
      element.removeEventListener('ended', stop);
      element.removeEventListener('seeked', sync);
    };
  }, [mediaUrl, setPlayhead, video]);
  if (!bundle || !mediaUrl) return null;
  const event = eventById(bundle.events, hoveredEventId ?? selectedEventId);
  const traceTime = (playheadMs - bundle.clock.intercept) / bundle.clock.slope;
  const current = bundle.events.filter((item) => item.t <= traceTime).at(-1);
  const show = event?.target && current && scrollMatches(event.scroll, current.scroll);
  const box = show && event.target ? mapBoxToCapture(event.target.boundingBox, event.viewport, bundle.meta.capture) : null;
  const active = segments.find((segment) => segmentStrength(segment, playheadMs) > 0);
  const strength = active ? segmentStrength(active, playheadMs) : 0;
  const focus = active ? mapBoxToCapture(active.focus, bundle.meta.viewport, bundle.meta.capture) : null;
  const scale = active ? 1 + strength * (active.scale - 1) : 1;
  const origin = focus ? `${(focus.x + focus.width / 2) / bundle.meta.capture.width * 100}% ${(focus.y + focus.height / 2) / bundle.meta.capture.height * 100}%` : '50% 50%';
  return <div className="video-stage" style={{ aspectRatio: `${bundle.meta.capture.width}/${bundle.meta.capture.height}` }}>
    <div className="video-transform" style={{ transform: `scale(${scale})`, transformOrigin: origin }}>
      <video ref={video} src={mediaUrl} controls/>
      {box ? <div className="semantic-box" style={{ left: `${box.x / bundle.meta.capture.width * 100}%`, top: `${box.y / bundle.meta.capture.height * 100}%`, width: `${box.width / bundle.meta.capture.width * 100}%`, height: `${box.height / bundle.meta.capture.height * 100}%` }}/>: null}
    </div>
  </div>;
}
