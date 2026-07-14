import { useRef, useState } from 'react';
import { readBundleFiles } from './bundle';
import { eventById, useEditorStore } from './store';
import { Timeline } from './timeline';
import { VideoView } from './video';
import { exportRecording, type ExportFormat } from './export';

export default function App() {
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const { bundle, mediaUrl, media, segments, selectedEventId, exportProgress, exportError, load, selectEvent, setExport } = useEditorStore();
  if (!bundle || !mediaUrl) return <main className="empty"><p>Record a tab to begin. Chrome only. Works on DOM-based pages.</p>
    <label className="file-label">Load recording bundle<input type="file" multiple accept=".webm,.json,.jsonl" onChange={async (event) => {
      const result = await readBundleFiles(Array.from(event.currentTarget.files ?? []));
      if (result.ok) { load(result.value, result.value.mediaUrl, result.value.media); setError(null); } else setError(result.error);
    }}/></label>{error ? <output className="error">{error}</output> : null}</main>;
  const selected = eventById(bundle.events, selectedEventId);
  const runExport = async (format: ExportFormat) => {
    if (!media) return;
    setExport(0);
    try {
      const output = await exportRecording(media, format, segments, bundle.meta, (value) => setExport(value));
      const link = document.createElement('a'); link.href = URL.createObjectURL(output); link.download = `${bundle.meta.recordingId}.${format}`; link.click();
      setTimeout(() => URL.revokeObjectURL(link.href), 60_000); setExport(null);
    } catch (cause: unknown) { setExport(null, cause instanceof Error ? cause.message : String(cause)); }
  };
  return <main className="instrument">
    <header className="topbar"><span>{bundle.meta.recordingId}</span><span>·</span><span>{new URL(bundle.meta.url).host}</span><span>·</span><span>{bundle.meta.capture.width}×{bundle.meta.capture.height}</span><span>·</span><span>{(bundle.meta.media.durationMs / 1_000).toFixed(1)}s</span><button className="push" disabled={exportProgress !== null} onClick={() => void runExport('gif')}>Export GIF</button><button disabled={exportProgress !== null} onClick={() => void runExport('mp4')}>Export MP4</button>{exportProgress !== null ? <span className="export-progress" style={{ width: `${exportProgress * 100}%` }}/> : null}</header>
    <aside className="events"><h2>EVENTS</h2>{bundle.events.map((event) => { const time = bundle.clock.toMediaTime(event.t); return <button className="event" key={event.id} aria-current={selected?.id === event.id} onClick={() => { selectEvent(event.id, time); if (video.current) video.current.currentTime = time / 1_000; }}><time>{(time / 1_000).toFixed(1)}s</time><span>{event.type}<br/><small>{event.target?.accessibleName || event.route}</small></span></button>; })}</aside>
    <section className="viewer" aria-label="Video preview"><VideoView video={video}/></section>
    <Timeline video={video}/>
    {exportError ? <output className="export-error">{exportError}</output> : null}
  </main>;
}
