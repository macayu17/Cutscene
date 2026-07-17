import type { InteractiveManifest } from './interactive';

export function renderInteractivePlayer(manifest: InteractiveManifest): string {
  const data = JSON.stringify(manifest).replaceAll('<', '\\u003c');
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Cutscene interactive demo</title>
  <style>
    :root{color-scheme:dark;--bg:#16181c;--surface:#1e2126;--line:#2c3037;--text:#c8cdd4;--dim:#727a85;--signal:#f2a63b;--danger:#c7524b}
    *{box-sizing:border-box}html,body{margin:0;min-height:100%;background:#101216;color:var(--text);font:12px/1.4 "IBM Plex Mono",ui-monospace,monospace}
    body{display:grid;place-items:center;padding:24px}.player{width:min(1280px,100%);border:1px solid var(--line);background:var(--bg)}
    header,footer{min-height:34px;display:flex;align-items:center;gap:9px;padding:0 12px;letter-spacing:.02em}header{border-bottom:1px solid var(--line)}
    header span:last-child{margin-left:auto}.stage{position:relative;aspect-ratio:16/9;margin:22px;background:#08090b;overflow:hidden;border:1px solid #252931}
    video{display:block;width:100%;height:100%;object-fit:fill}.hotspot{position:absolute;padding:0;appearance:none;background:transparent;border:2px solid var(--signal);outline:1px solid #0009;cursor:pointer}
    .hotspot:focus-visible{outline:2px solid #fff;outline-offset:3px}.target-label{position:absolute;right:-2px;top:-23px;padding:3px 6px;background:var(--signal);color:var(--bg);font:10px/1.3 inherit;letter-spacing:.08em;white-space:nowrap}
    .panel{position:absolute;inset:0;display:grid;place-items:center;background:#08090bcc}.panel[hidden],.hotspot[hidden]{display:none}.panel-box{display:grid;gap:14px;justify-items:center;padding:24px;background:var(--bg);border:1px solid var(--line)}
    button{border:1px solid #454b55;background:var(--surface);color:var(--text);font:inherit;padding:7px 11px;cursor:pointer}button:hover{border-color:#69717e}button:focus-visible{outline:2px solid #fff;outline-offset:2px}
    .progress{height:3px;background:var(--line)}.progress span{display:block;width:0;height:100%;background:var(--signal)}footer{min-height:52px;border-top:1px solid var(--line);color:var(--dim)}
    #prompt{margin:auto;color:var(--text)}#restart{margin-left:auto}.error{display:block;min-height:18px;padding:0 12px 10px;color:var(--danger)}
    @media (prefers-reduced-motion:reduce){*{scroll-behavior:auto!important}}
  </style>
</head>
<body>
  <main class="player">
    <header><span>CUTSCENE</span><span>/</span><span id="recording"></span><span id="step-heading"></span></header>
    <section class="stage" id="stage">
      <video id="video" src="demo.mp4" preload="auto"></video>
      <button class="hotspot" id="hotspot" hidden><span class="target-label" id="target-label"></span></button>
      <div class="panel" id="start-panel"><div class="panel-box"><span>READY</span><button id="start">Start demo</button></div></div>
      <div class="panel" id="complete-panel" hidden><div class="panel-box"><span>DEMO COMPLETE</span><button id="replay">Replay</button></div></div>
    </section>
    <div class="progress"><span id="progress"></span></div>
    <footer><span id="count"></span><span id="prompt">Select Start demo</span><button id="restart">Restart</button></footer>
    <output class="error" id="error" aria-live="polite"></output>
  </main>
  <script id="manifest" type="application/json">${data}</script>
  <script>
    const manifest=JSON.parse(document.querySelector('#manifest').textContent);
    const video=document.querySelector('#video'),stage=document.querySelector('#stage'),hotspot=document.querySelector('#hotspot');
    const startPanel=document.querySelector('#start-panel'),completePanel=document.querySelector('#complete-panel');
    const prompt=document.querySelector('#prompt'),count=document.querySelector('#count'),progress=document.querySelector('#progress');
    const heading=document.querySelector('#step-heading'),label=document.querySelector('#target-label'),error=document.querySelector('#error');
    let index=0,run=0,finishing=false;

    document.querySelector('#recording').textContent=manifest.recordingId;
    const setStatus=()=>{
      count.textContent=index+' / '+manifest.steps.length+' COMPLETE';
      heading.textContent=index<manifest.steps.length?'STEP '+String(index+1).padStart(2,'0')+' / '+String(manifest.steps.length).padStart(2,'0'):'COMPLETE';
      progress.style.width=(manifest.steps.length?index/manifest.steps.length*100:0)+'%';
    };
    const hideTarget=()=>{hotspot.hidden=true};
    const showError=(message)=>{run+=1;video.pause();hideTarget();error.textContent=message;prompt.textContent='PLAYBACK STOPPED'};
    const showTarget=(step)=>{
      const box=step.box;
      hotspot.style.left=box.x/manifest.width*100+'%';hotspot.style.top=box.y/manifest.height*100+'%';
      hotspot.style.width=box.width/manifest.width*100+'%';hotspot.style.height=box.height/manifest.height*100+'%';
      hotspot.setAttribute('aria-label','Click '+step.label);label.textContent='CLICK '+step.label.toUpperCase();
      prompt.textContent='Click '+step.label+' to continue';hotspot.hidden=false;hotspot.focus();
    };
    const watch=(token)=>{
      if(token!==run||video.paused)return;
      const step=manifest.steps[index];
      if(!step)return;
      if(video.currentTime*1000+0.5>=step.timeMs){video.pause();video.currentTime=step.timeMs/1000;showTarget(step);return}
      if('requestVideoFrameCallback' in video)video.requestVideoFrameCallback(()=>watch(token));
    };
    const playToStep=async()=>{
      hideTarget();error.textContent='';completePanel.hidden=true;startPanel.hidden=true;finishing=false;
      const step=manifest.steps[index];
      if(!step)return;
      prompt.textContent='Playing to step '+(index+1);
      const token=++run;
      try{await video.play();if('requestVideoFrameCallback' in video)video.requestVideoFrameCallback(()=>watch(token))}
      catch{showError('Playback could not start. Select Start demo again.')}
    };
    const begin=()=>{video.pause();video.currentTime=0;index=0;setStatus();void playToStep()};
    const reset=()=>{run+=1;finishing=false;video.pause();video.currentTime=0;index=0;hideTarget();completePanel.hidden=true;startPanel.hidden=false;error.textContent='';prompt.textContent='Select Start demo';setStatus()};
    const complete=()=>{run+=1;finishing=false;progress.style.width='100%';heading.textContent='COMPLETE';prompt.textContent='Demo complete';completePanel.hidden=false};

    document.querySelector('#start').addEventListener('click',begin);
    document.querySelector('#restart').addEventListener('click',reset);
    document.querySelector('#replay').addEventListener('click',begin);
    hotspot.addEventListener('click',(event)=>{
      event.stopPropagation();hideTarget();index+=1;setStatus();
      if(index<manifest.steps.length){void playToStep();return}
      prompt.textContent='Finishing demo';finishing=true;const token=++run;
      video.play().catch(()=>showError('Playback could not start. Select Restart.'));
    });
    stage.addEventListener('click',()=>{
      if(hotspot.hidden)return;
      hotspot.focus();
      if(!matchMedia('(prefers-reduced-motion: reduce)').matches)hotspot.animate([{outlineColor:'transparent'},{outlineColor:'#f2a63b'}],{duration:120});
    });
    video.addEventListener('timeupdate',()=>{if(!('requestVideoFrameCallback' in video))watch(run)});
    video.addEventListener('ended',()=>{if(finishing)complete()});
    video.addEventListener('error',()=>showError('Video could not be loaded. Keep index.html and demo.mp4 in the same folder.'));
    if(manifest.steps.length===0){startPanel.hidden=true;showError('This demo has no clickable steps.')}else setStatus();
  </script>
</body>
</html>`;
}
