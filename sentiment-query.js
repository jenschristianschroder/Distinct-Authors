'use strict';

(function(){
  const params=new URLSearchParams(location.search);
  const values={subreddit:params.get('subreddit'),topic:params.get('topic'),start:params.get('start'),end:params.get('end')};
  if(values.subreddit&&document.getElementById('subreddit'))document.getElementById('subreddit').value=values.subreddit;
  if(values.topic&&document.getElementById('topic'))document.getElementById('topic').value=values.topic;
  if(/^\d{4}-\d{2}-\d{2}$/.test(values.start||'')&&document.getElementById('start'))document.getElementById('start').value=values.start;
  if(/^\d{4}-\d{2}-\d{2}$/.test(values.end||'')&&document.getElementById('end'))document.getElementById('end').value=values.end;
})();
