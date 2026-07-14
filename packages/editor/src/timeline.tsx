import type { RefObject } from 'react';
import { useEditorStore } from './store';
import { SegmentsPanel } from './segments-panel';
import { CalloutsPanel } from './callouts-panel';

export function seekForKey(key: string, currentMs: number, durationMs: number): number | null {
  if (key === 'ArrowLeft') return Math.max(0, currentMs - 250);
  if (key === 'ArrowRight') return Math.min(durationMs, currentMs + 250);
  return null;
}

export function tickRow(index: number): number { return index % 4; }

export function Timeline({ video }: { video: RefObject<HTMLVideoElement | null> }) {
  const bundle = useEditorStore((state) => state.bundle);
  const playheadMs = useEditorStore((state) => state.playheadMs);
  const selectEvent = useEditorStore((state) => state.selectEvent);
  const hoverEvent = useEditorStore((state) => state.hoverEvent);
  const setPlayhead = useEditorStore((state) => state.setPlayhead);
  const setBound = useEditorStore((state) => state.setBound);
  if (!bundle) return null;
  const duration = bundle.meta.media.durationMs;
  const seek = (value: number) => { if (video.current) video.current.currentTime = value / 1_000; setPlayhead(value); };
  return <section className="timeline" aria-label="Recording timeline" tabIndex={0} onKeyDown={(event) => {
    const value = seekForKey(event.key, playheadMs, duration);
    if (value !== null) { event.preventDefault(); seek(value); }
    else if (event.key === '[') { event.preventDefault(); setBound('start'); }
    else if (event.key === ']') { event.preventDefault(); setBound('end'); }
  }}>
    <div className="time-row"><span>{(playheadMs / 1_000).toFixed(1)}s</span><input aria-label="Playhead" type="range" min="0" max={duration} value={playheadMs} onChange={(event) => seek(Number(event.currentTarget.value))}/><span>{(duration / 1_000).toFixed(1)}s</span></div>
    <div className="trace-lane" aria-label="Trace events">
      {bundle.events.map((event, index) => { const mediaTime = Math.max(0, bundle.clock.toMediaTime(event.t)); return <button key={event.id} className={`tick tick-${event.type.split('.').at(-1)}`} style={{ left: `${Math.min(100, mediaTime / duration * 100)}%`, top: `${4 + tickRow(index) * 9}px` }}
        aria-label={`${event.type} at ${(mediaTime / 1_000).toFixed(1)} seconds`} onMouseEnter={() => hoverEvent(event.id)} onMouseLeave={() => hoverEvent(null)}
        onFocus={() => hoverEvent(event.id)} onBlur={() => hoverEvent(null)} onClick={() => { selectEvent(event.id, mediaTime); seek(mediaTime); }}/>; })}
    </div>
    <SegmentsPanel/>
    <CalloutsPanel/>
  </section>;
}
