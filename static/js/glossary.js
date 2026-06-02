function filterGlossary(query){
  const q=query.trim().toLowerCase();
  document.querySelectorAll('.glossary-entry').forEach(e=>{
    const matches=!q||e.dataset.term.includes(q)||e.querySelector('.glossary-term').textContent.toLowerCase().includes(q)||e.querySelector('.glossary-short').textContent.toLowerCase().includes(q);
    e.classList.toggle('glossary-entry--hidden',!matches);
  });
  document.querySelectorAll('.glossary-letter-group').forEach(g=>{
    const visible=Array.from(g.querySelectorAll('.glossary-entry')).some(e=>!e.classList.contains('glossary-entry--hidden'));
    g.classList.toggle('glossary-letter-group--hidden',!visible);
  });
  const none=!Array.from(document.querySelectorAll('.glossary-entry')).some(e=>!e.classList.contains('glossary-entry--hidden'));
  const noRes=document.getElementById('glossary-no-results');
  if(noRes)noRes.style.display=none&&q?'flex':'none';
}
