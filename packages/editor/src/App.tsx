import { useEffect, useRef, useState } from 'react';
import { readBundleFiles } from './bundle';
import { eventById, useEditorStore } from './store';
import { hasMeaningfulTraceEvents, isHumanEvent, Timeline } from './timeline';
import { VideoView } from './video';
import { exportRecording, type ExportFormat } from './export';
import { selectedBrandPreset } from './brand';
import { generatePlaywrightSkeleton, serializeSrt, serializeVtt } from '@cutscene/trace';
import { docsArchive, renderStepShots, screenshotsArchive } from './docs-export';

export default function App() {
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const bundle = useEditorStore((state) => state.bundle);
  const mediaUrl = useEditorStore((state) => state.mediaUrl);
  const media = useEditorStore((state) => state.media);
  const segments = useEditorStore((state) => state.segments);
  const callouts = useEditorStore((state) => state.callouts);
  const redactions = useEditorStore((state) => state.redactions);
  const redactionBoxes = useEditorStore((state) => state.redactionBoxes);
  const brand = useEditorStore(selectedBrandPreset);
  const cursorSettings = useEditorStore((state) => state.cursorSettings);
  const captions = useEditorStore((state) => state.captions);
  const captionError = useEditorStore((state) => state.captionError);
  const loadCaptions = useEditorStore((state) => state.loadCaptions);
  const selectedEventId = useEditorStore((state) => state.selectedEventId);
  const exportProgress = useEditorStore((state) => state.exportProgress);
  const exportError = useEditorStore((state) => state.exportError);
  const load = useEditorStore((state) => state.load);
  const releaseMedia = useEditorStore((state) => state.releaseMedia);
  const selectEvent = useEditorStore((state) => state.selectEvent);
  const setExport = useEditorStore((state) => state.setExport);
  useEffect(() => releaseMedia, [releaseMedia]);
  const loadFiles = async (files: readonly File[]) => {
    const result = await readBundleFiles(files);
    if (result.ok) { load(result.value, result.value.mediaUrl, result.value.media); setError(null); } else setError(result.error);
  };
  const input = (label: string) => <label className="file-label">{label}<input type="file" multiple accept=".webm,.json,.jsonl"
    {...{ webkitdirectory: '' }} onChange={(event) => void loadFiles(Array.from(event.currentTarget.files ?? []))}/></label>;
  if (!bundle || !mediaUrl) return <main className="empty" onDragOver={(event) => event.preventDefault()}
    onDrop={(event) => { event.preventDefault(); void loadFiles(Array.from(event.dataTransfer.files)); }}>
    <h1>NO RECORDING LOADED</h1>
    <p>Choose the folder created by the Cutscene extension.</p>
    <code>media.webm · trace.jsonl · meta.json</code>
    {input('Choose recording folder')}
    <small>or drop the three files anywhere here</small>
    {error ? <output className="error">{error}</output> : null}
  </main>;
  const selected = eventById(bundle.events, selectedEventId);
  const runExport = async (format: ExportFormat) => {
    if (!media) return;
    setExport(0);
    try {
      const output = await exportRecording(media, format, segments, bundle.meta, callouts, bundle.events, bundle.clock,
        redactions, redactionBoxes, brand, cursorSettings,
        (value) => setExport(value));
      const link = document.createElement('a'); link.href = URL.createObjectURL(output);
      link.download = `${bundle.meta.recordingId}${format === 'vertical' ? '-9x16' : ''}.${format === 'gif' ? 'gif' : 'mp4'}`; link.click();
      setTimeout(() => URL.revokeObjectURL(link.href), 60_000); setExport(null);
    } catch (cause: unknown) { setExport(null, cause instanceof Error ? cause.message : String(cause)); }
  };
  const exportSkeleton = () => {
    const source = generatePlaywrightSkeleton({ meta: bundle.meta, events: bundle.events });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([source], { type: 'text/plain' }));
    link.download = `${bundle.meta.recordingId}.spec.ts`; link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 60_000);
  };
  const download = (data: Uint8Array, name: string) => {
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([data as BlobPart], { type: 'application/zip' }));
    link.download = name; link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 60_000);
  };
  const exportCaptions = (format: 'srt' | 'vtt') => {
    if (captions.length === 0) return;
    const text = format === 'srt' ? serializeSrt(captions) : serializeVtt(captions);
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
    link.download = `${bundle.meta.recordingId}.${format}`; link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 60_000);
  };
  const runArtifacts = async (kind: 'docs' | 'screenshots') => {
    if (!video.current) return;
    setExport(0);
    try {
      const rendered = await renderStepShots(video.current, bundle.events, bundle.meta, (t) => bundle.clock.toMediaTime(t));
      const archive = kind === 'docs' ? docsArchive(rendered, bundle.meta) : screenshotsArchive(rendered);
      download(archive, `${bundle.meta.recordingId}-${kind}.zip`);
      setExport(null);
    } catch (cause: unknown) { setExport(null, cause instanceof Error ? cause.message : String(cause)); }
  };
  return <main className="instrument">
    <header className="topbar"><span>{bundle.meta.recordingId}</span><span>·</span><span>{new URL(bundle.meta.url).host}</span><span>·</span><span>{bundle.meta.capture.width}×{bundle.meta.capture.height}</span><span>·</span><span>{(bundle.meta.media.durationMs / 1_000).toFixed(1)}s</span><span className="push">{input('Load another recording')}</span><button disabled={exportProgress !== null} onClick={() => void runExport('gif')}>Export GIF</button><button disabled={exportProgress !== null} onClick={() => void runExport('mp4')}>Export MP4</button><button disabled={exportProgress !== null} onClick={() => void runExport('vertical')}>Export 9:16 MP4</button><button disabled={exportProgress !== null} onClick={exportSkeleton}>Export Playwright skeleton</button><button disabled={exportProgress !== null} onClick={() => void runArtifacts('docs')}>Export docs</button><button disabled={exportProgress !== null} onClick={() => void runArtifacts('screenshots')}>Export screenshots</button><label className="file-label">Import captions<input type="file" accept=".srt,.vtt,.txt" onChange={(event) => { const file = event.currentTarget.files?.[0]; if (file) void file.text().then(loadCaptions); }}/></label><button disabled={captions.length === 0} onClick={() => exportCaptions('srt')}>Export SRT</button><button disabled={captions.length === 0} onClick={() => exportCaptions('vtt')}>Export VTT</button>{exportProgress !== null ? <span className="export-progress" style={{ width: `${exportProgress * 100}%` }}/> : null}</header>
    <aside className="events"><h2>EVENTS</h2>{hasMeaningfulTraceEvents(bundle.events) ? bundle.events.filter(isHumanEvent).map((event) => { const time = Math.max(0, bundle.clock.toMediaTime(event.t)); return <button className="event" key={event.id} aria-current={selected?.id === event.id} onClick={() => { selectEvent(event.id, time); if (video.current) video.current.currentTime = time / 1_000; }}><time>{(time / 1_000).toFixed(1)}s</time><span>{event.type}<br/><small>{event.target?.accessibleName || event.route}</small></span></button>; }) : <p className="no-events">No trace events captured. The page may render to a canvas, which cannot be traced.</p>}</aside>
    <section className="viewer" aria-label="Video preview"><VideoView video={video}/></section>
    <Timeline video={video}/>
    {captionError ? <output className="export-error">{captionError}</output> : null}
    {exportError ? <output className="export-error">{exportError}</output> : null}
  </main>;
}
