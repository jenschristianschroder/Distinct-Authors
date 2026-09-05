'use strict';

const $ = id => document.getElementById(id);

function escapeHtml(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function fmt(value,digits=0){return Number(value||0).toLocaleString(undefined,{maximumFractionDigits:digits,minimumFractionDigits:digits});}
function pct(value,total){return total?`${fmt(value/total*100,1)}%`:'0.0%';}
function localDateInput(date){const y=date.getFullYear(),m=String(date.getMonth()+1).padStart(2,'0'),d=String(date.getDate()).padStart(2,'0');return `${y}-${m}-${d}`;}
function showError(message){$('error').textContent=message;$('error').classList.remove('hidden');}
function setProgress(percent,text){$('progressWrap').classList.remove('hidden');$('bar').style.width=`${Math.max(2,Math.min(100,percent))}%`;$('status').textContent=text;}

function setDefaults(){
  const end=new Date();
  const start=new Date(end);start.setDate(start.getDate()-13);
  $('start').value=localDateInput(start);$('end').value=localDateInput(end);
  const params=new URLSearchParams(location.search);
  if(params.get('subreddit'))$('subreddit').value=params.get('subreddit');
  if(/^\d{4}-\d{2}-\d{2}$/.test(params.get('start')||''))$('start').value=params.get('start');
  if(/^\d{4}-\d{2}-\d{2}$/.test(params.get('end')||''))$('end').value=params.get('end');
  if(params.get('focus')&&$('focusKeywords'))$('focusKeywords').value=params.get('focus').slice(0,240);
}

function normalizeBackendUrl(value){
  const raw=String(value||'').trim();if(!raw)return'';
  if(raw.startsWith('/'))return'/api/topics';
  try{
    const url=new URL(raw);
    if(!/^https?:$/.test(url.protocol))return'';
    if(!url.pathname||url.pathname==='/')url.pathname='/api/topics';
    else if(url.pathname.includes('/api/'))url.pathname='/api/topics';
    else url.pathname=url.pathname.replace(/\/$/,'')+'/api/topics';
    return url.toString().replace(/\/$/,'');
  }catch{return'';}
}

function setConnectionDefaults(){
  const defaultUrl=location.hostname.endsWith('.vercel.app')?'/api/topics':'https://distinct-authors.vercel.app/api/topics';
  try{$('backend').value=localStorage.getItem('topicsBackend')||defaultUrl;}catch{$('backend').value=defaultUrl;}
  try{$('token').value=sessionStorage.getItem('sentimentAppToken')||'';}catch{}
}

async function backendAnalyze(payload){
  const endpoint=normalizeBackendUrl($('backend').value),token=$('token').value.trim();
  if(!endpoint)throw new Error('Enter a valid Vercel backend URL.');
  if(!token)throw new Error('Enter the APP_ACCESS_TOKEN configured in Vercel.');
  try{localStorage.setItem('topicsBackend',endpoint);sessionStorage.setItem('sentimentAppToken',token);}catch{}
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),90000);
  try{
    const response=await fetch(endpoint,{method:'POST',signal:controller.signal,headers:{'Content-Type':'application/json','X-App-Token':token},body:JSON.stringify(payload)});
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(data?.error||`Backend HTTP ${response.status}`);
    return data;
  }finally{clearTimeout(timer);}
}

function renderOverview(data){
  $('overview').textContent=data.overview||'No overview returned.';
  const patterns=Array.isArray(data.cross_topic_patterns)?data.cross_topic_patterns:[];
  $('patterns').innerHTML=patterns.map(item=>`<div class="pattern-item">${escapeHtml(item)}</div>`).join('');
}

function renderShare(topics){
  const max=Math.max(1,...topics.map(topic=>Number(topic.share||0)));
  $('topicShare').innerHTML=topics.map(topic=>`<div class="topic-bar-row"><div class="topic-bar-head"><strong>${escapeHtml(topic.name)}</strong><span>${fmt(topic.contributions)} contributions · ${fmt(Number(topic.share||0)*100,1)}%</span></div><div class="topic-bar-track"><div class="topic-bar-fill" style="width:${Math.max(2,Number(topic.share||0)/max*100)}%"></div></div></div>`).join('');
}

function renderTopicSentiment(topics){
  $('topicSentiment').innerHTML=topics.map(topic=>{
    const s=topic.sentiment||{},total=Math.max(1,Number(topic.contributions||0));
    const p=Number(s.positive||0)/total*100,n=Number(s.neutral||0)/total*100,g=Number(s.negative||0)/total*100;
    return `<div class="sentiment-topic"><div class="sentiment-topic-head"><strong>${escapeHtml(topic.name)}</strong><span>${fmt(p,0)}% + · ${fmt(n,0)}% neutral · ${fmt(g,0)}% −</span></div><div class="sentiment-track"><span class="sentiment-positive" style="width:${p}%"></span><span class="sentiment-neutral" style="width:${n}%"></span><span class="sentiment-negative" style="width:${g}%"></span></div></div>`;
  }).join('');
}

function voiceRows(rows){
  return rows?.length?rows.map(row=>`<div class="voice-row"><span>u/${escapeHtml(row.author)}</span><b>${fmt(row.count)}</b></div>`).join(''):'<span class="muted tiny">No resolved names.</span>';
}

function drillUrl(data,topic){
  const params=new URLSearchParams({subreddit:data.subreddit,topic:topic.name,start:data.start,end:data.end});
  return `sentiment.html?${params.toString()}`;
}

function renderTopicCards(data){
  $('topicCards').innerHTML=(data.topics||[]).map((topic,index)=>{
    const total=Math.max(1,Number(topic.contributions||0)),s=topic.sentiment||{};
    const opinions=(topic.opinions||[]).map(op=>`<div class="opinion"><span class="stance ${escapeHtml(op.stance||'mixed')}">${escapeHtml(op.stance||'mixed')}</span><span>${escapeHtml(op.summary)}</span></div>`).join('')||'<span class="muted">No recurring opinions returned.</span>';
    const disagreements=(topic.disagreements||[]).map(item=>`<div class="opinion"><span class="stance mixed">debate</span><span>${escapeHtml(item)}</span></div>`).join('');
    const popular=(topic.popular_posts||[]).map(post=>`<div class="popular-item"><a href="${escapeHtml(post.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(post.title)}</a><div class="popular-meta">score ${fmt(post.score)} · ${fmt(post.num_comments)} comments${post.author?` · u/${escapeHtml(post.author)}`:''}</div></div>`).join('')||'<span class="muted tiny">No matched posts.</span>';
    const evidence=(topic.representative||[]).slice(0,3).map(item=>`<div class="evidence-item">${escapeHtml(item.text)}<div class="evidence-meta">${escapeHtml(item.kind)} · ${escapeHtml(item.sentiment)}${item.author?` · u/${escapeHtml(item.author)}`:''}</div></div>`).join('');
    const focusChip=topic.focus_match?'<span class="topic-chip"><strong>Focus match</strong></span>':'';
    return `<article class="topic-card">
      <div class="topic-card-head"><div><h4>${escapeHtml(topic.name)}</h4><div class="topic-description">${escapeHtml(topic.description||'')}</div></div><div class="topic-rank">${index+1}</div></div>
      <div class="topic-meta">${focusChip}<span class="topic-chip"><strong>${fmt(topic.posts)}</strong> posts</span><span class="topic-chip"><strong>${fmt(topic.comments)}</strong> comments</span><span class="topic-chip"><strong>${fmt(Number(topic.share||0)*100,1)}%</strong> assigned share</span><span class="topic-chip">avg post score <strong>${fmt(topic.average_post_score,1)}</strong></span><span class="topic-chip">${escapeHtml(topic.confidence||'medium')} confidence</span></div>
      <div class="topic-sentiment-summary"><div class="sentiment-stat"><strong class="positive-text">${pct(s.positive,total)}</strong><span>Positive</span></div><div class="sentiment-stat"><strong class="neutral-text">${pct(s.neutral,total)}</strong><span>Neutral</span></div><div class="sentiment-stat"><strong class="negative-text">${pct(s.negative,total)}</strong><span>Negative</span></div></div>
      <div class="topic-section"><div class="topic-section-title">Recurring opinions</div><div class="opinion-list">${opinions}${disagreements}</div></div>
      <div class="topic-section"><div class="topic-section-title">Leading voices</div><div class="voice-columns"><div class="voice-group"><strong>Post authors</strong>${voiceRows(topic.top_authors)}</div><div class="voice-group"><strong>Commenters</strong>${voiceRows(topic.top_commenters)}</div></div></div>
      <div class="topic-section"><div class="topic-section-title">Popular matched posts</div><div class="popular-list">${popular}</div></div>
      ${evidence?`<div class="topic-section"><div class="topic-section-title">Representative excerpts</div><div class="evidence-list">${evidence}</div></div>`:''}
      <a class="drill-link" href="${escapeHtml(drillUrl(data,topic))}">Open detailed sentiment analysis →</a>
    </article>`;
  }).join('');
}

function renderPhrases(data){
  $('candidatePhrases').innerHTML=(data.candidate_phrases||[]).map(item=>`<span class="phrase">${escapeHtml(item.phrase)} <strong>${fmt(item.count,1)}</strong></span>`).join('')||'<span class="muted">No phrase signals returned.</span>';
}

function renderCaveats(data){
  const items=[...(data.caveats||[])];
  if(Number(data.stats?.archive_failures||0))items.push(`${fmt(data.stats.archive_failures)} archive slice requests failed, so coverage may be incomplete.`);
  items.push('Topic assignment uses LLM-generated cluster names and keywords mapped back to archive text. Multi-topic contributions are assigned to one primary topic, so topic shares are directional rather than exact mutually-exclusive truth.');
  $('caveats').innerHTML=items.map(item=>`<div class="caveat-item">${escapeHtml(item)}</div>`).join('');
}

function render(data){
  const stats=data.stats||{},overall=data.overall_sentiment||{},total=Number(stats.total_contributions||0);
  $('summaryTitle').textContent=`r/${data.subreddit} topic landscape`;
  $('summaryRange').textContent=`${data.start} through ${data.end} · inclusive`;
  $('modelMeta').textContent=data.model?`Model: ${data.model}`:'';
  $('kpiContributions').textContent=fmt(total);
  $('kpiContributionsSub').textContent=`${fmt(stats.posts_scanned)} posts + ${fmt(stats.comments_scanned)} comments`;
  $('kpiTopics').textContent=fmt(stats.topics_found);
  if($('kpiTopicsSub'))$('kpiTopicsSub').textContent=stats.target_topics?`${stats.topic_mode==='auto'?'Auto target':'Requested'}: ${fmt(stats.target_topics)} topics/subtopics`:'Distinct LLM-clustered discussion areas';
  $('kpiVoices').textContent=fmt(stats.known_voices);
  $('kpiPositive').textContent=fmt(overall.positive);$('kpiPositiveSub').textContent=pct(overall.positive,total);
  $('kpiNeutral').textContent=fmt(overall.neutral);$('kpiNeutralSub').textContent=pct(overall.neutral,total);
  $('kpiNegative').textContent=fmt(overall.negative);$('kpiNegativeSub').textContent=pct(overall.negative,total);
  const targetText=stats.target_topics?` Topic discovery targeted ${fmt(stats.target_topics)} ${stats.topic_mode==='auto'?'automatically scaled ':''}topics/subtopics.`:'';
  const focusText=Array.isArray(data.focus_keywords)&&data.focus_keywords.length?` Focus keywords: <strong>${data.focus_keywords.map(escapeHtml).join(', ')}</strong>. ${fmt(stats.focus_topic_matches||0)} discovered topics matched and were prioritized.`:'';
  $('coverage').innerHTML=`<strong>Archive coverage:</strong> ${fmt(stats.posts_scanned)} posts and ${fmt(stats.comments_scanned)} comments scanned.${targetText}${focusText} ${fmt(stats.assigned_contributions)} contributions received a primary assignment to one of the discovered topics.${stats.archive_failures?` <span class="negative-text">${fmt(stats.archive_failures)} archive slices failed.</span>`:''}`;
  renderOverview(data);renderShare(data.topics||[]);renderTopicSentiment(data.topics||[]);renderTopicCards(data);renderPhrases(data);renderCaveats(data);
  $('results').classList.remove('hidden');
}

async function run(){
  $('error').classList.add('hidden');$('results').classList.add('hidden');
  const subreddit=$('subreddit').value.trim().replace(/^r\//i,''),start=$('start').value,end=$('end').value,topics=$('topicCount').value||'auto';
  const focusKeywords=$('focusKeywords')?.value.trim()||'';
  if(!subreddit||!start||!end)return showError('Enter a subreddit and date range.');
  const days=Math.floor((new Date(`${end}T00:00:00Z`)-new Date(`${start}T00:00:00Z`))/86400000)+1;
  if(!Number.isFinite(days)||days<1)return showError('End date must be on or after start date.');
  if(days>30)return showError('Choose a date range of 30 days or less.');
  $('run').disabled=true;
  try{
    setProgress(12,'Scanning subreddit archive…');
    const promise=backendAnalyze({subreddit,start,end,topics,focusKeywords});
    const timer=setTimeout(()=>setProgress(55,focusKeywords?'Clustering topics with your safe focus keywords…':'Clustering detailed topics, subtopics, and opinions with OpenAI…'),5000);
    const data=await promise;clearTimeout(timer);
    setProgress(88,'Mapping archive activity back to discovered topics…');
    render(data);setProgress(100,'Topic landscape ready.');
  }catch(error){showError(error?.name==='AbortError'?'Analysis timed out. Try a shorter date range.':(error?.message||String(error)));setProgress(100,'Analysis stopped.');}
  finally{$('run').disabled=false;}
}

setDefaults();setConnectionDefaults();$('run').addEventListener('click',run);
