import { useEffect, useRef, useState } from 'react';
import { readBundleFiles, type BundleFiles } from './bundle';
import { eventById, useEditorStore } from './store';
import { hasMeaningfulTraceEvents, isHumanEvent, Timeline } from './timeline';
import { VideoView } from './video';
import { exportRecording, type ExportFormat } from './export';
import { selectedBrandPreset } from './brand';
import { generatePlaywrightSkeleton, serializeSrt, serializeVtt, type Result } from '@cutscene/trace';
import { docsArchive, renderStepShots, screenshotsArchive } from './docs-export';
import { exportStepGifs } from './gif-export';
import { createShareLink, updateSharedRecording, type ShareLinks } from './share';
import { deriveInteractiveManifest, interactiveArchive } from './interactive';

export default function App() {
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [bundleFiles, setBundleFiles] = useState<BundleFiles | null>(null);
  const [sharing, setSharing] = useState(false);
  const [shareResult, setShareResult] = useState<Result<ShareLinks> | null>(null);
  const [updateResult, setUpdateResult] = useState<Result<string> | null>(null);
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
  const timelineSyncStatus = useEditorStore((state) => state.timelineSyncStatus);
  const connectSharedTimeline = useEditorStore((state) => state.connectSharedTimeline);
  const disconnectSharedTimeline = useEditorStore((state) => state.disconnectSharedTimeline);
  useEffect(() => () => { releaseMedia(); disconnectSharedTimeline(); }, [disconnectSharedTimeline, releaseMedia]);
  const loadFiles = async (files: readonly File[]) => {
    const result = await readBundleFiles(files);
    if (result.ok) {
      load(result.value, result.value.mediaUrl, result.value.files.media);
      setBundleFiles(result.value.files);
      setShareResult(null);
      setUpdateResult(null);
      setError(null);
    } else setError(result.error);
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
  const download = (blob: Blob, name: string) => {
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob); link.download = name; link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 60_000);
  };
  const zip = (data: Uint8Array, name: string) => download(new Blob([data as BlobPart], { type: 'application/zip' }), name);
  const text = (value: string, name: string) => download(new Blob([value], { type: 'text/plain' }), name);
  const runExport = async (format: ExportFormat) => {
    if (!media) return;
    setExport(0);
    try {
      const output = await exportRecording(media, format, segments, bundle.meta, callouts, bundle.events, bundle.clock,
        redactions, redactionBoxes, brand, cursorSettings,
        (value) => setExport(value));
      download(output, `${bundle.meta.recordingId}${format === 'vertical' ? '-9x16' : ''}.${format === 'gif' ? 'gif' : 'mp4'}`);
      setExport(null);
    } catch (cause: unknown) { setExport(null, cause instanceof Error ? cause.message : String(cause)); }
  };
  const runInteractive = async () => {
    if (!media) return;
    setExport(0);
    try {
      const output = await exportRecording(media, 'mp4', segments, bundle.meta, callouts, bundle.events, bundle.clock,
        redactions, redactionBoxes, brand, cursorSettings, (value) => setExport(value));
      const manifest = deriveInteractiveManifest(bundle.meta, bundle.events, bundle.clock, segments,
        brand?.intro.trim() ? 1_500 : 0);
      if (!manifest.ok) throw new Error(manifest.error);
      zip(await interactiveArchive(output, manifest.value), `${bundle.meta.recordingId}-interactive.zip`);
      setExport(null);
    } catch (cause: unknown) { setExport(null, cause instanceof Error ? cause.message : String(cause)); }
  };
  const exportSkeleton = () =>
    text(generatePlaywrightSkeleton({ meta: bundle.meta, events: bundle.events }), `${bundle.meta.recordingId}.spec.ts`);
  const exportCaptions = (format: 'srt' | 'vtt') => {
    if (captions.length === 0) return;
    text(format === 'srt' ? serializeSrt(captions) : serializeVtt(captions), `${bundle.meta.recordingId}.${format}`);
  };
  const runArtifacts = async (kind: 'docs' | 'screenshots') => {
    if (!video.current) return;
    setExport(0);
    try {
      const rendered = await renderStepShots(video.current, bundle.events, bundle.meta, (t) => bundle.clock.toMediaTime(t));
      const archive = kind === 'docs' ? docsArchive(rendered, bundle.meta) : screenshotsArchive(rendered);
      zip(archive, `${bundle.meta.recordingId}-${kind}.zip`);
      setExport(null);
    } catch (cause: unknown) { setExport(null, cause instanceof Error ? cause.message : String(cause)); }
  };
  const runStepGifs = async () => {
    if (!media) return;
    setExport(0);
    try {
      const { archive } = await exportStepGifs(media, segments, bundle.meta, bundle.events, bundle.clock,
        redactions, redactionBoxes, cursorSettings, (value) => setExport(value));
      zip(archive, `${bundle.meta.recordingId}-step-gifs.zip`);
      setExport(null);
    } catch (cause: unknown) { setExport(null, cause instanceof Error ? cause.message : String(cause)); }
  };
  const share = async () => {
    if (!bundleFiles) return;
    const server = window.prompt('Share server URL', 'http://localhost:4180');
    if (!server) return;
    setSharing(true);
    setShareResult(null);
    const result = await createShareLink(server, bundleFiles);
    setShareResult(result);
    if (result.ok) await connectSharedTimeline(result.value.ownerUrl);
    setSharing(false);
  };
  const updateShare = async () => {
    if (!bundleFiles) return;
    const ownerUrl = window.prompt('Owner review URL');
    if (!ownerUrl) return;
    setSharing(true);
    setUpdateResult(null);
    const result = await updateSharedRecording(ownerUrl, bundleFiles);
    setUpdateResult(result);
    if (result.ok) await connectSharedTimeline(result.value);
    setSharing(false);
  };
  return <main className="instrument">
    <header className="topbar"><span>{bundle.meta.recordingId}</span><span>·</span><span>{new URL(bundle.meta.url).host}</span><span>·</span><span>{bundle.meta.capture.width}×{bundle.meta.capture.height}</span><span>·</span><span>{(bundle.meta.media.durationMs / 1_000).toFixed(1)}s</span>{timelineSyncStatus.state !== 'idle' ? <span className={timelineSyncStatus.state === 'error' ? 'timeline-sync error' : 'timeline-sync'}>{timelineSyncStatus.state === 'error' ? timelineSyncStatus.error : `timeline ${timelineSyncStatus.state}`}</span> : null}<span className="push">{input('Load another recording')}</span><button disabled={sharing || !bundleFiles} onClick={() => void share()}>{sharing ? 'Publishing...' : 'Create share link'}</button><button disabled={sharing || !bundleFiles} onClick={() => void updateShare()}>Update shared demo</button><button disabled={exportProgress !== null} onClick={() => void runExport('gif')}>Export GIF</button><button disabled={exportProgress !== null} onClick={() => void runExport('mp4')}>Export MP4</button><button disabled={exportProgress !== null} onClick={() => void runInteractive()}>Export interactive demo</button><button disabled={exportProgress !== null} onClick={() => void runExport('vertical')}>Export 9:16 MP4</button><button disabled={exportProgress !== null || segments.length === 0} onClick={() => void runStepGifs()}>Export step GIFs</button><button disabled={exportProgress !== null} onClick={exportSkeleton}>Export Playwright skeleton</button><button disabled={exportProgress !== null} onClick={() => void runArtifacts('docs')}>Export docs</button><button disabled={exportProgress !== null} onClick={() => void runArtifacts('screenshots')}>Export screenshots</button><label className="file-label">Import captions<input type="file" accept=".srt,.vtt,.txt" onChange={(event) => { const file = event.currentTarget.files?.[0]; if (file) void file.text().then(loadCaptions); }}/></label><button disabled={captions.length === 0} onClick={() => exportCaptions('srt')}>Export SRT</button><button disabled={captions.length === 0} onClick={() => exportCaptions('vtt')}>Export VTT</button>{exportProgress !== null ? <span className="export-progress" style={{ width: `${exportProgress * 100}%` }}/> : null}</header>
    <aside className="events"><h2>EVENTS</h2>{hasMeaningfulTraceEvents(bundle.events) ? bundle.events.filter(isHumanEvent).map((event) => { const time = Math.max(0, bundle.clock.toMediaTime(event.t)); return <button className="event" key={event.id} aria-current={selected?.id === event.id} onClick={() => { selectEvent(event.id, time); if (video.current) video.current.currentTime = time / 1_000; }}><time>{(time / 1_000).toFixed(1)}s</time><span>{event.type}<br/><small>{event.target?.accessibleName || event.route}</small></span></button>; }) : <p className="no-events">No trace events captured. The page may render to a canvas, which cannot be traced.</p>}</aside>
    <section className="viewer" aria-label="Video preview"><VideoView video={video}/></section>
    <Timeline video={video}/>
    {captionError ? <output className="export-error">{captionError}</output> : null}
    {exportError ? <output className="export-error">{exportError}</output> : null}
    {shareResult?.ok ? <output className="share-result" aria-live="polite"><span>Reviewer</span><a href={shareResult.value.reviewerUrl} target="_blank" rel="noreferrer">{shareResult.value.reviewerUrl}</a><span>Owner</span><a href={shareResult.value.ownerUrl} target="_blank" rel="noreferrer">{shareResult.value.ownerUrl}</a><span>View</span><a href={shareResult.value.publicUrl} target="_blank" rel="noreferrer">{shareResult.value.publicUrl}</a></output> : null}
    {shareResult && !shareResult.ok ? <output className="export-error" aria-live="polite">{shareResult.error}</output> : null}
    {updateResult?.ok ? <output className="share-result" aria-live="polite">Shared demo updated <a href={updateResult.value} target="_blank" rel="noreferrer">Open owner review</a></output> : null}
    {updateResult && !updateResult.ok ? <output className="export-error" aria-live="polite">{updateResult.error}</output> : null}
  </main>;
}
