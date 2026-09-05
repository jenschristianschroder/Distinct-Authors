'use strict';

const API = 'https://arctic-shift.photon-reddit.com/api';
const $ = (id) => document.getElementById(id);
let currentAnalysis = null;

const POSITIVE = new Map(Object.entries({
  good:1,great:2,excellent:3,amazing:3,awesome:3,love:3,like:1,liked:1,fun:2,enjoy:2,enjoyed:2,better:1,best:3,improve:1,improved:2,improvement:2,helpful:2,useful:2,strong:1,balanced:1,fair:1,happy:2,worth:1,win:1,wins:1,winning:2,success:2,successful:2,excited:2,exciting:2,perfect:3,nice:1,solid:1,recommend:2,recommended:2,favorite:2,favourite:2,reasonable:1,glad:2,positive:2,benefit:1,beneficial:2,works:1,working:1,fix:1,fixed:2
}));
const NEGATIVE = new Map(Object.entries({
  bad:1,worse:2,worst:3,hate:3,hated:3,awful:3,terrible:3,boring:2,annoying:2,annoyed:2,broken:3,bug:1,bugs:1,buggy:2,unfair:2,expensive:2,greedy:2,frustrating:2,frustrated:2,disappointing:2,disappointed:2,problem:1,problems:1,issue:1,issues:1,nerf:1,nerfed:2,weak:1,useless:2,waste:2,scam:3,trash:3,garbage:3,ridiculous:2,impossible:2,slow:1,grind:1,grindy:2,paywall:3,p2w:3,negative:2,fail:2,fails:2,failure:2,remove:1,removed:1,quit:2,quitting:2
}));
const NEGATORS = new Set(['not','no','never','isnt','isn\'t','wasnt','wasn\'t','dont','don\'t','doesnt','doesn\'t','didnt','didn\'t','cant','can\'t','cannot','hardly','barely']);
const INTENSIFIERS = new Set(['very','really','extremely','super','so','too','incredibly','absolutely']);
const STOP = new Set(`the a an and or but if then than to of for from in on at by with about as is are was were be been being it its this that these those i me my we our you your he she they them their reddit post comment game just really very can could would should do does did have has had get got getting make makes made much many more most less least also only even still already now then when where why how what which who not no yes yeah yep one two three thing things something anything everything people player players time times way ways use used using like think know want need seems seem feel feels felt because because`.split(/\s+/));

function fmt(n, digits=0){ return Number(n).toLocaleString(undefined,{maximumFractionDigits:digits,minimumFractionDigits:digits}); }
function pct(a,b){ return b ? `${fmt(a/b*100,1)}%` : '0.0%'; }
function escapeHtml(s){ return String(s ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function localDateInput(d){ const y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,'0'),day=String(d.getDate()).padStart(2,'0'); return `${y}-${m}-${day}`; }
function setDefaults(){ const end=new Date(), start=new Date(end); start.setDate(start.getDate()-30); $('start').value=localDateInput(start); $('end').value=localDateInput(end); }
function log(s){ $('log').textContent += s+'\n'; $('log').scrollTop=$('log').scrollHeight; }
function showError(s){ $('error').textContent=s; $('error').classList.remove('hidden'); }
function setProgress(p,text){ $('progressWrap').classList.remove('hidden'); $('bar').style.width=`${Math.max(2,Math.min(100,p))}%`; $('status').textContent=text; }
function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }

async function fetchJson(url, timeout=50000){
  const ctl=new AbortController(); const timer=setTimeout(()=>ctl.abort(),timeout);
  try{ const r=await fetch(url,{signal:ctl.signal,headers:{Accept:'application/json'}}); if(!r.ok) throw new Error(`HTTP ${r.status}`); return await r.json(); }
  finally{ clearTimeout(timer); }
}
function unpack(payload){ if(Array.isArray(payload)) return payload; if(Array.isArray(payload?.data)) return payload.data; if(Array.isArray(payload?.results)) return payload.results; return []; }
function makeSlices(start,end,days){ const out=[]; let a=new Date(start+'T00:00:00Z'), finish=new Date(end+'T00:00:00Z'); while(a<finish){ const b=new Date(Math.min(a.getTime()+days*86400000,finish.getTime())); out.push([a.toISOString().slice(0,10),b.toISOString().slice(0,10)]); a=b;} return out; }

async function searchKind(kind, subreddit, topic, start, end, maxItems){
  const step=kind==='comments'?7:14, slices=makeSlices(start,end,step), out=new Map(); let done=0;
  for(const [after,before] of slices){
    if(out.size>=maxItems) break;
    const params=new URLSearchParams({subreddit,after,before,sort:'desc',limit:'auto'});
    if(kind==='posts') params.set('query',topic); else params.set('body',topic);
    params.set('fields', kind==='posts' ? 'id,author,created_utc,title,selftext,score,num_comments,url,permalink,subreddit' : 'id,author,created_utc,body,score,link_id,parent_id,subreddit');
    const url=`${API}/${kind}/search?${params}`;
    try{
      const rows=unpack(await fetchJson(url));
      for(const row of rows){ if(row?.id) out.set(row.id,row); if(out.size>=maxItems) break; }
      log(`${kind} ${after} → ${before}: ${rows.length} matches`);
    }catch(err){ log(`${kind} ${after} → ${before}: ${err.message}`); }
    done++; setProgress(8+done/(slices.length*2)*36,`Searching ${kind}… ${done}/${slices.length}`); await sleep(160);
  }
  return [...out.values()].slice(0,maxItems);
}

async function fetchLinkedPosts(comments){
  const ids=[...new Set(comments.map(c=>String(c.link_id||'').replace(/^t3_/, '')).filter(Boolean))].slice(0,500);
  const map=new Map();
  for(let i=0;i<ids.length;i+=100){
    const batch=ids.slice(i,i+100); const params=new URLSearchParams({ids:batch.join(','),fields:'id,author,created_utc,title,selftext,score,num_comments,url,permalink,subreddit'});
    try{ const rows=unpack(await fetchJson(`${API}/posts/ids?${params}`)); rows.forEach(p=>p?.id&&map.set(p.id,p)); log(`linked posts: ${rows.length}`); }catch(err){ log(`linked posts: ${err.message}`); }
    setProgress(50+Math.min(14,(i+batch.length)/Math.max(ids.length,1)*14),'Loading linked post popularity…'); await sleep(120);
  }
  return map;
}

function tokens(text){ return String(text||'').toLowerCase().replace(/https?:\/\/\S+/g,' ').replace(/[^a-z0-9'\s-]/g,' ').split(/\s+/).filter(Boolean); }
function sentiment(text){
  const t=tokens(text); let score=0, hits=0;
  for(let i=0;i<t.length;i++){
    const w=t[i], base=(POSITIVE.get(w)||0)-(NEGATIVE.get(w)||0); if(!base) continue;
    let mult=1; if(INTENSIFIERS.has(t[i-1])) mult=1.5; if(NEGATORS.has(t[i-1])||NEGATORS.has(t[i-2])) mult*=-1; score+=base*mult; hits++;
  }
  const normalized=hits?score/Math.sqrt(hits):0;
  const label=normalized>0.55?'positive':normalized<-0.55?'negative':'neutral';
  return {score:normalized,label,hits};
}
function itemText(item){ return item.kind==='post' ? `${item.title||''}. ${item.selftext||''}` : item.body||''; }
function dateOf(ts){ if(typeof ts==='number') return new Date((ts>1e12?ts:ts*1000)); return new Date(ts); }
function chooseBucket(start,end){ const choice=$('bucket').value; if(choice!=='auto') return choice; const days=(new Date(end)-new Date(start))/86400000; return days<=45?'day':days<=240?'week':'month'; }
function bucketKey(date, mode){ const d=new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth(),date.getUTCDate())); if(mode==='month') return d.toISOString().slice(0,7); if(mode==='week'){ const day=(d.getUTCDay()+6)%7; d.setUTCDate(d.getUTCDate()-day); return d.toISOString().slice(0,10); } return d.toISOString().slice(0,10); }
function enrich(posts,comments,linked){
  const all=[];
  posts.forEach(p=>all.push({...p,kind:'post',linkPost:p}));
  comments.forEach(c=>{ const pid=String(c.link_id||'').replace(/^t3_/,''); all.push({...c,kind:'comment',linkPost:linked.get(pid)||null}); });
  return all.map(item=>{ const s=sentiment(itemText(item)); return {...item,...s,createdDate:dateOf(item.created_utc),postScore:Number(item.linkPost?.score||0),postComments:Number(item.linkPost?.num_comments||0)}; });
}

function topVoices(items,label,kind){ const m=new Map(); items.filter(x=>x.label===label&&(!kind||x.kind===kind)).forEach(x=>m.set(x.author||'[deleted]',(m.get(x.author||'[deleted]')||0)+1)); return [...m.entries()].sort((a,b)=>b[1]-a[1]).slice(0,6); }
function voiceRows(rows){ return rows.length?rows.map(([a,n])=>`<div class="voice-row"><span>${escapeHtml(a)}</span><strong>${fmt(n)}</strong></div>`).join(''):'<span class="muted tiny">None in this sample.</span>'; }
function renderVoices(id,items,label){ const posts=topVoices(items,label,'post'),comments=topVoices(items,label,'comment'); $(id).innerHTML=`<div class="voice-kind"><div class="voice-kind-title">Post authors</div>${voiceRows(posts)}</div><div class="voice-kind"><div class="voice-kind-title">Commenters</div>${voiceRows(comments)}</div>`; }

function phraseCounts(items,topic){
  const topicWords=new Set(tokens(topic)); const counts=new Map();
  for(const item of items){ const arr=tokens(itemText(item)).filter(w=>w.length>2&&!STOP.has(w)&&!topicWords.has(w));
    for(let i=0;i<arr.length-1;i++){ const a=arr[i],b=arr[i+1]; if(a===b) continue; const phrase=`${a} ${b}`; counts.set(phrase,(counts.get(phrase)||0)+1); }
  }
  return [...counts.entries()].filter(([,n])=>n>=2).sort((a,b)=>b[1]-a[1]).slice(0,20);
}
function renderPhrases(rows){ $('phrases').innerHTML=rows.length?rows.map(([p,n])=>`<span class="phrase">${escapeHtml(p)} <strong>${n}</strong></span>`).join(''):'<span class="muted">No repeated phrases in this sample.</span>'; }

function popularityGroups(items){
  const scored=items.filter(x=>x.linkPost&&Number.isFinite(x.postScore)).sort((a,b)=>a.postScore-b.postScore); if(!scored.length) return [];
  const vals=scored.map(x=>x.postScore); const q=(p)=>vals[Math.min(vals.length-1,Math.floor((vals.length-1)*p))]; const q1=q(.25),q2=q(.5),q3=q(.75);
  const groups=[{name:`Bottom ≤ ${fmt(q1)}`,test:s=>s<=q1},{name:`Lower-mid`,test:s=>s>q1&&s<=q2},{name:`Upper-mid`,test:s=>s>q2&&s<=q3},{name:`Top > ${fmt(q3)}`,test:s=>s>q3}];
  return groups.map(g=>{ const rows=scored.filter(x=>g.test(x.postScore)); return {name:g.name,total:rows.length,positive:rows.filter(x=>x.label==='positive').length,neutral:rows.filter(x=>x.label==='neutral').length,negative:rows.filter(x=>x.label==='negative').length}; });
}

function renderStackedPercent(id, rows, xKey){
  const W=760,H=280,p={l:52,r:12,t:16,b:54},iw=W-p.l-p.r,ih=H-p.t-p.b,step=iw/Math.max(rows.length,1),bw=Math.max(16,Math.min(60,step*.68)); let grid='',bars='',labs='';
  [0,25,50,75,100].forEach(v=>{ const y=p.t+ih-(v/100)*ih; grid+=`<line x1="${p.l}" y1="${y}" x2="${W-p.r}" y2="${y}" stroke="var(--line)"/><text x="${p.l-8}" y="${y+4}" text-anchor="end" fill="var(--muted)" font-size="11">${v}%</text>`; });
  rows.forEach((r,i)=>{ const total=Math.max(r.total,1), vals=[['positive',r.positive/total*100,'#16a34a'],['neutral',r.neutral/total*100,'#94a3b8'],['negative',r.negative/total*100,'#dc2626']]; let acc=0,x=p.l+i*step+(step-bw)/2; vals.forEach(([name,v,c])=>{ const h=v/100*ih,y=p.t+ih-h-acc/100*ih; bars+=`<rect x="${x}" y="${y}" width="${bw}" height="${Math.max(h,0)}" rx="3" fill="${c}"><title>${escapeHtml(r[xKey])}: ${name} ${fmt(v,1)}%</title></rect>`; acc+=v; }); labs+=`<text x="${x+bw/2}" y="${H-18}" text-anchor="middle" fill="var(--muted)" font-size="10">${escapeHtml(r[xKey])}</text>`; });
  $(id).innerHTML=`<svg viewBox="0 0 ${W} ${H}">${grid}${bars}${labs}</svg>`;
}
function renderTimeline(items,mode){ const m=new Map(); items.forEach(x=>{ const k=bucketKey(x.createdDate,mode); if(!m.has(k))m.set(k,{period:k,total:0,positive:0,neutral:0,negative:0}); const r=m.get(k); r.total++; r[x.label]++; }); const rows=[...m.values()].sort((a,b)=>a.period.localeCompare(b.period)); renderStackedPercent('timelineChart',rows,'period'); return rows; }
function renderPopularity(groups){ renderStackedPercent('popularityChart',groups,'name'); }

function popularPosts(posts,linked){ const m=new Map(); [...posts,...linked.values()].forEach(p=>p?.id&&m.set(p.id,p)); return [...m.values()].sort((a,b)=>Number(b.score||0)-Number(a.score||0)).slice(0,10); }
function renderPopular(posts){ $('popularPosts').innerHTML=posts.length?posts.map(p=>`<div class="post-item"><div class="post-title">${escapeHtml(p.title||'(untitled)')}</div><div class="post-meta">score ${fmt(p.score||0)} · ${fmt(p.num_comments||0)} comments · u/${escapeHtml(p.author||'[deleted]')}</div></div>`).join(''):'<span class="muted">No linked post data.</span>'; }

function representative(items,label){ return items.filter(x=>x.label===label).sort((a,b)=>(Math.abs(b.score)*2+b.postScore/100)-(Math.abs(a.score)*2+a.postScore/100)).slice(0,4); }
function excerpt(text,n=260){ const s=String(text||'').replace(/\s+/g,' ').trim(); return s.length>n?s.slice(0,n-1)+'…':s; }
function renderEvidence(items){ const groups=['positive','neutral','negative']; $('evidenceGrid').innerHTML=groups.map(label=>{ const rows=representative(items,label); return `<div class="evidence-card"><strong class="${label}-text">${label[0].toUpperCase()+label.slice(1)}</strong>${rows.map(x=>`<p>“${escapeHtml(excerpt(itemText(x),180))}”</p><div class="evidence-meta">u/${escapeHtml(x.author||'[deleted]')} · ${x.kind} · post score ${fmt(x.postScore)}</div>`).join('')}</div>`; }).join(''); }

function buildLlmEvidence(items,phrases){
  const parts=[]; ['positive','neutral','negative'].forEach(label=>{ parts.push(`\n${label.toUpperCase()} EXCERPTS:`); representative(items,label).slice(0,6).forEach(x=>parts.push(`- u/${x.author||'[deleted]'} (${x.kind}, linked post score ${x.postScore}): ${excerpt(itemText(x),420)}`)); });
  parts.push(`\nCOMMON PHRASES: ${phrases.slice(0,15).map(([p,n])=>`${p} (${n})`).join(', ')}`); return parts.join('\n');
}

function normalizeBackendUrl(value){
  const raw=String(value||'').trim();
  if(!raw) return '';
  if(raw.startsWith('/')) return raw;
  try{
    const u=new URL(raw);
    if(!/^https?:$/.test(u.protocol)) return '';
    if(!u.pathname || u.pathname==='/') u.pathname='/api/summarize';
    return u.toString().replace(/\/$/,'');
  }catch{return '';}
}

function setLlmDefaults(){
  const backend=$('llmBackend'),token=$('llmToken');
  if(!backend||!token) return;
  const saved=localStorage.getItem('sentimentLlmBackend')||'';
  backend.value=saved || (location.hostname.endsWith('.vercel.app') ? '/api/summarize' : '');
  token.value=sessionStorage.getItem('sentimentAppToken')||'';
}

async function llmSummarize(){
  if(!currentAnalysis) return showError('Run a topic analysis first.');
  const endpoint=normalizeBackendUrl($('llmBackend').value),token=$('llmToken').value.trim();
  if(!endpoint) return showError('Enter your Vercel backend URL, for example https://your-project.vercel.app/api/summarize.');
  if(!token) return showError('Enter the backend access token you configured as APP_ACCESS_TOKEN in Vercel.');

  localStorage.setItem('sentimentLlmBackend',endpoint);
  sessionStorage.setItem('sentimentAppToken',token);
  $('llmButton').disabled=true;
  $('llmButton').textContent='Summarizing…';
  $('error').classList.add('hidden');

  const evidence=buildLlmEvidence(currentAnalysis.items,currentAnalysis.phrases);
  try{
    const r=await fetch(endpoint,{
      method:'POST',
      headers:{'Content-Type':'application/json','X-App-Token':token},
      body:JSON.stringify({
        subreddit:currentAnalysis.subreddit,
        topic:currentAnalysis.topic,
        dateRange:{start:currentAnalysis.start,end:currentAnalysis.end},
        evidence,
        popularityGroups:currentAnalysis.popGroups
      })
    });
    const j=await r.json().catch(()=>({}));
    if(!r.ok) throw new Error(j?.error||`Backend HTTP ${r.status}`);
    const text=String(j?.summary||'').trim();
    if(!text) throw new Error('No summary returned by the backend.');
    $('llmSummary').textContent=text;
    $('llmSummaryCard').classList.remove('hidden');
  }catch(err){showError(`AI summary failed: ${err.message}`);}
  finally{$('llmButton').disabled=false;$('llmButton').textContent='Summarize opinions with OpenAI';}
}

async function run(){
  const subreddit=$('subreddit').value.trim().replace(/^r\//i,''),topic=$('topic').value.trim(),start=$('start').value,end=$('end').value,maxItems=Number($('maxItems').value);
  if(!subreddit||!topic||!start||!end) return showError('Enter subreddit, topic, and both dates.'); if(start>=end) return showError('End date must be after start date.');
  $('run').disabled=true; $('error').classList.add('hidden'); $('log').textContent=''; $('llmSummaryCard').classList.add('hidden'); ['results','sentimentCharts','opinionsSection','voicesSection','evidenceSection','logPanel'].forEach(id=>$(id).classList.add('hidden')); setProgress(3,'Starting search…');
  try{
    const [posts,comments]=await Promise.all([searchKind('posts',subreddit,topic,start,end,maxItems),searchKind('comments',subreddit,topic,start,end,maxItems)]);
    setProgress(48,'Loading popularity context…'); const linked=await fetchLinkedPosts(comments); const items=enrich(posts,comments,linked); if(!items.length) throw new Error('No matching posts or comments found in this date range.');
    setProgress(70,'Computing sentiment and opinions…');
    const counts={positive:0,neutral:0,negative:0}; items.forEach(x=>counts[x.label]++); const authors=new Set(items.map(x=>x.author).filter(Boolean)); const phrases=phraseCounts(items,topic); const mode=chooseBucket(start,end); const timeline=renderTimeline(items,mode); const popGroups=popularityGroups(items); renderPopularity(popGroups);
    renderVoices('positiveVoices',items,'positive'); renderVoices('neutralVoices',items,'neutral'); renderVoices('negativeVoices',items,'negative'); renderPhrases(phrases); renderPopular(popularPosts(posts,linked)); renderEvidence(items);
    const postScores=[...new Map([...posts,...linked.values()].filter(p=>p?.id).map(p=>[p.id,p])).values()].map(p=>Number(p.score||0)); const avgScore=postScores.length?postScores.reduce((a,b)=>a+b,0)/postScores.length:0;
    $('summaryTitle').textContent=`“${topic}” in r/${subreddit}`; $('summaryRange').textContent=`${start} to ${end} · ${mode} sentiment buckets`; $('sampleMeta').textContent=`${fmt(posts.length)} posts · ${fmt(comments.length)} comments`;
    $('kpiItems').textContent=fmt(items.length); $('kpiItemsSub').textContent=`${fmt(posts.length)} matched posts + ${fmt(comments.length)} matched comments`; $('kpiPositive').textContent=fmt(counts.positive); $('kpiPositiveSub').textContent=pct(counts.positive,items.length); $('kpiNeutral').textContent=fmt(counts.neutral); $('kpiNeutralSub').textContent=pct(counts.neutral,items.length); $('kpiNegative').textContent=fmt(counts.negative); $('kpiNegativeSub').textContent=pct(counts.negative,items.length); $('kpiAuthors').textContent=fmt(authors.size); $('kpiPostScore').textContent=fmt(avgScore,1); $('timelineSubtitle').textContent=`Share of positive, neutral, and negative contributions by ${mode}.`;
    currentAnalysis={subreddit,topic,start,end,posts,comments,items,phrases,timeline,popGroups}; ['results','sentimentCharts','opinionsSection','voicesSection','evidenceSection','logPanel'].forEach(id=>$(id).classList.remove('hidden')); setProgress(100,'Finished.');
  }catch(err){ showError(`Could not complete analysis: ${err.message}`); setProgress(100,'Stopped.'); }
  finally{ $('run').disabled=false; }
}

$('run').addEventListener('click',run); $('llmButton').addEventListener('click',llmSummarize); setDefaults(); setLlmDefaults();
