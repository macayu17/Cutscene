import { useRef, useState } from 'react';
import { readBundleFiles } from './bundle';
import { eventById, useEditorStore } from './store';
import { Timeline } from './timeline';
import { VideoView } from './video';

export default function App() {
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const { bundle, mediaUrl, selectedEventId, load, selectEvent } = useEditorStore();
  if (!bundle || !mediaUrl) return <main className="empty"><p>Record a tab to begin. Chrome only. Works on DOM-based pages.</p>
    <label className="file-label">Load recording bundle<input type="file" multiple accept=".webm,.json,.jsonl" onChange={async (event) => {
      const result = await readBundleFiles(Array.from(event.currentTarget.files ?? []));
      if (result.ok) { load(result.value, result.value.mediaUrl); setError(null); } else setError(result.error);
    }}/></label>{error ? <output className="error">{error}</output> : null}</main>;
  const selected = eventById(bundle.events, selectedEventId);
  return <main className="instrument">
    <header className="topbar"><span>{bundle.meta.recordingId}</span><span>·</span><span>{new URL(bundle.meta.url).host}</span><span>·</span><span>{bundle.meta.capture.width}×{bundle.meta.capture.height}</span><span>·</span><span>{(bundle.meta.media.durationMs / 1_000).toFixed(1)}s</span><button className="push" disabled>Export GIF</button></header>
    <aside className="events"><h2>EVENTS</h2>{bundle.events.map((event) => { const time = bundle.clock.toMediaTime(event.t); return <button className="event" key={event.id} aria-current={selected?.id === event.id} onClick={() => { selectEvent(event.id, time); if (video.current) video.current.currentTime = time / 1_000; }}><time>{(time / 1_000).toFixed(1)}s</time><span>{event.type}<br/><small>{event.target?.accessibleName || event.route}</small></span></button>; })}</aside>
    <section className="viewer" aria-label="Video preview"><VideoView video={video}/></section>
    <Timeline video={video}/>
  </main>;
}
