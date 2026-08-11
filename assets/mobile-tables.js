(() => {
  if (/\/admin\.html(?:$|[?#])/.test(location.pathname + location.search + location.hash)) return;

  function applyLabels(){
    document.querySelectorAll('.page-client .section table').forEach(table=>{
      const labels=[...table.querySelectorAll('thead th')].map(th=>th.textContent.trim());
      table.querySelectorAll('tbody tr').forEach(row=>{
        [...row.children].forEach((cell,index)=>{
          if(cell.classList.contains('empty')) return;
          cell.dataset.label=labels[index]||'';
        });
      });
    });
  }

  window.addEventListener('settlement-data-changed',()=>setTimeout(applyLabels,80));
  document.addEventListener('change',e=>{if(e.target?.id==='statusFilter')setTimeout(applyLabels,30)});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)applyLabels()});
  setTimeout(applyLabels,100);
  setTimeout(applyLabels,700);
})();
