import { mapBoxToCapture, scrollMatches } from '@cutscene/trace';
import type { RefObject } from 'react';
import { eventById, useEditorStore } from './store';

export function VideoView({ video }: { video: RefObject<HTMLVideoElement | null> }) {
  const { bundle, mediaUrl, selectedEventId, hoveredEventId, playheadMs, setPlayhead } = useEditorStore();
  if (!bundle || !mediaUrl) return null;
  const event = eventById(bundle.events, hoveredEventId ?? selectedEventId);
  const traceTime = (playheadMs - bundle.clock.intercept) / bundle.clock.slope;
  const current = bundle.events.filter((item) => item.t <= traceTime).at(-1);
  const show = event?.target && current && scrollMatches(event.scroll, current.scroll);
  const box = show && event.target ? mapBoxToCapture(event.target.boundingBox, event.viewport, bundle.meta.capture) : null;
  return <div className="video-stage" style={{ aspectRatio: `${bundle.meta.capture.width}/${bundle.meta.capture.height}` }}>
    <video ref={video} src={mediaUrl} controls onTimeUpdate={(event) => setPlayhead(event.currentTarget.currentTime * 1_000)}/>
    {box ? <div className="semantic-box" style={{ left: `${box.x / bundle.meta.capture.width * 100}%`, top: `${box.y / bundle.meta.capture.height * 100}%`, width: `${box.width / bundle.meta.capture.width * 100}%`, height: `${box.height / bundle.meta.capture.height * 100}%` }}/>: null}
  </div>;
}
