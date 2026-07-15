import { mapBoxToCapture, scrollMatches } from '@cutscene/trace';
import { useEffect, useMemo, useRef, type RefObject } from 'react';
import { eventById, useEditorStore } from './store';
import { cameraAt, cameraMatrix } from './camera';
import { pageEventAt } from './bundle';
import { activeCallout, calloutLayout, calloutSize } from './callouts';
import { redactionBoxesAt } from './redactions';
import { brandFontFamily, selectedBrandPreset, watermarkLayout } from './brand';
import { cursorAt, deriveCursorSamples, mapCursorToOutput, smoothCursorSamples } from './cursor';

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

function CalloutOverlay() {
  const bundle = useEditorStore((state) => state.bundle);
  const callouts = useEditorStore((state) => state.callouts);
  const segments = useEditorStore((state) => state.segments);
  const playheadMs = useEditorStore((state) => state.playheadMs);
  if (!bundle) return null;
  const callout = activeCallout(callouts, segments, bundle.events, bundle.clock, playheadMs);
  const event = callout ? eventById(bundle.events, callout.sourceEventId) : null;
  const segment = callout ? segments.find(({ eventId }) => eventId === callout.sourceEventId) : null;
  const output = { width: 1_000, height: 1_000 * bundle.meta.capture.height / bundle.meta.capture.width };
  const layout = event && segment ? calloutLayout(event, segment, bundle.meta.capture, output, calloutSize(output)) : null;
  if (!callout || !layout) return null;
  return <div className="callout-overlay" style={{ left: `${layout.card.x / output.width * 100}%`,
    top: `${layout.card.y / output.height * 100}%`, width: `${layout.card.width / output.width * 100}%`,
    height: `${layout.card.height / output.height * 100}%` }}>{callout.text}</div>;
}

function RedactionOverlay() {
  const bundle = useEditorStore((state) => state.bundle);
  const redactions = useEditorStore((state) => state.redactions);
  const redactionBoxes = useEditorStore((state) => state.redactionBoxes);
  const playheadMs = useEditorStore((state) => state.playheadMs);
  if (!bundle) return null;
  return redactionBoxesAt(redactionBoxes, redactions, playheadMs).map((sample) => {
    const box = mapBoxToCapture(sample.box, sample.viewport, bundle.meta.capture);
    return <div key={`${sample.selector}\0${sample.instanceId}`} className="redaction-overlay" style={{
      left: `${box.x / bundle.meta.capture.width * 100}%`, top: `${box.y / bundle.meta.capture.height * 100}%`,
      width: `${box.width / bundle.meta.capture.width * 100}%`, height: `${box.height / bundle.meta.capture.height * 100}%`,
    }}/>;
  });
}

export function VideoView({ video }: { video: RefObject<HTMLVideoElement | null> }) {
  const bundle = useEditorStore((state) => state.bundle);
  const mediaUrl = useEditorStore((state) => state.mediaUrl);
  const segments = useEditorStore((state) => state.segments);
  const setPlayhead = useEditorStore((state) => state.setPlayhead);
  const cursorSettings = useEditorStore((state) => state.cursorSettings);
  const brand = useEditorStore(selectedBrandPreset);
  const transform = useRef<HTMLDivElement>(null);
  const cursor = useRef<SVGSVGElement>(null);
  const ripple = useRef<HTMLDivElement>(null);
  const cursorSamples = useMemo(() => bundle ? smoothCursorSamples(
    deriveCursorSamples(bundle.events, bundle.clock, bundle.meta.capture), cursorSettings.smoothing) : [],
  [bundle, cursorSettings.smoothing]);
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
      const cursorFrame = cursorAt(cursorSamples, timeMs, cursorSettings);
      const point = cursorFrame ? mapCursorToOutput(cursorFrame, camera, bundle.meta.capture,
        { width: surface.clientWidth, height: surface.clientHeight }) : null;
      if (cursor.current) {
        cursor.current.style.display = !point || !cursorFrame?.visible ? 'none' : '';
        if (point) {
          cursor.current.style.left = `${point.x}px`;
          cursor.current.style.top = `${point.y}px`;
          cursor.current.style.width = `${cursorSettings.size}px`;
          cursor.current.style.height = `${cursorSettings.size * 1.2}px`;
        }
      }
      if (ripple.current) {
        const progress = cursorFrame?.visible ? cursorFrame.rippleProgress : null;
        ripple.current.hidden = !point || progress === null;
        if (point && progress !== null) {
          ripple.current.style.left = `${point.x}px`;
          ripple.current.style.top = `${point.y}px`;
          ripple.current.style.width = `${cursorSettings.size}px`;
          ripple.current.style.height = `${cursorSettings.size}px`;
          ripple.current.style.opacity = `${1 - progress}`;
          ripple.current.style.transform = `translate(-50%, -50%) scale(${1 + progress})`;
        }
      }
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
  }, [bundle, cursorSamples, cursorSettings, mediaUrl, segments, setPlayhead, video]);
  if (!bundle || !mediaUrl) return null;
  const watermark = watermarkLayout(bundle.meta.capture);
  return <div className="video-stage" style={{ aspectRatio: `${bundle.meta.capture.width}/${bundle.meta.capture.height}` }}>
    <div ref={transform} className="video-transform">
      <video ref={video} src={mediaUrl} controls/>
      <RedactionOverlay/>
      <SemanticBox/>
    </div>
    <CalloutOverlay/>
    <div ref={ripple} className="cursor-ripple" hidden/>
    <svg ref={cursor} className="preview-cursor" viewBox="0 0 24 30" aria-hidden="true" style={{ display: 'none' }}>
      <path d="M0 0L0 25L6.8 18.6L11.4 28L16.2 25.6L11.6 16.3L21 15.2Z"/>
    </svg>
    {brand?.watermark ? <div className="brand-watermark" style={{ color: brand.color, fontFamily: brandFontFamily(brand.font),
      left: `${watermark.x / bundle.meta.capture.width * 100}%`, top: `${watermark.y / bundle.meta.capture.height * 100}%`,
      width: `${watermark.width / bundle.meta.capture.width * 100}%`, height: `${watermark.height / bundle.meta.capture.height * 100}%` }}>{brand.watermark}</div> : null}
  </div>;
}
