(function(){
"use strict";

var tasks=[], doneTasks=[], loaded=false, failed=false, col=null, diag="";
var manual={}, flow=null, detailId=null, toastTimer=null, openMenu=null, popupDone=false, curDay="", calOff=0, ofilter="todas";

function $(id){return document.getElementById(id);}
function pad(n){return (n<10?"0":"")+n;}
function fmt(d){return d.getFullYear()+"-"+pad(d.getMonth()+1)+"-"+pad(d.getDate());}
function pd(s){var p=s.split("-").map(Number);return new Date(p[0],p[1]-1,p[2]);}
function addDays(s,n){var p=s.split("-").map(Number);return fmt(new Date(p[0],p[1]-1,p[2]+n));}
function br(s){var p=String(s).split("-");return p[2]+"/"+p[1];}
function wk(s){return pd(s).toLocaleDateString("pt-BR",{weekday:"short"}).replace(".","");}
function dlabel(s){return wk(s)+" "+br(s);}
function esc(s){return String(s==null?"":s).replace(/[&<>"']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c];});}
function hrange(t){return t.horario?(t.horarioFim?t.horario+" às "+t.horarioFim:t.horario):"";}
function short(s){s=String(s||"");return s.length>38?s.slice(0,37)+"…":s;}
function numOrNull(v){v=String(v).trim();if(v==="")return null;var n=Number(v);return isNaN(n)?null:n;}
function lsGet(k){try{return window.localStorage.getItem(k);}catch(e){return null;}}
function lsSet(k,v){try{window.localStorage.setItem(k,v);}catch(e){}}

/* ---------- origem das tarefas ---------- */
var ORIGENS=[["trabalho","Trabalho"],["casa","Casa"],["compras","Compras"],["estudo","Estudo"],["treino","Treino"],["projetos","Projetos"]];
function origLabel(v){for(var i=0;i<ORIGENS.length;i++){if(ORIGENS[i][0]===v)return ORIGENS[i][1];}return "";}
function passOrigin(t){
  if(ofilter==="todas") return true;
  if(ofilter==="sem") return !origLabel(t.origem);
  return t.origem===ofilter;
}
function renderOrig(){
  var c={todas:0,sem:0};
  ORIGENS.forEach(function(o){c[o[0]]=0;});
  tasks.forEach(function(t){
    if(t.compromisso) return;
    c.todas++;
    if(origLabel(t.origem)) c[t.origem]++; else c.sem++;
  });
  function btn(v,l,n){return '<button type="button" class="of" data-act="ofilter" data-v="'+v+'" aria-pressed="'+(ofilter===v)+'">'+esc(l)+'<span class="c">'+n+'</span></button>';}
  var h=btn("todas","Todas",c.todas);
  ORIGENS.forEach(function(o){h+=btn(o[0],o[1],c[o[0]]);});
  if(c.sem>0||ofilter==="sem") h+=btn("sem","Sem origem",c.sem);
  $("orig").innerHTML=h;
}

/* ---------- regras de seção ---------- */
function classify(t,today){
  if(t.status==="aguardando") return "aguard";
  if(t.status==="acompanhando") return "acomp";
  if(t.status!=="fazer") return null;
  if(t.compromisso) return "compromisso";
  if(t.prazo&&t.prazo<today) return "revisar";
  if(t.urgente) return "urgente";
  if(!t.dia) return "proximos";
  if(t.dia>today) return "proximos";
  if(t.quando==="noite") return "noite";
  return t.quando==="comecar"?"inicio":"hoje";
}
function tone(t,sec){
  if(t.status==="concluida") return "green";
  if(t.status==="acompanhando") return "teal";
  if(t.status==="aguardando") return "rose";
  if(sec==="revisar") return "red";
  if(t.andamento) return "blue";
  if(sec==="urgente") return "red";
  if(sec==="noite") return "night";
  if(sec==="inicio") return "orange";
  if(sec==="hoje") return "yellow";
  if(sec==="proximos") return "purple";
  return "gray";
}
function byCreated(a,b){var x=a.criadaEm||"",y=b.criadaEm||"";return x<y?-1:(x>y?1:0);}
function byTime(a,b){return String(a.horario||"99:99").localeCompare(String(b.horario||"99:99"))||byCreated(a,b);}
function group(today){
  var g={inicio:[],hoje:[],noite:[],urgente:[],revisar:[],compromisso:[],proximos:[],acomp:[],aguard:[]};
  tasks.forEach(function(t){var k=classify(t,today);if(!k)return;if(k!=="compromisso"&&!passOrigin(t))return;g[k].push(t);});
  g.inicio.sort(byTime);g.hoje.sort(byTime);g.noite.sort(byTime);
  g.urgente.sort(byCreated);g.revisar.sort(byCreated);
  g.compromisso.sort(function(a,b){return (a.dia||"9999").localeCompare(b.dia||"9999")||String(a.horario||"").localeCompare(String(b.horario||""));});
  g.proximos.sort(function(a,b){return (a.dia||"9999").localeCompare(b.dia||"9999")||byTime(a,b);});
  g.acomp.sort(function(a,b){return (a.cobrarEm||"9999").localeCompare(b.cobrarEm||"9999")||byCreated(a,b);});
  g.aguard.sort(function(a,b){return (a.aguardandoData||"9999").localeCompare(b.aguardandoData||"9999")||byCreated(a,b);});
  return g;
}
function prazoChip(t,today){
  if(!t.prazo||t.status==="concluida") return "";
  var txt;
  if(t.prazo<today) txt="Prazo venceu em "+br(t.prazo);
  else if(t.prazo===today) txt="Prazo vence hoje";
  else if(t.prazo===addDays(today,1)) txt="Prazo vence amanhã";
  else txt="Prazo "+br(t.prazo);
  return '<span class="chip b">'+esc(txt)+'</span>';
}
var MOVE_LABEL={inicio:"Início do dia",hoje:"Hoje",proximos:"Próximos dias",urgente:"Urgente"};

/* ---------- cartões ---------- */
var view=(lsGet("visao")==="lista")?"lista":"quadros";
function labelOf(t,today,sec){
  if(t.status==="concluida") return "Concluída";
  if(t.status==="acompanhando") return "Acompanhando";
  if(t.status==="aguardando") return "Aguardando";
  if(t.prazo&&t.prazo<today) return "Prazo venceu em "+br(t.prazo);
  if(t.andamento) return "Em andamento";
  if(t.prazo===today) return "Prazo hoje";
  if(t.prazo&&t.prazo===addDays(today,1)) return "Prazo amanhã";
  return "Não iniciada";
}
function smallChips(t,today,lab){
  var ch=[];
  if(t.horario) ch.push('<span class="chip time">'+(t.horarioFim?esc(t.horario)+' às '+esc(t.horarioFim):'às '+esc(t.horario))+'</span>');
  if(t.diaFim&&t.diaFim!==t.dia) ch.push('<span class="chip">'+esc(dlabel(t.dia))+' até '+esc(dlabel(t.diaFim))+'</span>');
  else if(t.dia&&t.dia>today) ch.push('<span class="chip b">'+esc(dlabel(t.dia))+'</span>');
  if(t.prazo&&t.status!=="concluida"&&lab.indexOf("Prazo")!==0) ch.push('<span class="chip">Prazo '+esc(br(t.prazo))+'</span>');
  if(t.meta!=null) ch.push('<span class="chip b">'+(t.feito!=null?t.feito:0)+' de '+t.meta+'</span>');
  if(t.esperando) ch.push('<span class="chip b">Esperando '+esc(t.esperando)+'</span>');
  if(t.status==="aguardando"&&t.aguardandoPor) ch.push('<span class="chip b">Aguardando '+esc(t.aguardandoPor)+'</span>');
  if(t.status==="aguardando"&&t.aguardandoData) ch.push('<span class="chip'+(t.aguardandoData<=today?' b':'')+'">'+(t.aguardandoData<=today?'Previsto até hoje':'Previsto '+esc(br(t.aguardandoData)))+'</span>');
  if(origLabel(t.origem)) ch.push('<span class="chip">'+esc(origLabel(t.origem))+'</span>');
  if(t.status==="acompanhando"&&t.cobrarEm) ch.push('<span class="chip'+(t.cobrarEm<=today?' b':'')+'">'+(t.cobrarEm<=today?'Cobrar hoje':'Cobrar '+esc(br(t.cobrarEm)))+'</span>');
  if(t.status==="concluida"){
    if(t.horaInicio||t.horaFim) ch.push('<span class="chip">'+esc(t.horaInicio||"?")+' – '+esc(t.horaFim||"?")+'</span>');
    if(t.completo===false) ch.push('<span class="chip">Parcial</span>');
  }
  return ch.join("");
}
function tickHTML(t,id){
  return '<button type="button" class="tick" data-act="done" data-id="'+id+'" aria-label="'+(t.status==="concluida"?'Concluída':'Concluir')+': '+esc(t.title)+'"><span>'+(t.status==="concluida"?'✓':'')+'</span></button>';
}
function cardHTML(t,today,sec){
  var tn=tone(t,sec), id=esc(t.id), lab=labelOf(t,today,sec), ch=smallChips(t,today,lab);
  if(view==="lista"){
    return '<div class="lrow '+tn+'" data-act="open" data-id="'+id+'" tabindex="0" title="'+esc(t.title)+'">'+tickHTML(t,id)+
      '<span class="ct">'+esc(t.title)+'</span><span class="rside">'+ch+'<span class="lchip">'+esc(lab)+'</span></span></div>';
  }
  return '<article class="card mini '+tn+'" data-act="open" data-id="'+id+'" tabindex="0" title="'+esc(t.title)+'">'+
    '<div class="main"><span class="ct">'+esc(t.title)+'</span><div class="foot"><span class="lab">'+esc(lab)+'</span>'+ch+'</div></div>'+
    tickHTML(t,id)+'</article>';
}
function cardsGrid(list,today,sec){
  return '<div class="'+(view==="lista"?'lista':'grid mini')+'">'+list.map(function(t){return cardHTML(t,today,sec);}).join("")+'</div>';
}
function panelHTML(key,title,dot,count,body,open,okMsg){
  return '<section class="panel" data-open="'+open+'"><button type="button" class="ph" data-act="panel" data-key="'+key+'" aria-expanded="'+open+'">'+
    '<span class="dot '+dot+'"></span><span class="t">'+title+'</span><span class="n">'+count+'</span>'+(okMsg?'<span class="ok">'+okMsg+'</span>':'')+
    '<span class="chev" aria-hidden="true">›</span></button>'+(open?body:'')+'</section>';
}

/* ---------- colunas laterais ---------- */

function dayMap(today){
  var m={};
  function add(d,k,t){if(!d)return;(m[d]=m[d]||{red:[],green:[],orange:[]})[k].push(t);}
  tasks.forEach(function(t){
    if(t.status!=="fazer"&&t.status!=="acompanhando"&&t.status!=="aguardando") return;
    if(t.prazo) add(t.prazo,"red",t);
    if(t.compromisso&&t.status==="fazer"&&t.dia){
      var d=t.dia,fim=t.diaFim||t.dia,n=0;
      while(d<=fim&&n<45){add(d,"green",t);d=addDays(d,1);n++;}
    }else if(t.status==="acompanhando"){
      if(t.cobrarEm) add(t.cobrarEm,"orange",t);
    }else if(t.status==="aguardando"){
      if(t.aguardandoData) add(t.aguardandoData,"orange",t);
    }else if(!t.compromisso&&t.dia&&t.dia>today){
      add(t.dia,"orange",t);
    }
  });
  return m;
}
function calHTML(today,dm){
  var base=pd(today), first=new Date(base.getFullYear(),base.getMonth()+calOff,1);
  var y=first.getFullYear(), mo=first.getMonth(), days=new Date(y,mo+1,0).getDate(), lead=first.getDay();
  var title=first.toLocaleDateString("pt-BR",{month:"long",year:"numeric"});
  var h='<div class="box"><div class="cal-h"><button type="button" data-act="calprev" aria-label="Mês anterior">‹</button><b>'+esc(title)+'</b><button type="button" data-act="calnext" aria-label="Próximo mês">›</button></div><div class="cal-g">';
  ["D","S","T","Q","Q","S","S"].forEach(function(w){h+='<span class="wd">'+w+'</span>';});
  for(var i=0;i<lead;i++) h+='<span></span>';
  for(var d=1;d<=days;d++){
    var ds=y+"-"+pad(mo+1)+"-"+pad(d), info=dm[ds], cls="cd", ttl="";
    if(info){
      var parts=[];
      if(info.red.length){cls+=" red";parts.push(info.red.length+" prazo");}
      if(info.green.length){if(cls==="cd")cls+=" green";parts.push(info.green.length+" compromisso");}
      if(info.orange.length){if(cls==="cd")cls+=" orange";parts.push(info.orange.length+" atenção");}
      ttl=parts.join(", ");
    }
    if(ds===today) cls+=" today";
    h+='<button type="button" class="'+cls+'" data-act="day" data-date="'+ds+'"'+(ttl?' title="'+esc(ttl)+'"':'')+'>'+d+'</button>';
  }
  h+='</div><div class="legend"><span><i class="r"></i>Prazo</span><span><i class="g"></i>Compromisso</span><span><i class="o"></i>Atenção</span></div></div>';
  return h;
}
function agendaItems(g,today){
  var end=addDays(today,6);
  return g.compromisso.filter(function(t){return t.dia&&t.dia<=end&&(t.diaFim||t.dia)>=today;}).map(function(t){
    return {t:t,start:t.dia<today?today:t.dia};
  }).sort(function(a,b){return a.start.localeCompare(b.start)||String(a.t.horario||"").localeCompare(String(b.t.horario||""));});
}
function acardHTML(t,start,today){
  var hoje=start===today, info=[];
  if(t.horario) info.push(hrange(t));
  if(t.diaFim&&t.diaFim!==t.dia) info.push('até '+dlabel(t.diaFim));
  return '<button type="button" class="acard'+(hoje?' hoje':'')+'" data-act="open" data-id="'+esc(t.id)+'"><span class="adate"><b>'+esc(hoje?'hoje':wk(start))+'</b><i>'+esc(start.slice(8))+'</i></span>'+
    '<span class="atxt"><b>'+esc(t.title)+'</b>'+(info.length?'<small>'+esc(info.join(' · '))+'</small>':'<small>'+esc(dlabel(start))+'</small>')+'</span></button>';
}
function renderSide(g,today){
  var s=pd(today);
  var l='<div class="today"><span class="tw">'+esc(s.toLocaleDateString("pt-BR",{weekday:"long"}))+'</span><span class="td">'+s.getDate()+'</span><span class="tm">'+esc(s.toLocaleDateString("pt-BR",{month:"long",year:"numeric"}))+'</span></div>';
  l+=calHTML(today,dayMap(today));
  $("left").innerHTML=l;
  var items=agendaItems(g,today), all=g.compromisso.length;
  var r='<div class="a-h"><h2>Próximos 7 dias</h2></div><div class="alist">'+
    (items.length?items.map(function(it){return acardHTML(it.t,it.start,today);}).join(""):'<p class="a-empty">Nenhum compromisso nos próximos 7 dias.</p>')+'</div>';
  if(all>items.length) r+='<div class="a-more"><button type="button" class="btn" data-act="allevt">Ver todos ('+all+')</button></div>';
  $("right").innerHTML=r;
}
function openDay(ds){
  var today=fmt(new Date()), info=dayMap(today)[ds];
  var h='<h2 class="sh">'+esc(pd(ds).toLocaleDateString("pt-BR",{weekday:"long",day:"numeric",month:"long"}))+'</h2>';
  if(!info){h+='<p class="st">Nada marcado neste dia.</p>';}
  else{
    [["red","Prazo vence"],["green","Compromisso"],["orange","Atenção"]].forEach(function(c){
      if(!info[c[0]].length) return;
      h+='<p class="dl-t '+c[0]+'">'+c[1]+'</p><div class="dl">'+info[c[0]].map(function(t){return '<button type="button" class="btn dli" data-c="'+esc(t.id)+'">'+esc(t.title)+(t.horario?' · '+esc(hrange(t)):'')+'</button>';}).join("")+'</div>';
    });
  }
  h+='<div class="row"><button type="button" class="btn" data-n="cancel">Fechar</button></div>';
  $("sheet").innerHTML=h;$("dlg").hidden=false;
}
function openAllEvt(){
  var g=group(fmt(new Date()));
  var h='<h2 class="sh">Todos os compromissos</h2><div class="dl">'+g.compromisso.map(function(t){
    return '<button type="button" class="btn dli" data-c="'+esc(t.id)+'">'+esc(t.dia?dlabel(t.dia):'Sem dia')+(t.diaFim&&t.diaFim!==t.dia?' até '+esc(dlabel(t.diaFim)):'')+(t.horario?' · '+esc(hrange(t)):'')+' · '+esc(t.title)+'</button>';
  }).join("")+'</div><div class="row"><button type="button" class="btn" data-n="cancel">Fechar</button></div>';
  $("sheet").innerHTML=h;$("dlg").hidden=false;
}

/* ---------- tela ---------- */
function render(){
  var today=fmt(new Date()); curDay=today;
  Array.prototype.forEach.call(document.querySelectorAll(".vb"),function(x){x.setAttribute("aria-pressed",String(x.dataset.v===view));});
  var g=group(today);
  var s=new Date().toLocaleDateString("pt-BR",{weekday:"long",day:"numeric",month:"long"});
  $("date").textContent=s.charAt(0).toUpperCase()+s.slice(1);
  var sub=$("sub");
  if(!loaded){sub.textContent="";}
  else{
    var p=[];
    if(g.inicio.length)p.push(g.inicio.length+" no início do dia");
    if(g.hoje.length)p.push(g.hoje.length+" para hoje");
    if(g.noite.length)p.push(g.noite.length+" à noite");
    var ev=g.compromisso.filter(function(t){return t.dia&&t.dia<=today&&(t.diaFim||t.dia)>=today;}).length;
    if(ev)p.push(ev+(ev===1?" compromisso":" compromissos"));
    if(g.acomp.length)p.push(g.acomp.length+" acompanhando");
    if(g.aguard.length)p.push(g.aguard.length+" aguardando");
    if(g.revisar.length)p.push(g.revisar.length+" para revisar");
    if(doneTasks.length)p.push(doneTasks.length+(doneTasks.length===1?" finalizada":" finalizadas")+" hoje");
    sub.textContent=p.length?p.join(" · "):"Nada pendente para hoje.";
  }

  var box=$("panels");
  if(failed){
    box.innerHTML='<div class="empty"><b>Não foi possível carregar.</b> Recarregue a página. Se continuar, avise quem te enviou o link.<br><small>Detalhe: '+esc(diag||"sem resposta do banco")+'</small></div>';
    return;
  }
  if(!loaded){box.innerHTML='<div class="empty">Carregando tarefas…</div>';return;}

  renderSide(g,today);
  renderOrig();

  function isOpen(k,def){return manual[k]!==undefined?manual[k]:def;}
  var html="", tail="";
  if(g.urgente.length) html+=panelHTML("urgente","Urgente","red",g.urgente.length,cardsGrid(g.urgente,today,"urgente"),isOpen("urgente",true));
  var revPanel=panelHTML("revisar","Revisar","red",g.revisar.length,
    (g.revisar.length?'<div class="hint">O prazo dessas tarefas passou. Abra cada uma para definir um novo prazo ou concluir.</div>'+cardsGrid(g.revisar,today,"revisar"):'<div class="empty">Nenhuma tarefa com prazo vencido.</div>')+
    '<div class="row addrow"><button type="button" class="btn" data-act="newprazo">+ Nova tarefa com prazo</button></div>',isOpen("revisar",g.revisar.length>0));
  if(g.revisar.length) html+=revPanel; else tail+=revPanel;
  if(g.acomp.length) html+=panelHTML("acomp","Acompanhando","teal",g.acomp.length,cardsGrid(g.acomp,today,"acomp"),isOpen("acomp",true));
  html+=panelHTML("aguard","Aguardando","rose",g.aguard.length,
    g.aguard.length?'<div class="hint">Tarefas que dependem de algo acontecer. Quando acontecer, abra a tarefa e mude a situação para Não iniciada.</div>'+cardsGrid(g.aguard,today,"aguard"):'<div class="empty">Nada aguardando.</div>',isOpen("aguard",g.aguard.length>0));
  html+=panelHTML("inicio","Início do dia","orange",g.inicio.length,
    g.inicio.length?cardsGrid(g.inicio,today,"inicio"):'<div class="empty">Nada no início do dia.</div>',isOpen("inicio",true),
    (!g.inicio.length&&doneTasks.some(function(t){return t.quando==="comecar";}))?"✓ tudo feito":"");
  html+=panelHTML("hoje","Hoje","yellow",g.hoje.length,
    g.hoje.length?cardsGrid(g.hoje,today,"hoje"):'<div class="empty">Nada para hoje.</div>',isOpen("hoje",true),
    (!g.hoje.length&&doneTasks.some(function(t){return t.quando!=="comecar"&&t.quando!=="noite";}))?"✓ tudo feito":"");
  html+=panelHTML("noite","Noite","night",g.noite.length,
    g.noite.length?cardsGrid(g.noite,today,"noite"):'<div class="empty">Nada planejado para a noite.</div>',isOpen("noite",false));
  if(g.proximos.length) html+=panelHTML("proximos","Próximos dias","purple",g.proximos.length,cardsGrid(g.proximos,today,"proximos"),isOpen("proximos",true));
  var doneF=doneTasks.filter(passOrigin);
  html+=panelHTML("finalizadas","Finalizadas hoje","green",doneF.length,
    doneF.length?cardsGrid(doneF,today,"fim"):'<div class="empty">Nada finalizado ainda hoje.</div>',isOpen("finalizadas",true));
  box.innerHTML=html+tail;
}

/* ---------- avisos ---------- */
function toast(msg){
  var el=$("toast");
  el.innerHTML='<div class="pill"><span class="msg"></span></div>';
  el.querySelector(".msg").textContent=msg;
  el.hidden=false;
  clearTimeout(toastTimer);
  toastTimer=setTimeout(function(){el.hidden=true;},4500);
}
function patch(id,data){
  return col.doc(id).update(data).then(function(){return true;},function(){toast("Não foi possível salvar. Tente de novo.");return false;});
}
function findAny(id){
  var i;
  for(i=0;i<tasks.length;i++){if(tasks[i].id===id)return tasks[i];}
  for(i=0;i<doneTasks.length;i++){if(doneTasks[i].id===id)return doneTasks[i];}
  return null;
}
function growAll(){
  Array.prototype.forEach.call($("sheet").querySelectorAll("textarea"),function(el){el.style.height="auto";el.style.height=(el.scrollHeight+2)+"px";});
}
function closeDlg(){$("dlg").hidden=true;$("sheet").innerHTML="";flow=null;detailId=null;}

/* ---------- aviso de prazo vencido ---------- */
function maybePopup(){
  if(popupDone||!loaded||!$("dlg").hidden) return;
  var today=fmt(new Date());
  var novas=tasks.filter(function(t){return classify(t,today)==="revisar"&&t.avisoRevisar!==t.prazo;});
  if(!novas.length) return;
  popupDone=true;
  var h='<h2 class="sh">'+(novas.length===1?'Uma tarefa foi movida para Revisar':novas.length+' tarefas foram movidas para Revisar')+'</h2>'+
    '<p class="st">O prazo passou. Defina um novo prazo ou conclua.</p><ul>'+
    novas.map(function(t){return '<li>'+esc(t.title)+' <span class="st">(prazo era '+esc(br(t.prazo))+')</span></li>';}).join("")+'</ul>'+
    '<div class="row"><button type="button" class="btn primary" data-p="ir">Revisar agora</button><button type="button" class="btn" data-p="depois">Depois</button></div>';
  $("sheet").innerHTML=h;
  $("sheet").dataset.ids=novas.map(function(t){return t.id;}).join(",");
  $("dlg").hidden=false;
}
function ackPopup(){
  var ids=($("sheet").dataset.ids||"").split(",").filter(Boolean);
  ids.forEach(function(id){var t=findAny(id);if(t)patch(id,{avisoRevisar:t.prazo||null});});
  $("sheet").dataset.ids="";
}

/* ---------- quadro de detalhe ---------- */
function opt(v,l,cur){return '<option value="'+v+'"'+(String(cur||"")===v?' selected':'')+'>'+l+'</option>';}
function openDetail(id,forceAcomp){
  var t=findAny(id);if(!t)return;
  detailId=id;
  var done=t.status==="concluida";
  var stv=(forceAcomp||t.status==="acompanhando")?"acompanhando":(t.status==="aguardando"?"aguardando":(t.andamento?"andamento":"fazer"));
  var qv=t.quando==="comecar"?"comecar":(t.quando==="noite"?"noite":"depois");
  var durs=["","5min","10min","15min","30min","1h","2h","3h+"];
  var h='<label>Título<input id="d-title" class="title" type="text" maxlength="200" value="'+esc(t.title)+'"></label>';
  if(!done){
    h+='<label>Situação<select id="d-status">'+opt("fazer","Não iniciada",stv)+opt("andamento","Em andamento",stv)+opt("acompanhando","Acompanhando (esperando alguém)",stv)+opt("aguardando","Aguardando (depende de algo)",stv)+'</select></label>';
    h+='<div class="two" id="d-acomp"'+(stv==="acompanhando"?'':' hidden')+'><label>Esperando quem<input id="d-esp" type="text" maxlength="80" value="'+esc(t.esperando||"")+'"></label><label>Cobrar em<input id="d-cobrar" type="date" value="'+esc(t.cobrarEm||"")+'"></label></div>';
  }
  if(!done) h+='<div class="two" id="d-agu"'+(stv==="aguardando"?'':' hidden')+'><label>Aguardando o quê<input id="d-agupor" type="text" maxlength="120" value="'+esc(t.aguardandoPor||"")+'"></label><label>Previsão (opcional)<input id="d-agudata" type="date" value="'+esc(t.aguardandoData||"")+'"></label></div>';
  h+='<div class="two"><label>Dia<input id="d-dia" type="date" value="'+esc(t.dia||"")+'"></label><label>Até (se durar mais de um dia)<input id="d-diafim" type="date" value="'+esc(t.diaFim||"")+'"></label>'+
     '<label>Horário de início (opcional)<input id="d-hora" type="time" value="'+esc(t.horario||"")+'"></label><label>Horário de fim (opcional)<input id="d-horafim" type="time" value="'+esc(t.horarioFim||"")+'"></label><label>Prazo<input id="d-prazo" type="date" value="'+esc(t.prazo||"")+'"></label>'+
     '<label>Duração<select id="d-dur">'+durs.map(function(d){return opt(d,d||"Sem duração",t.duracao);}).join("")+'</select></label>'+
     '<label>Momento<select id="d-quando">'+opt("comecar","Início do dia",qv)+opt("depois","Hoje",qv)+opt("noite","Noite",qv)+'</select></label>'+
     '<label>Origem<select id="d-orig">'+opt("","Sem origem",t.origem)+ORIGENS.map(function(o){return opt(o[0],o[1],t.origem);}).join("")+'</select></label>'+
     '<label>Quantidade (meta)<input id="d-meta" type="number" min="0" inputmode="numeric" value="'+(t.meta!=null?t.meta:"")+'"></label>'+
     '<label>Quantidade feita<input id="d-feito" type="number" min="0" inputmode="numeric" value="'+(t.feito!=null?t.feito:"")+'"></label></div>';
  h+='<label>Descrição<textarea id="d-desc" rows="3">'+esc(t.descricao||"")+'</textarea></label>';
  if(!done) h+='<p class="dl-t" style="margin:0">Mover para</p><div class="row">'+[["inicio","Início do dia"],["hoje","Hoje"],["noite","Noite"],["amanha","Amanhã"],["compromisso","Compromisso"]].map(function(o){return '<button type="button" class="btn" data-d="mv-'+o[0]+'">'+o[1]+'</button>';}).join("")+'</div>';
  h+='<label class="chk"><input id="d-urg" type="checkbox"'+(t.urgente?' checked':'')+'>Urgente</label>';
  h+='<label class="chk"><input id="d-evt" type="checkbox"'+(t.compromisso?' checked':'')+'>É um compromisso (aparece na coluna da direita)</label>';
  h+='<div class="row" id="d-main"><button type="button" class="btn primary" data-d="save">Salvar</button>';
  if(done) h+='<button type="button" class="btn" data-d="reabrir">Reabrir</button>';
  else h+='<button type="button" class="btn good" data-d="concluir">Concluir</button><button type="button" class="btn" data-d="amanha">Amanhã</button>';
  h+='<button type="button" class="btn danger" data-d="del-ask">Excluir</button><button type="button" class="btn" data-d="fechar">Fechar</button></div>';
  h+='<div class="row" id="d-del" hidden><span class="st" style="align-self:center">Excluir esta tarefa de vez?</span><button type="button" class="btn danger" data-d="del-yes">Sim, excluir</button><button type="button" class="btn" data-d="del-no">Não</button></div>';
  $("sheet").innerHTML=h;
  $("dlg").hidden=false;
  growAll();
}
function saveDetail(){
  var t=findAny(detailId);if(!t)return;
  var v=function(id){var e=$(id);return e?e.value.trim():"";};
  var data={title:v("d-title")||t.title,descricao:v("d-desc")||null,dia:v("d-dia")||null,diaFim:v("d-diafim")||null,horario:v("d-hora")||null,horarioFim:(v("d-hora")?(v("d-horafim")||null):null),
    prazo:v("d-prazo")||null,duracao:v("d-dur")||null,quando:v("d-quando")||"depois",urgente:$("d-urg").checked,compromisso:$("d-evt").checked,
    meta:numOrNull(v("d-meta")),feito:numOrNull(v("d-feito")),origem:v("d-orig")||null};
  var st=$("d-status")?$("d-status").value:null;
  if(st==="acompanhando"){data.status="acompanhando";data.andamento=false;data.esperando=v("d-esp")||null;data.cobrarEm=v("d-cobrar")||null;data.aguardandoPor=null;data.aguardandoData=null;}
  else if(st==="aguardando"){data.status="aguardando";data.andamento=false;data.esperando=null;data.cobrarEm=null;data.aguardandoPor=v("d-agupor")||null;data.aguardandoData=v("d-agudata")||null;}
  else if(st){data.status="fazer";data.andamento=(st==="andamento");data.esperando=null;data.cobrarEm=null;data.aguardandoPor=null;data.aguardandoData=null;if(st==="andamento"&&!t.iniciadaEm)data.iniciadaEm=new Date().toISOString();}
  patch(detailId,data).then(function(ok){if(ok){closeDlg();toast("Salvo.");}});
}

/* ---------- criar a partir dos painéis ---------- */
function openNewPrazo(){
  var h='<h2 class="sh">Nova tarefa com prazo</h2>'+
    '<label>Título<input id="n-title" class="title" type="text" maxlength="200"></label>'+
    '<div class="two"><label>Prazo<input id="n-prazo" type="date"></label>'+
    '<label>Momento<select id="n-quando">'+opt("depois","Hoje","depois")+opt("comecar","Início do dia","depois")+opt("noite","Noite","depois")+'</select></label></div>'+
    '<p class="st">A tarefa aparece em Hoje. Quando o prazo passar, ela vai para Revisar.</p>'+
    '<div class="row"><button type="button" class="btn primary" data-n="prazo-save">Criar</button><button type="button" class="btn" data-n="cancel">Cancelar</button></div>';
  $("sheet").innerHTML=h;$("dlg").hidden=false;
}

/* ---------- fluxo de conclusão ---------- */
function openFlow(id){
  var t=findAny(id);if(!t||t.status==="concluida")return;
  flow={id:id,t:t,step:"a",n:t.meta!=null?t.meta:null,ini:"",fim:"",faltou:"",quando:"amanha"};
  renderFlow();
}
function grab(){
  if(!flow)return;
  var g=function(id){var e=$(id);return e?e.value:null;};
  var n=g("f-n"),i=g("f-ini"),f=g("f-fim"),x=g("f-falta");
  if(n!==null)flow.n=numOrNull(n);
  if(i!==null)flow.ini=i;
  if(f!==null)flow.fim=f;
  if(x!==null)flow.faltou=x;
}
function renderFlow(){
  var f=flow,t=f.t;
  var h='<h2 class="sh">Concluir tarefa</h2><p class="st">'+esc(t.title)+'</p>';
  if(f.step==="a"){
    if(t.meta!=null) h+='<label>Quantos você concluiu? (meta: '+t.meta+')<input id="f-n" type="number" min="0" inputmode="numeric" value="'+(f.n!=null?f.n:t.meta)+'"></label>';
    h+='<details class="hrs"><summary>Registrar horário (opcional)</summary><div class="two"><label>Início<input id="f-ini" type="time" value="'+esc(f.ini)+'"></label><label>Fim<input id="f-fim" type="time" value="'+esc(f.fim)+'"></label></div></details>';
    h+='<div class="row">'+(t.meta!=null
      ?'<button type="button" class="btn primary" data-f="go">Continuar</button>'
      :'<button type="button" class="btn good" data-f="sim">Sim, concluí 100%</button><button type="button" class="btn" data-f="nao">Não, ficou faltando</button>')+
      '<button type="button" class="btn" data-f="cancel">Voltar</button></div>';
  }else{
    var falta=t.meta!=null?Math.max(0,t.meta-(f.n||0)):null;
    if(!f.faltou&&falta!=null) f.faltou="Faltam "+falta+" de "+t.meta;
    h+='<p class="st">Concluiu 100%? Não. Vamos registrar o que ficou.</p>';
    h+='<label>O que ficou faltando?<textarea id="f-falta" rows="3">'+esc(f.faltou)+'</textarea></label>';
    h+='<p class="st">Se criar uma nova tarefa com o pendente, para quando ela fica?</p><div class="row">'+
      [["hoje","Hoje"],["amanha","Amanhã"],["semdia","Sem dia"]].map(function(o){return '<button type="button" class="btn'+(f.quando===o[0]?' on':'')+'" data-f="q-'+o[0]+'">'+o[1]+'</button>';}).join("")+'</div>';
    h+='<div class="row"><button type="button" class="btn primary" data-f="fin-novo">Concluir e criar nova tarefa</button><button type="button" class="btn" data-f="fin-sem">Concluir sem criar</button><button type="button" class="btn" data-f="back">Voltar</button></div>';
  }
  $("sheet").innerHTML=h;
  $("dlg").hidden=false;
  growAll();
}
function finalize(createNew,complete){
  var f=flow,t=f.t,today=fmt(new Date()),iso=new Date().toISOString();
  grab();
  var data={status:"concluida",andamento:false,concluidaEm:iso,concluidaDia:today,completo:complete,faltou:complete?null:(f.faltou.trim()||null),horaInicio:f.ini||null,horaFim:f.fim||null};
  if(t.meta!=null) data.feito=f.n!=null?f.n:t.meta;
  patch(t.id,data).then(function(ok){
    if(!ok)return;
    if(createNew){
      var falta=t.meta!=null?Math.max(1,t.meta-(data.feito||0)):null;
      var nd={title:t.meta!=null?t.title:(f.faltou.trim()||(t.title+" (pendente)")),descricao:t.meta!=null?null:("Pendente de: "+t.title),
        status:"fazer",andamento:false,urgente:false,compromisso:false,quando:t.quando||"depois",dia:null,diaFim:null,horario:null,prazo:null,
        duracao:t.duracao||null,esperando:null,cobrarEm:null,meta:falta,feito:falta!=null?0:null,criadaEm:iso,origemId:t.id};
      if(f.quando==="hoje")nd.dia=today;else if(f.quando==="amanha")nd.dia=addDays(today,1);
      col.add(nd).catch(function(){toast("A tarefa foi concluída, mas a nova não foi criada.");});
    }
    closeDlg();
    toast("Concluída: "+short(t.title));
  });
}

/* ---------- eventos ---------- */
function movePatch(v,t,today){
  var d={urgente:false};
  if(t.status==="aguardando"){d.status="fazer";d.aguardandoPor=null;d.aguardandoData=null;}
  if(v==="inicio"){d.quando="comecar";d.compromisso=false;d.dia=today;}
  else if(v==="noite"){d.quando="noite";d.compromisso=false;d.dia=today;}
  else if(v==="hoje"){d.quando="depois";d.compromisso=false;d.dia=today;}
  else if(v==="amanha"){d.compromisso=false;d.dia=addDays(today,1);}
  else if(v==="compromisso"){d.compromisso=true;if(!t.dia)d.dia=today;}
  return d;
}
function act(a,id,b){
  var today=fmt(new Date());
  if(a==="panel"){var k=b.dataset.key,cur=b.getAttribute("aria-expanded")==="true";manual[k]=!cur;if(k!=="noite")lsSet("painel-"+k,cur?"0":"1");render();return;}
  if(a==="status"){openMenu=(openMenu==="s:"+id)?null:"s:"+id;render();return;}
  if(a==="move"){openMenu=(openMenu==="m:"+id)?null:"m:"+id;render();return;}
  if(a==="setst"){
    var t0=findAny(id);openMenu=null;render();
    if(!t0)return;
    var v=b.dataset.v;
    if(v==="acompanhando"){openDetail(id,true);toast("Diga quem você espera e quando cobrar, depois toque em Salvar.");return;}
    var d={status:"fazer",andamento:v==="andamento",esperando:null,cobrarEm:null};
    if(v==="andamento"&&!t0.iniciadaEm)d.iniciadaEm=new Date().toISOString();
    patch(id,d);
    return;
  }
  if(a==="setmv"){
    var t1=findAny(id);openMenu=null;render();
    if(!t1)return;
    var mv=b.dataset.v;
    patch(id,movePatch(mv,t1,today)).then(function(ok){
      if(!ok)return;
      toast(mv==="compromisso"?"Virou compromisso. Aparece na coluna da direita.":(mv==="amanha"?"Movida para amanhã. Abra a tarefa para escolher outro dia.":"Movida."));
    });
    return;
  }
  if(a==="view"){view=(b.dataset.v==="lista")?"lista":"quadros";lsSet("visao",view);render();return;}
  if(a==="ofilter"){ofilter=b.dataset.v||"todas";render();return;}
  if(a==="calprev"){calOff--;render();return;}
  if(a==="calnext"){calOff++;render();return;}
  if(a==="day"){openDay(b.dataset.date);return;}
  if(a==="allevt"){openAllEvt();return;}
  if(a==="newprazo"){openNewPrazo();return;}
  if(a==="open"){openDetail(id);return;}
  if(a==="conta"){openConta();return;}
  if(a==="sair"){Promise.resolve(sb.auth.signOut()).then(function(){},function(){});return;}
  if(a==="done"){var t=findAny(id);if(t&&t.status==="concluida")openDetail(id);else openFlow(id);return;}
}
document.querySelector("main").addEventListener("click",function(e){
  var b=e.target.closest("[data-act]");
  var keep=b&&(b.dataset.act==="status"||b.dataset.act==="move"||b.dataset.act==="setst"||b.dataset.act==="setmv");
  if(openMenu&&!keep){openMenu=null;render();}
  if(!b)return;
  act(b.dataset.act,b.dataset.id,b);
});
document.querySelector("main").addEventListener("keydown",function(e){
  if((e.key==="Enter"||e.key===" ")&&e.target.classList&&(e.target.classList.contains("card")||e.target.classList.contains("lrow"))){e.preventDefault();openDetail(e.target.dataset.id);}
  if(e.key==="Escape"&&openMenu){openMenu=null;render();}
});
$("dlg").addEventListener("click",function(e){if(e.target===$("dlg")){if($("sheet").dataset.ids)ackPopup();closeDlg();}});
document.addEventListener("keydown",function(e){if(e.key==="Escape"&&!$("dlg").hidden){if($("sheet").dataset.ids)ackPopup();closeDlg();}});
$("sheet").addEventListener("input",function(e){
  if(e.target&&e.target.tagName==="TEXTAREA"){e.target.style.height="auto";e.target.style.height=(e.target.scrollHeight+2)+"px";}
});
$("sheet").addEventListener("change",function(e){
  if(e.target.id==="d-status"){$("d-acomp").hidden=e.target.value!=="acompanhando";if($("d-agu"))$("d-agu").hidden=e.target.value!=="aguardando";}
});
$("sheet").addEventListener("click",function(e){
  var b=e.target.closest("[data-d],[data-f],[data-p],[data-r],[data-n],[data-c]");if(!b)return;
  var today=fmt(new Date());
  if(b.dataset.c){var cid=b.dataset.c;closeDlg();openDetail(cid);return;}
  if(b.dataset.n){
    var nn=b.dataset.n;
    if(nn==="cancel")return closeDlg();
    var ntitle=$("n-title").value.trim();
    if(!ntitle){toast("Digite o título.");return;}
    if(nn==="prazo-save"){
      var pz=$("n-prazo").value;
      if(!pz){toast("Escolha o prazo.");return;}
      var nt={title:ntitle,descricao:null,status:"fazer",andamento:false,quando:$("n-quando").value,dia:today,diaFim:null,prazo:pz,urgente:false,compromisso:false,
        horario:null,duracao:null,meta:null,feito:null,esperando:null,cobrarEm:null,criadaEm:new Date().toISOString()};
      return col.add(nt).then(function(){closeDlg();toast("Adicionada: "+short(ntitle));},function(){toast("Não foi possível salvar.");});
    }
    return;
  }
  if(b.dataset.p){
    ackPopup();closeDlg();
    if(b.dataset.p==="ir"){
      manual.revisar=true;lsSet("painel-revisar","1");render();
      var el=document.querySelector('[data-key="revisar"]');
      if(el&&el.scrollIntoView)el.scrollIntoView({behavior:"smooth",block:"start"});
    }
    return;
  }
  if(b.dataset.d){
    var d=b.dataset.d, t=findAny(detailId);
    if(d==="fechar")return closeDlg();
    if(d==="save")return saveDetail();
    if(d==="del-ask"){$("d-main").hidden=true;$("d-del").hidden=false;return;}
    if(d==="del-no"){$("d-main").hidden=false;$("d-del").hidden=true;return;}
    if(!t)return;
    if(d.indexOf("mv-")===0)return patch(t.id,movePatch(d.slice(3),t,today)).then(function(ok){if(ok){closeDlg();toast("Movida.");}});
    if(d==="del-yes")return col.doc(t.id).delete().then(function(){closeDlg();toast("Excluída.");},function(){toast("Não foi possível excluir.");});
    if(d==="amanha")return patch(t.id,{dia:addDays(today,1),diaFim:null,urgente:false,status:"fazer",esperando:null,cobrarEm:null,aguardandoPor:null,aguardandoData:null}).then(function(ok){if(ok){closeDlg();toast("Passou para amanhã.");}});
    if(d==="reabrir")return patch(t.id,{status:"fazer",concluidaEm:null,concluidaDia:null,completo:null}).then(function(ok){if(ok)closeDlg();});
    if(d==="concluir"){var id=t.id;closeDlg();return openFlow(id);}
    return;
  }
  var f=b.dataset.f;
  if(f==="cancel")return closeDlg();
  grab();
  if(f==="sim")return finalize(false,true);
  if(f==="nao"){flow.step="b";return renderFlow();}
  if(f==="go"){
    var meta=flow.t.meta, n=flow.n!=null?flow.n:meta;
    if(n>=meta)return finalize(false,true);
    flow.step="b";flow.faltou="";return renderFlow();
  }
  if(f==="back"){flow.step="a";return renderFlow();}
  if(f.indexOf("q-")===0){flow.quando=f.slice(2);return renderFlow();}
  if(f==="fin-novo")return finalize(true,false);
  if(f==="fin-sem")return finalize(false,false);
});

$("add").addEventListener("submit",function(e){
  e.preventDefault();
  var inp=$("newtitle"), title=inp.value.trim().slice(0,200), where=$("addwhere").value;
  if(!title){toast("Digite o título da tarefa.");return;}
  if(!col){toast("Banco de dados indisponível nesta tela. Recarregue a página.");return;}
  var today=fmt(new Date());
  var d={title:title,descricao:null,status:"fazer",andamento:false,quando:"depois",dia:today,diaFim:null,prazo:null,urgente:false,compromisso:false,
    horario:null,duracao:null,meta:null,feito:null,esperando:null,cobrarEm:null,criadaEm:new Date().toISOString()};
  d.origem=$("addorigem").value||((ofilter!=="todas"&&ofilter!=="sem")?ofilter:null);
  if(where==="aguardando"){d.status="aguardando";d.aguardandoPor=null;d.aguardandoData=null;}
  if(where==="inicio")d.quando="comecar";
  else if(where==="noite")d.quando="noite";
  else if(where==="amanha-noite"){d.dia=addDays(today,1);d.quando="noite";}
  else if(where==="urgente")d.urgente=true;
  else if(where==="amanha")d.dia=addDays(today,1);
  else if(where==="amanha-inicio"){d.dia=addDays(today,1);d.quando="comecar";}
  inp.value="";
  try{
    col.add(d).then(function(){toast("Adicionada: "+short(title));},function(err){inp.value=title;toast("Não salvou ("+((err&&(err.code||err.message))||"erro")+"). Tente de novo.");});
  }catch(ex){inp.value=title;toast("Erro ao salvar: "+((ex&&(ex.code||ex.message))||"desconhecido"));}
});

/* painéis lembrados neste navegador; #revisar abre todos */
["urgente","revisar","inicio","hoje","proximos","acomp","aguard","finalizadas"].forEach(function(k){
  var v=lsGet("painel-"+k);if(v==="1")manual[k]=true;else if(v==="0")manual[k]=false;
});
function checkHash(){
  if(location.hash==="#revisar"){["urgente","revisar","inicio","hoje","proximos","acomp","aguard","finalizadas"].forEach(function(k){manual[k]=true;});}
}
window.addEventListener("hashchange",function(){checkHash();render();});
checkHash();

/* ---------- conta, login e banco (Supabase) ---------- */
var flashMsg=null, CFG=window.APP_CONFIG||{}, sb=null, me=null, rows=[], pollT=null, authMode="entrar", recovery=/type=recovery/.test(location.hash||"");

function isLocal(){return (CFG.modo||"local")==="local";}
function cfgOk(){
  if(isLocal()) return true;
  return /^https:\/\//.test(CFG.url||"")&&(CFG.anonKey||"").length>30&&!/SUA_|SEU-/.test((CFG.url||"")+(CFG.anonKey||""));
}
function ptErr(e){
  var m=String((e&&(e.message||e.error_description||e.code))||e||"");
  if(/Invalid login credentials/i.test(m)) return "E-mail ou senha incorretos.";
  if(/already registered|already been registered/i.test(m)) return "Este e-mail já tem conta. Use a aba Entrar.";
  if(/at least \d+ characters|weak.?password|Password should/i.test(m)) return "A senha precisa ter pelo menos 8 caracteres.";
  if(/rate limit|too many|over_email_send_rate_limit|429/i.test(m)) return "Muitas tentativas seguidas. Espere alguns minutos e tente de novo.";
  if(/not confirmed/i.test(m)) return "Confirme seu e-mail antes de entrar (veja a caixa de entrada e o spam).";
  if(/valid email|invalid format|email address.*invalid/i.test(m)) return "Esse e-mail não parece válido.";
  if(/Failed to fetch|NetworkError|Load failed/i.test(m)) return "Sem conexão com o servidor. Confira sua internet.";
  return "Não foi possível concluir. Tente de novo.";
}

/* ----- telas de entrada ----- */
function showAuth(msg,ok){
  $("auth").hidden=false; document.querySelector("main").hidden=true;
  $("dlg").hidden=true; $("sheet").innerHTML="";
  renderAuth(msg,ok);
}
function showApp(){ $("auth").hidden=true; document.querySelector("main").hidden=false; }
function renderAuth(msg,ok){
  var m=authMode, h='<div class="authcard"><p class="auth-k">Minhas tarefas · beta</p>';
  if(!cfgOk()){
    h+='<h1>Falta configurar</h1><p class="st">Preencha o arquivo <b>config.js</b> com o endereço e a chave pública do seu projeto no Supabase.</p></div>';
    $("auth").innerHTML=h; return;
  }
  var title={entrar:"Entrar",criar:"Criar conta",esqueci:"Recuperar senha",nova:"Escolha uma nova senha"}[m];
  h+='<h1>'+title+'</h1>';
  if(m==="entrar"||m==="criar"){
    h+='<div class="vt authtabs" role="group" aria-label="Entrar ou criar conta"><button type="button" class="vb" data-au="entrar" aria-pressed="'+(m==="entrar")+'">Entrar</button><button type="button" class="vb" data-au="criar" aria-pressed="'+(m==="criar")+'">Criar conta</button></div>';
  }
  if(m==="criar") h+='<p class="st">Seu sistema de tarefas é só seu. Ninguém mais vê o que você escreve aqui.</p>';
  if(m==="esqueci") h+='<p class="st">Digite o e-mail da conta. Se ele existir, enviamos um link para criar uma senha nova.</p>';
  h+='<form id="authform" novalidate>';
  if(m!=="nova") h+='<label>E-mail<input id="a-email" type="email" inputmode="email" autocomplete="email" autocapitalize="none" spellcheck="false" required></label>';
  if(m!=="esqueci") h+='<label>'+(m==="nova"?'Nova senha':'Senha')+(m!=="entrar"?' (mínimo 8 caracteres)':'')+'<input id="a-pass" type="password" autocomplete="'+(m==="entrar"?'current-password':'new-password')+'" minlength="8" required></label>';
  if(m==="criar") h+='<label class="chk"><input id="a-ok" type="checkbox">Li e aceito a <a href="privacidade.html" target="_blank" rel="noopener">política de privacidade</a></label>';
  h+='<p class="authmsg'+(ok?' ok':'')+'" id="a-msg" role="status">'+esc(msg||"")+'</p>';
  h+='<button type="submit" class="btn primary authgo" id="a-go">'+({entrar:"Entrar",criar:"Criar minha conta",esqueci:"Enviar link",nova:"Salvar nova senha"}[m])+'</button></form>';
  if(m==="entrar") h+='<p class="authlinks"><button type="button" class="lnk" data-au="esqueci">Esqueci minha senha</button></p>';
  if(m==="esqueci"||m==="nova") h+='<p class="authlinks"><button type="button" class="lnk" data-au="entrar">Voltar para entrar</button></p>';
  h+='<p class="authfoot"><a href="privacidade.html" target="_blank" rel="noopener">Política de privacidade</a></p></div>';
  $("auth").innerHTML=h;
  var f=$(m==="nova"?"a-pass":"a-email"); if(f&&msg===undefined) try{f.focus();}catch(x){}
}
function authBusy(on){var b=$("a-go");if(b){b.disabled=on;b.textContent=on?"Aguarde…":b.dataset.t||b.textContent;}}
function authMsg(t,ok){var el=$("a-msg");if(el){el.textContent=t||"";el.classList.toggle("ok",!!ok);}}

async function submitAuth(){
  flashMsg=null;
  var m=authMode, em=$("a-email")?$("a-email").value.trim():"", pw=$("a-pass")?$("a-pass").value:"";
  if(m!=="nova"&&!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)){authMsg("Digite um e-mail válido.");return;}
  if((m==="entrar"||m==="criar"||m==="nova")&&!pw){authMsg("Digite a senha.");return;}
  if((m==="criar"||m==="nova")&&pw.length<8){authMsg("A senha precisa ter pelo menos 8 caracteres.");return;}
  if(m==="criar"&&!$("a-ok").checked){authMsg("Marque que leu a política de privacidade.");return;}
  var go=$("a-go"); go.dataset.t=go.textContent; authBusy(true); authMsg("");
  try{
    var r;
    if(m==="entrar"){
      r=await sb.auth.signInWithPassword({email:em,password:pw});
      if(r.error) throw r.error;
    }else if(m==="criar"){
      r=await sb.auth.signUp({email:em,password:pw,options:{emailRedirectTo:location.origin+location.pathname}});
      if(r.error) throw r.error;
      if(!r.data.session){ authBusy(false); authMode="entrar"; renderAuth("Conta criada. Enviamos um e-mail de confirmação: abra o link e depois entre.",true); return; }
    }else if(m==="esqueci"){
      r=await sb.auth.resetPasswordForEmail(em,{redirectTo:location.origin+location.pathname});
      if(r.error) throw r.error;
      authBusy(false); authMode="entrar"; renderAuth("Se esse e-mail tiver conta, o link chegou na caixa de entrada (veja o spam).",true); return;
    }else if(m==="nova"){
      r=await sb.auth.updateUser({password:pw});
      if(r.error) throw r.error;
      recovery=false; history.replaceState(null,"",location.pathname+location.search);
      var s=await sb.auth.getSession(); handleSession(s.data.session); return;
    }
  }catch(e){ authBusy(false); authMsg(ptErr(e)); return; }
  authBusy(false);
}

/* ----- sessão ----- */
function handleSession(session){
  var u=session&&session.user?session.user:null;
  if(!u){
    me=null; rows=[]; loaded=false; failed=false; stopPoll();
    if(!recovery){ authMode="entrar"; showAuth(flashMsg,!!flashMsg); }
    return;
  }
  if(recovery){ authMode="nova"; showAuth(); return; }
  if(me&&me.id===u.id) return;
  me=u; showApp(); $("who").textContent=u.email||"";
  loaded=false; failed=false; diag=""; render();
  Promise.resolve(sb.rpc("registrar_acesso")).then(function(){},function(){});
  pull(); startPoll();
}
function startPoll(){ stopPoll(); pollT=setInterval(function(){ if(!document.hidden) pull(); },30000); }
function stopPoll(){ if(pollT){clearInterval(pollT);pollT=null;} }

/* ----- leitura e escrita ----- */
function apply(){
  var hoje=fmt(new Date());
  var all=rows.map(function(r){var o=Object.assign({},r.data||{});o.id=r.id;return o;});
  tasks=all.filter(function(t){return t.status==="fazer"||t.status==="acompanhando"||t.status==="aguardando";});
  doneTasks=all.filter(function(t){return t.concluidaDia===hoje;});
  doneTasks.sort(function(a,b){return String(b.concluidaEm||"").localeCompare(String(a.concluidaEm||""));});
  loaded=true; failed=false; render(); maybePopup(); updateLocalNote();
}
function pull(){
  if(!sb||!me) return Promise.resolve();
  return Promise.resolve(sb.from("tarefas").select("id,data").order("criada_em",{ascending:false}).limit(3000)).then(function(r){
    if(r.error) throw r.error;
    rows=r.data||[]; apply();
  }).catch(function(e){
    diag=String((e&&(e.code||e.message))||"erro");
    if(!loaded){ failed=true; render(); }
  });
}
var colCloud={
  add:function(obj){
    return Promise.resolve(sb.from("tarefas").insert({data:obj}).select("id,data").single()).then(function(r){
      if(r.error) throw r.error;
      rows.unshift(r.data); apply(); return r.data;
    });
  },
  doc:function(id){
    return {
      update:function(p){
        return Promise.resolve(sb.rpc("atualizar_tarefa",{p_id:id,p_patch:p})).then(function(r){
          if(r.error) throw r.error;
          for(var i=0;i<rows.length;i++){ if(rows[i].id===id){ rows[i].data=Object.assign({},rows[i].data,p); break; } }
          apply();
        });
      },
      delete:function(){
        return Promise.resolve(sb.from("tarefas").delete().eq("id",id)).then(function(r){
          if(r.error) throw r.error;
          rows=rows.filter(function(x){return x.id!==id;}); apply();
        });
      }
    };
  }
};


/* ----- modo local: tudo fica neste navegador, sem conta e sem servidor ----- */
var LSK="minhas-tarefas-v1", LSB="minhas-tarefas-backup";
function localLoad(){ try{ var a=JSON.parse(window.localStorage.getItem(LSK)||"[]"); return Array.isArray(a)?a:[]; }catch(e){ return []; } }
function localSave(){
  try{ window.localStorage.setItem(LSK,JSON.stringify(rows)); return true; }
  catch(e){ toast("Não foi possível salvar neste navegador. Se estiver em aba privada, abra em uma aba normal."); return false; }
}
function newId(){ return (window.crypto&&crypto.randomUUID)?crypto.randomUUID():("t"+Date.now().toString(36)+Math.random().toString(36).slice(2,8)); }
var colLocal={
  add:function(obj){
    var row={id:newId(),data:obj,criada_em:new Date().toISOString()};
    rows.unshift(row);
    if(!localSave()){ rows.shift(); return Promise.reject(new Error("save")); }
    apply(); return Promise.resolve(row);
  },
  doc:function(id){
    return {
      update:function(p){
        for(var i=0;i<rows.length;i++){
          if(rows[i].id===id){
            var antes=rows[i].data; rows[i].data=Object.assign({},antes,p);
            if(!localSave()){ rows[i].data=antes; return Promise.reject(new Error("save")); }
            break;
          }
        }
        apply(); return Promise.resolve();
      },
      delete:function(){
        var antes=rows; rows=rows.filter(function(x){return x.id!==id;});
        if(!localSave()){ rows=antes; return Promise.reject(new Error("save")); }
        apply(); return Promise.resolve();
      }
    };
  }
};
function lastBackup(){ try{ return window.localStorage.getItem(LSB)||""; }catch(e){ return ""; } }
function updateLocalNote(){
  var el=$("localnote"); if(!el||!isLocal()) return;
  var lb=lastBackup(), velho=!lb||((Date.now()-new Date(lb).getTime())>7*86400000);
  var warn=rows.length>=3&&velho;
  el.classList.toggle("warn",warn);
  el.querySelector("span").textContent=warn?"Suas tarefas ficam só neste navegador e você ainda não fez backup (ou faz mais de 7 dias).":"Suas tarefas ficam salvas só neste navegador.";
  el.hidden=false;
}
function importData(file){
  file.text().then(function(txt){
    var j=JSON.parse(txt), list=Array.isArray(j)?j:(j&&j.tarefas);
    if(!Array.isArray(list)) throw new Error("formato");
    var have={}; rows.forEach(function(r){have[r.id]=1;});
    var add=[];
    list.slice(0,3000).forEach(function(o){
      if(!o||typeof o!=="object"||typeof o.title!=="string"||!o.title.trim()) return;
      var d=Object.assign({},o), oid=(typeof d.id==="string"&&d.id.length<80)?d.id:null; delete d.id;
      if(oid&&have[oid]) return;
      if(JSON.stringify(d).length>=20000) return;
      var id=oid||newId(); have[id]=1;
      add.push({id:id,data:d,criada_em:(typeof d.criadaEm==="string"?d.criadaEm:new Date().toISOString())});
    });
    if(!add.length){ toast("Nada novo para restaurar nesse arquivo."); return; }
    if(rows.length+add.length>3000) throw new Error("limite");
    var antes=rows; rows=rows.concat(add);
    if(!localSave()){ rows=antes; return; }
    apply(); closeDlg(); toast("Backup restaurado: "+add.length+(add.length===1?" tarefa.":" tarefas."));
  }).catch(function(){ toast("Não consegui ler esse arquivo. Use um backup baixado deste sistema."); });
}
function openLocal(){
  var h='<h2 class="sh">Meus dados e backup</h2>'+
    '<p class="st">Suas tarefas ficam salvas só neste navegador, neste aparelho. Se você limpar os dados do navegador, usar outro navegador ou trocar de aparelho, elas não aparecem. Baixe um backup de vez em quando.</p>'+
    '<div class="row"><button type="button" class="btn primary" data-k="export">Baixar backup</button><button type="button" class="btn" data-k="import">Restaurar backup</button></div>'+
    '<input id="k-file" type="file" accept="application/json,.json" hidden>'+
    '<div class="row"><a class="btn" href="privacidade.html" target="_blank" rel="noopener">Política de privacidade</a>'+
    (CFG.contato?'<a class="btn" href="mailto:'+esc(CFG.contato)+'?subject='+encodeURIComponent("Beta Minhas tarefas")+'">Falar com o responsável</a>':'')+'</div>'+
    '<div class="row" id="k-main"><button type="button" class="btn danger" data-k="del-ask">Apagar todas as tarefas</button><button type="button" class="btn" data-k="fechar">Fechar</button></div>'+
    '<div id="k-del" hidden style="display:flex;flex-direction:column;gap:10px"><p class="st">Isso apaga todas as tarefas deste navegador, sem volta (a menos que você tenha um backup). Para confirmar, digite APAGAR.</p>'+
    '<input id="k-conf" type="text" autocomplete="off" autocapitalize="characters" aria-label="Digite APAGAR">'+
    '<div class="row"><button type="button" class="btn danger" data-k="del-yes">Apagar de vez</button><button type="button" class="btn" data-k="del-no">Cancelar</button></div></div>';
  $("sheet").innerHTML=h; $("dlg").hidden=false;
  $("k-file").addEventListener("change",function(){ if(this.files&&this.files[0]) importData(this.files[0]); });
}
function startLocal(){
  document.body.classList.add("local");
  col=colLocal; me={id:"local",email:""};
  $("who").textContent=""; document.querySelector("[data-act=conta]").textContent="Meus dados e backup";
  rows=localLoad(); showApp(); apply();
  window.addEventListener("storage",function(e){ if(e.key===LSK){ rows=localLoad(); apply(); } });
  try{ if(navigator.storage&&navigator.storage.persist) navigator.storage.persist(); }catch(x){}
  startDayTimer();
}
function startDayTimer(){ setInterval(function(){ if(loaded&&fmt(new Date())!==curDay){ popupDone=false; render(); maybePopup(); } },60000); }

/* ----- minha conta ----- */
function openConta(){
  if(!me) return;
  if(isLocal()) return openLocal();
  var h='<h2 class="sh">Minha conta</h2><p class="st">'+esc(me.email||"")+'</p>'+
    '<div class="row"><button type="button" class="btn" data-k="export">Baixar meus dados</button><a class="btn" href="privacidade.html" target="_blank" rel="noopener">Política de privacidade</a>'+
    (CFG.contato?'<a class="btn" href="mailto:'+esc(CFG.contato)+'?subject='+encodeURIComponent("Beta Minhas tarefas")+'">Falar com o responsável</a>':'')+'</div>'+
    '<div class="row" id="k-main"><button type="button" class="btn danger" data-k="del-ask">Excluir minha conta</button><button type="button" class="btn" data-k="fechar">Fechar</button></div>'+
    '<div id="k-del" hidden style="display:flex;flex-direction:column;gap:10px"><p class="st">Isso apaga sua conta e todas as suas tarefas, sem volta. Para confirmar, digite EXCLUIR.</p>'+
    '<input id="k-conf" type="text" autocomplete="off" autocapitalize="characters" aria-label="Digite EXCLUIR">'+
    '<div class="row"><button type="button" class="btn danger" data-k="del-yes">Excluir de vez</button><button type="button" class="btn" data-k="del-no">Cancelar</button></div></div>';
  $("sheet").innerHTML=h; $("dlg").hidden=false;
}
function exportData(){
  if(isLocal()){ try{ window.localStorage.setItem(LSB,new Date().toISOString()); }catch(x){} updateLocalNote(); }
  var data={exportadoEm:new Date().toISOString(),email:me.email,tarefas:rows.map(function(r){return Object.assign({id:r.id},r.data);})};
  var blob=new Blob([JSON.stringify(data,null,2)],{type:"application/json"});
  var a=document.createElement("a"); a.href=URL.createObjectURL(blob); a.download="minhas-tarefas-"+fmt(new Date())+".json";
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(function(){URL.revokeObjectURL(a.href);},1000);
}
$("sheet").addEventListener("click",function(e){
  var b=e.target.closest("[data-k]"); if(!b) return;
  var k=b.dataset.k;
  if(k==="fechar") return closeDlg();
  if(k==="export") return exportData();
  if(k==="import") return $("k-file").click();
  if(k==="del-ask"){ $("k-main").hidden=true; $("k-del").hidden=false; $("k-conf").focus(); return; }
  if(k==="del-no"){ $("k-main").hidden=false; $("k-del").hidden=true; return; }
  if(k==="del-yes"){
    if(isLocal()){
      if($("k-conf").value.trim().toUpperCase()!=="APAGAR"){ toast("Digite APAGAR para confirmar."); return; }
      var antes=rows; rows=[]; if(!localSave()){ rows=antes; return; }
      apply(); closeDlg(); toast("Todas as tarefas foram apagadas."); return;
    }
    if($("k-conf").value.trim().toUpperCase()!=="EXCLUIR"){ toast("Digite EXCLUIR para confirmar."); return; }
    Promise.resolve(sb.rpc("excluir_minha_conta")).then(function(r){
      if(r.error) throw r.error;
      flashMsg="Conta e dados excluídos.";
      return sb.auth.signOut({scope:"local"});
    }).then(function(){ closeDlg(); authMode="entrar"; showAuth(flashMsg,true); },
      function(){ toast("Não foi possível excluir agora. Tente de novo."); });
  }
});
$("auth").addEventListener("click",function(e){
  var b=e.target.closest("[data-au]"); if(!b) return;
  flashMsg=null; authMode=b.dataset.au; renderAuth();
});
$("auth").addEventListener("submit",function(e){ e.preventDefault(); submitAuth(); });

/* ----- início ----- */
render();
function startCloud(){
  if(!window.supabase||!window.supabase.createClient){
    $("auth").hidden=false; $("auth").innerHTML='<div class="authcard"><h1>Sem conexão</h1><p class="st">Não foi possível carregar o sistema. Confira sua internet e recarregue a página.</p></div>'; return;
  }
  col=colCloud;
  sb=window.supabase.createClient(CFG.url,CFG.anonKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
  sb.auth.onAuthStateChange(function(ev,session){
    /* adiado: a biblioteca avisa para não chamar o Supabase de dentro deste retorno */
    setTimeout(function(){
      if(ev==="PASSWORD_RECOVERY"){ recovery=true; authMode="nova"; showAuth(); return; }
      if(ev==="SIGNED_OUT"){ handleSession(null); return; }
      if(session) handleSession(session);
    },0);
  });
  sb.auth.getSession().then(function(r){ handleSession(r.data&&r.data.session); },function(){ showAuth(); });
  document.addEventListener("visibilitychange",function(){ if(!document.hidden&&me) pull(); });
  startDayTimer();
}
(function init(){
  document.querySelector("main").hidden=true;
  if(isLocal()){ startLocal(); return; }
  if(!cfgOk()){ showAuth(); return; }
  var sc=document.createElement("script");
  sc.src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js";
  sc.onload=startCloud; sc.onerror=startCloud;
  document.head.appendChild(sc);
})();
})();
