const STYLE = `
:root{--bg:#16181C;--surface:#1E2126;--line:#2C3037;--text:#C8CDD4;--dim:#727A85;--signal:#F2A63B;--danger:#C7524B}
*{box-sizing:border-box}html,body{height:100%;margin:0}body{display:grid;grid-template-rows:32px minmax(0,1fr);overflow:hidden;background:var(--bg);color:var(--text);font:12px/1.4 "IBM Plex Mono",monospace}
button,input,select,textarea{font:inherit;color:inherit}button,input,select,textarea{border:1px solid var(--line);background:var(--surface)}button{padding:5px 8px}button:disabled{color:var(--dim)}button:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible{outline:2px solid var(--text);outline-offset:2px}
header{display:flex;align-items:center;gap:8px;padding:0 10px;border-bottom:1px solid var(--line);letter-spacing:.03em}header .push{margin-left:auto;color:var(--dim)}
main{min-height:0;display:grid;grid-template-columns:240px minmax(0,1fr)300px}.events,.review{min-height:0;overflow:auto}.events{border-right:1px solid var(--line)}.review{border-left:1px solid var(--line);padding:10px}.label{margin:0;padding:9px 10px;border-bottom:1px solid var(--line);font-size:11px;font-weight:500;letter-spacing:.12em}
.event{width:100%;display:grid;grid-template-columns:54px 1fr;gap:7px;border:0;border-bottom:1px solid var(--line);background:transparent;padding:7px 10px;text-align:left}.event[aria-current=true],.event:hover{background:var(--surface)}.event time,.event small{color:var(--dim)}.event i{width:3px;height:9px;margin-top:3px;background:var(--signal)}
.viewer{min-width:0;min-height:0;display:grid;place-items:center;padding:20px;background:#121418}.stage{position:relative;max-width:100%;max-height:100%}.stage video{display:block;max-width:100%;max-height:calc(100vh - 72px)}#semantic-box{position:absolute;border:2px solid var(--signal);pointer-events:none;animation:measure 120ms steps(4,end)}
.review h2{margin:12px 0 6px;font-size:12px;font-weight:500;letter-spacing:.08em}.review h2:first-child{margin-top:0}.review p{margin:4px 0;color:var(--dim)}form{display:grid;gap:6px;margin:8px 0}input,select,textarea{width:100%;padding:6px}textarea{min-height:64px;resize:vertical}.state-actions{display:flex;flex-wrap:wrap;gap:5px}.state-actions button{font-size:11px}.comments,.members,.invitations{list-style:none;margin:0;padding:0}.comments li,.members li,.invitations li{padding:6px 0;border-bottom:1px solid var(--line)}.comments p{color:var(--text);white-space:pre-wrap}.comments small,.members small,.invitations small{color:var(--dim)}.invitations li{display:grid;grid-template-columns:1fr auto;gap:6px}.error{color:var(--danger)}[hidden]{display:none!important}
@keyframes measure{from{clip-path:inset(0 100% 0 0)}to{clip-path:inset(0)}}@media(prefers-reduced-motion:reduce){#semantic-box{animation:none}}
`;

const SCRIPT = `
const api='/api/recordings/'+recordingId;
const key='cutscene-review:'+recordingId;
const fragment=new URLSearchParams(location.hash.slice(1));
let token=fragment.get('token')||sessionStorage.getItem(key)||'';
let invitation=fragment.get('invite')||'';
let selectedEvent=null;
let eventPayload={capture:{width:1,height:1},events:[]};
const byId=(id)=>document.getElementById(id);
const error=byId('review-error');
if(token)sessionStorage.setItem(key,token);
if(location.hash)history.replaceState(null,'',location.pathname);

async function request(path,options={}){
  const headers={...(options.headers||{})};
  if(token)headers.authorization='Bearer '+token;
  const response=await fetch(api+path,{...options,headers});
  const type=response.headers.get('content-type')||'';
  const body=type.includes('application/json')?await response.json():null;
  if(!response.ok)throw new Error(body&&body.error?body.error:'Request failed ('+response.status+').');
  return body;
}

function showError(cause){error.textContent=cause instanceof Error?cause.message:String(cause);}
function clearError(){error.textContent='';}
function time(ms){return(ms/1000).toFixed(1)+'s';}

function drawBox(event){
  const box=byId('semantic-box');
  if(!event){box.hidden=true;return;}
  box.hidden=false;
  box.style.left=event.box.x/eventPayload.capture.width*100+'%';
  box.style.top=event.box.y/eventPayload.capture.height*100+'%';
  box.style.width=event.box.width/eventPayload.capture.width*100+'%';
  box.style.height=event.box.height/eventPayload.capture.height*100+'%';
}

async function renewPresence(resource){
  if(!token)return;
  try{
    const result=await request('/presence',{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({resource})});
    byId('lock').textContent=result.conflictMemberId?'Another member is editing this event.':'';
  }catch(cause){showError(cause);}
}

function selectEvent(event){
  selectedEvent=event;
  byId('review-video').currentTime=Math.max(0,event.mediaTimeMs/1000);
  drawBox(event);
  for(const button of document.querySelectorAll('.event'))button.setAttribute('aria-current',String(button.dataset.eventId===event.id));
  void renewPresence('event:'+event.id);
}

function renderEvents(){
  const list=byId('event-list');list.replaceChildren();
  for(const event of eventPayload.events){
    const button=document.createElement('button');button.className='event';button.dataset.eventId=event.id;button.type='button';
    const when=document.createElement('time');when.textContent=time(event.mediaTimeMs);
    const target=document.createElement('span');const tick=document.createElement('i');tick.setAttribute('aria-hidden','true');
    const name=document.createElement('span');name.textContent=event.name;target.append(tick,name);
    button.append(when,target);button.addEventListener('click',()=>selectEvent(event));list.append(button);
  }
}

async function loadEvents(){eventPayload=await request('/events');renderEvents();if(selectedEvent){const moved=eventPayload.events.find((event)=>event.id===selectedEvent.id);if(moved)selectEvent(moved);}}

function renderReview(review){
  byId('review-state').textContent=review.state.replaceAll('_',' ');
  const current=review.members.find((member)=>member.id===review.currentMemberId);
  byId('member-link-row').hidden=!current;byId('member-link').value=current?location.origin+location.pathname+'#token='+encodeURIComponent(token):'';
  const mayComment=current&&current.role!=='viewer';
  const mayApprove=current&&(current.role==='owner'||current.role==='editor');
  byId('comment-form').hidden=!mayComment;byId('state-actions').hidden=!mayApprove;byId('invitation-form').hidden=current?.role!=='owner';
  const active=review.presence.map((lease)=>review.members.find((member)=>member.id===lease.memberId)?.name).filter(Boolean);
  byId('presence').textContent=active.length?'Present: '+active.join(', '):'No other members present.';
  const members=byId('member-list');members.replaceChildren();
  for(const member of review.members){
    const item=document.createElement('li');item.textContent=member.name+' · '+member.role+' · '+member.scope;members.append(item);
  }
  const invitations=byId('invitation-list');invitations.replaceChildren();
  for(const invitation of review.invitations){
    const item=document.createElement('li');const detail=document.createElement('span');detail.textContent=invitation.role+' · '+invitation.scope+' · '+invitation.status;item.append(detail);
    if(invitation.status==='pending'){
      const revoke=document.createElement('button');revoke.type='button';revoke.textContent='Revoke';revoke.addEventListener('click',async()=>{
        clearError();try{await request('/invitations/'+encodeURIComponent(invitation.id),{method:'DELETE'});await loadReview();}catch(cause){showError(cause);}
      });item.append(revoke);
    }
    invitations.append(item);
  }
  const list=byId('comment-list');list.replaceChildren();
  for(const comment of review.comments){
    const item=document.createElement('li');const body=document.createElement('p');body.textContent=comment.event.body;
    const author=review.members.find((member)=>member.id===comment.authorId)?.name||'Unknown member';
    const detail=document.createElement('small');detail.textContent=author+' · '+comment.resolution.status+' · '+time(comment.resolution.mediaTimeMs);
    item.append(body,detail);list.append(item);
  }
}

async function loadReview(){if(!token)return;renderReview(await request('/review'));}
async function refresh(){clearError();try{await loadEvents();await loadReview();}catch(cause){showError(cause);}}

byId('join-form').hidden=!invitation||Boolean(token);
byId('join-form').addEventListener('submit',async(event)=>{
  event.preventDefault();clearError();
  try{
    const joined=await request('/join',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({invitationToken:invitation,name:byId('member-name').value})});
    token=joined.memberToken;invitation='';sessionStorage.setItem(key,token);byId('join-form').hidden=true;await refresh();
  }catch(cause){showError(cause);}
});

byId('invitation-form').addEventListener('submit',async(event)=>{
  event.preventDefault();clearError();
  try{
    const created=await request('/invitations',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({role:byId('invitation-role').value,scope:byId('invitation-scope').value})});
    byId('invitation-link').value=location.origin+location.pathname+'#invite='+encodeURIComponent(created.invitationToken);await loadReview();
  }catch(cause){showError(cause);}
});

byId('comment-form').addEventListener('submit',async(event)=>{
  event.preventDefault();clearError();
  if(!selectedEvent){showError(new Error('Select an event before commenting.'));return;}
  try{
    await request('/comments',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({eventId:selectedEvent.id,body:byId('comment-body').value})});
    byId('comment-body').value='';await loadReview();
  }catch(cause){showError(cause);}
});

for(const button of document.querySelectorAll('[data-state]'))button.addEventListener('click',async()=>{
  clearError();try{await request('/state',{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({state:button.dataset.state})});await loadReview();}catch(cause){showError(cause);}
});

byId('review-video').addEventListener('seeked',()=>{if(selectedEvent)drawBox(selectedEvent);});
void refresh();
setInterval(()=>void refresh(),1500);
setInterval(()=>void renewPresence(selectedEvent?'event:'+selectedEvent.id:null),10000);
`;

export function reviewPage(id: string): string {
  const encoded = encodeURIComponent(id);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Cutscene review</title><style>${STYLE}</style></head>` +
    `<body><header><strong>REVIEW</strong><span>${encoded}</span><span class="push">STATE</span><output id="review-state">view only</output></header>` +
    `<main><section class="events"><h1 class="label">EVENTS</h1><div id="event-list"></div></section>` +
    `<section class="viewer"><div class="stage"><video id="review-video" controls playsinline src="/api/recordings/${encoded}/media.webm"></video><div id="semantic-box" hidden></div></div></section>` +
    `<aside class="review"><h2>TEAM</h2><p id="presence">View only.</p><p id="lock"></p>` +
    `<form id="join-form" hidden><label for="member-name">Display name</label><input id="member-name" maxlength="80" required><button type="submit">Join review</button></form>` +
    `<ul id="member-list" class="members"></ul><p id="member-link-row" hidden><label for="member-link">Member editor link</label><input id="member-link" readonly></p><form id="invitation-form" hidden><label for="invitation-role">Invite role</label><select id="invitation-role"><option value="editor">Editor</option><option value="commenter">Commenter</option><option value="viewer">Viewer</option></select><label for="invitation-scope">Access</label><select id="invitation-scope"><option value="team">Team member</option><option value="project">This project only</option></select><button type="submit">Create invitation</button><label for="invitation-link">Invitation link</label><input id="invitation-link" readonly></form><ul id="invitation-list" class="invitations"></ul>` +
    `<div id="state-actions" class="state-actions" hidden><button type="button" data-state="in_review">Request review</button><button type="button" data-state="changes_requested">Request changes</button><button type="button" data-state="approved">Approve</button><button type="button" data-state="published">Publish</button></div>` +
    `<h2>COMMENTS</h2><ul id="comment-list" class="comments"></ul>` +
    `<form id="comment-form" hidden><label for="comment-body">Comment on selected event</label><textarea id="comment-body" maxlength="2000" required></textarea><button type="submit">Add comment</button></form>` +
    `<output id="review-error" class="error" aria-live="polite"></output></aside></main>` +
    `<script>const recordingId=${JSON.stringify(id)};${SCRIPT}</script></body></html>`;
}
