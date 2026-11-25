import {blank,today,current,shift,charges,cash,demo} from './model.js';
// Supabase Auth and PostgREST use the signed-in member's permissions.
const endpoint='https://goriksanlyejevfycjsx.supabase.co';
const publicKey='sb_publishable_oE08wI3aXPNtUt514sr5zA_5AGllrGk';
const types={house:'Casa',apartment:'Apartamento',warehouse:'Galpão',commercial_room:'Sala comercial',store:'Loja',land:'Terreno',other:'Outro'};
let auth=JSON.parse(sessionStorage.getItem('af.cloud.session')||'null');
let renewing;
function remember(s){auth=s; if(s)sessionStorage.setItem('af.cloud.session',JSON.stringify(s));else sessionStorage.removeItem('af.cloud.session')}
async function api(path,options={},token){
 const res=await fetch(endpoint+path,{...options,headers:{apikey:publicKey,'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{}),...options.headers}});
 const text=await res.text();const result=text?JSON.parse(text):null;
 if(!res.ok)throw Error(result?.message||result?.msg||result?.error_description||'Erro ao acessar o Supabase.');
 return result;
}
async function login(email,password){remember(await api('/auth/v1/token?grant_type=password',{method:'POST',body:JSON.stringify({email,password})}))}
async function token(){
 if(!auth)throw Error('Entre com sua conta do Aluguel Fácil.');
 if(auth.expires_at*1000<Date.now()+60000){
 renewing??=api('/auth/v1/token?grant_type=refresh_token',{method:'POST',body:JSON.stringify({refresh_token:auth.refresh_token})}).then(remember).finally(()=>renewing=null);
 await renewing;
 }
 return auth.access_token;
}
async function listRows(table,query,order='id'){
 const all=[];let offset=0;while(true){
 const rows=await api('/rest/v1/'+table+'?'+query+'&order='+order+'&offset='+offset+'&limit=200',{},await token());
 all.push(...rows);if(rows.length<200)return all;offset+=rows.length;
 }
}
async function onlineTenants(){return listRows('tenant_members','select=tenant_id,role,tenants(name)&status=eq.active&user_id=eq.'+encodeURIComponent(auth.user.id))}
async function loadOnline(t){
 const filter='tenant_id=eq.'+encodeURIComponent(t)+'&select=';
 const rows=(table,cols,order)=>listRows(table,filter+cols,order);
 const [props,units,people,contracts,payments,jobs,expenses]=await Promise.all([
 rows('properties','id,name,property_type,street,number,city'),rows('property_units','id,name,property_id,status'),
 rows('renters','id,name,phone'),rows('rental_contracts','id,unit_id,renter_id,start_date,end_date,monthly_rent,due_day,status'),
 rows('af_payments','contract_id,period,received,cents','contract_id,period'),rows('af_jobs','id,property_id,name,scheduled,completed'),rows('af_expenses','id,name,paid,cents')]);
 const unitMap=new Map(units.map(u=>[u.id,u]));
 return {units,properties:props.map(p=>({id:p.id,name:p.name,type:types[p.property_type]||'Outro',address:[p.street,p.number,p.city].filter(Boolean).join(', ')})),
 people:people.map(p=>({...p,phone:p.phone||''})),leases:contracts.filter(c=>['active','ended'].includes(c.status)).map(c=>({id:c.id,unit:c.unit_id,property:unitMap.get(c.unit_id)?.property_id,person:c.renter_id,start:c.start_date,end:c.end_date,day:c.due_day,amount:Math.round(c.monthly_rent*100)})),
 payments:payments.map(p=>({key:p.contract_id+'/'+p.period.slice(0,7),amount:Number(p.cents),date:p.received})),
 jobs:jobs.map(j=>({id:j.id,property:j.property_id,name:j.name,date:j.scheduled,done:!!j.completed})),
 expenses:expenses.map(e=>({id:e.id,name:e.name,date:e.paid,amount:Number(e.cents)}))};
}
async function writeOnline(t,type,id,f,db,month){
 const post=async(path,body)=>api('/rest/v1/'+path,{method:'POST',body:JSON.stringify(body)},await token());
 switch(type){
 case 'property':return post('rpc/af_add_property',{t,n:f.name,k:Object.keys(types).find(k=>types[k]===f.type)||'other',addr:f.address,pid:crypto.randomUUID()});
 case 'person':{let phone=f.phone.replace(/\D/g,'');if(phone.length>11&&phone.startsWith('55'))phone=phone.slice(2);return post('renters',{tenant_id:t,name:f.name,phone:phone||null})}
 case 'lease':return post('rental_contracts',{tenant_id:t,unit_id:f.unit,renter_id:f.person,start_date:f.start,end_date:f.end,monthly_rent:f.amount/100,due_day:+f.day,status:'active'});
 case 'pay':{const c=charges(db,month).find(c=>c.key===id&&!c.paid);if(!c)throw Error('Cobrança indisponível.');return post('af_payments',{tenant_id:t,contract_id:c.id,period:month+'-01',received:f.date,cents:c.amount})}
 case 'job':return post('af_jobs',{tenant_id:t,property_id:f.property,name:f.name,scheduled:f.date});
 case 'finish':return post('rpc/af_finish_job',{t,j:id,dt:f.date,cost:f.amount});
 case 'expense':return post('af_expenses',{tenant_id:t,name:f.name,paid:f.date,cents:f.amount});
 default:throw Error('Operação desconhecida.');
 }
}
const $=s=>document.querySelector(s),pages=['Painel','Imóveis','Locatários','Contratos','Cobranças','Manutenções','Financeiro','Mais'];
const paths=['M3 11l9-8 9 8v10H4V11 M9 21v-7h6v7','M4 21V4h12v17 M16 10h4v11 M7 8h2 M11 8h2 M7 12h2 M11 12h2 M2 21h20','M16 21v-2a5 5 0 0 0-10 0v2 M11 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M18 6a3 3 0 0 1 0 6 M19 15q3 1 3 5','M5 3h10l4 4v14H5z M14 3v5h5 M8 12h8 M8 16h6','M3 6h18v13H3z M3 10h18 M7 15h3','M14 5a5 5 0 0 0-6 6l-5 6a2 2 0 0 0 3 3l6-6a5 5 0 0 0 6-7l-3 3-3-3z','M4 3v17h17 M8 16v-4 M13 16V8 M18 16V5','M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z'];
const icon=i=>'<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="'+paths[i]+'"/></svg>';
const enc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=v=>(v/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'}),date=v=>v.split('-').reverse().join('/'),monthName=m=>new Date(m+'-15T12:00:00').toLocaleDateString('pt-BR',{month:'long',year:'numeric'});
let wallet=localStorage.getItem('af.wallet')==='real'?'real':'demo',db,raw,page,month=current(),filter='Todas',action,entry='landing';
const key=()=>'af.v1.'+wallet;
let tenantId='', onlineName='', tenants=[], busy=false;
function read(){if(wallet==='cloud')return;raw=localStorage.getItem(key());db=raw?JSON.parse(raw):wallet==='demo'?demo():blank();$('#wallet').value=wallet}
function save(){if(localStorage.getItem(key())!==raw){read();throw Error('A carteira foi atualizada em outra aba. Confira e tente novamente.')}const next=JSON.stringify(db);localStorage.setItem(key(),next);raw=next}
function toast(s){$('#toast').textContent=s;clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('#toast').textContent='',3200)}
function walletChange(v){if(v==='cloud'){open('account');return}sessionStorage.removeItem('af.activeTenant');wallet=v;localStorage.setItem('af.wallet',v);read();render()}
const btn=(name,label,cl='')=>'<button type="button" class="'+cl+'" data-act="'+enc(name)+'">'+label+'</button>';
const tabItems=[['Painel','Início',0],['Imóveis','Imóveis',1],['Cobranças','Cobranças',4],['Financeiro','Financeiro',6],['Mais','Mais',7]];
function renderTabbar(active){$('#tabbar').innerHTML=tabItems.map(([route,label,i])=>'<a href="#'+route+'" '+(active===route||(['Contratos','Locatários','Manutenções'].includes(active)&&route==='Mais')?'aria-current="page"':'')+'><span class="af-tab-icone">'+icon(i)+'</span><span>'+label+'</span></a>').join('')}
const badge=s=>'<span class="pill '+(s==='Em atraso'?'late':s==='Pago'||s==='Concluída'?'':'pending')+'">'+enc(s)+'</span>';
const item=(a,b,c='',d='')=>'<div class="item"><div><h3>'+enc(a)+'</h3><small>'+enc(b)+'</small></div><div class="right">'+c+(d?'<small>'+d+'</small>':'')+'</div></div>';
const empty=s=>'<p class="empty">'+s+'</p>',panel=(title,body,extra='')=>'<section class="panel"><div class="row"><h2>'+title+'</h2>'+extra+'</div>'+body+'</section>';
const navLink=(p,label)=>'<a class="button" href="#'+p+'">'+label+'</a>';
const pname=id=>db.properties.find(x=>x.id===id)?.name||'', person=id=>db.people.find(x=>x.id===id)?.name||'';
const monthPick=()=>'<label class="filters">Mês <input id="month" aria-label="Mês de referência" type="month" min="1900-01" max="2199-12" value="'+month+'"></label>';
const card=(label,value,i,cl='')=>'<div class="card '+cl+'">'+icon(i)+' <span>'+label+'</span><strong class="num">'+value+'</strong></div>';
function chart(){const ms=Array.from({length:6},(_,i)=>shift(month,i-5)), cf=ms.map(m=>cash(db,m)),max=Math.max(1,...cf.flatMap(c=>[c.income,c.cost]));
return '<div class="chart">'+cf.map((c,i)=>'<div class="barset" title="'+monthName(ms[i])+' · Entradas '+money(c.income)+' · Saídas '+money(c.cost)+'"><i style="height:'+100*c.income/max+'%"></i><i style="height:'+100*c.cost/max+'%"></i></div>').join('')+'</div><div class="months">'+ms.map(m=>'<span>'+monthName(m).slice(0,3)+'</span>').join('')+'</div><div class="legend"><b>●</b> Entradas &nbsp; <em>●</em> Saídas</div>'}
function chargeRows(list,actions=false){return list.map(c=>{
const phone=c.person.phone.replace(/\D/g,''),url='https://wa.me/'+(phone.length<=11?'55':'')+phone+'?text='+encodeURIComponent('Olá, '+c.person.name+'! O aluguel de '+c.property.name+', no valor de '+money(c.amount)+', tem vencimento em '+date(c.due)+'.');
return item(c.property.name,c.person.name+' · '+date(c.due),money(c.amount)+' '+badge(c.status),actions&&!c.paid?'<div class="actions">'+btn('pay|'+c.key,'Registrar pagamento')+(phone?'<a class="button" target="_blank" rel="noopener" href="'+enc(url)+'">WhatsApp</a>':'')+'</div>':c.paid?'Recebido em '+date(c.paid.date):'')}).join('')||empty('Nenhuma cobrança neste período.')}
const sky='<svg class="sky" viewBox="0 0 330 150" preserveAspectRatio="xMaxYMax meet" fill="none" stroke="#95c7d0" aria-hidden="true"><defs><pattern id="win" width="14" height="14" patternUnits="userSpaceOnUse"><path d="M2 3h6v7H2z"/></pattern></defs><g transform="skewY(-8)"><path d="M14 190V104l40-12v98M54 92l17 8v90M76 190V52l57-16v154M133 36l23 12v142M166 190V88l45-14v116M211 74l22 10v106M240 190V28l58-15v177M298 13l24 11v166" fill="url(#win)"/></g></svg>';
const lpCheck='<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12 5 5 9-10"/></svg>';
const lpImg=(name,big,small,alt,w,h,eager,mid)=>'<span class="lp-frame" data-parallax><img src="/assets/img/'+name+'-'+(mid||big)+'.webp" srcset="/assets/img/'+name+'-'+small+'.webp '+small+'w, '+(mid?'/assets/img/'+name+'-'+mid+'.webp '+mid+'w, ':'')+'/assets/img/'+name+'-'+big+'.webp '+big+'w" sizes="(max-width: 899px) 100vw, 50vw" width="'+w+'" height="'+h+'" alt="'+alt+'"'+(eager?' fetchpriority="high"':' loading="lazy" decoding="async"')+'></span>';
const lpList=items=>'<ul class="lp-list">'+items.map((t,i)=>'<li style="--i:'+i+'">'+lpCheck+'<span>'+t+'</span></li>').join('')+'</ul>';
const lpMarqueeItems=['Contratos e vigências','Cobranças do mês','Pagamento em um toque','Lembrete por WhatsApp','Manutenções agendadas','Entradas e saídas','Exporta para planilha','Carteira online'];
function renderLandingV2(){
 document.body.classList.add('landing');
 $('#view').innerHTML=`<div class="lp">
  <div class="lp-progress" aria-hidden="true"><i></i></div>
  <div class="lp-navbar">
   <div class="lp-nav">
    <img class="lp-logo" src="/logotipo-cor.svg" alt="AlugaFácil" width="150" height="44">
    <nav class="lp-navlinks" aria-label="Seções da página"><button type="button" data-scroll="lp-recursos">Recursos</button><button type="button" data-scroll="lp-para-quem">Para quem é</button></nav>
    ${btn('account','Entrar','lp-btn lp-btn--ghost')}
   </div>
  </div>

  <section class="lp-hero" aria-labelledby="lp-titulo">
   <div class="lp-hero-copy">
    <p class="lp-eyebrow" data-reveal style="--d:0ms">Gestão de aluguéis para pequenos locadores</p>
    <h1 id="lp-titulo" class="lp-split">O aluguel da sua carteira, em uma visão só.</h1>
    <p class="lp-lead" data-reveal style="--d:450ms">Imóveis, contratos, cobranças e manutenções organizados no celular, sem planilhas espalhadas.</p>
    <div class="lp-actions" data-reveal style="--d:600ms">${btn('account','Começar agora','lp-btn lp-btn--primary')}${btn('demoEntry','Explorar a demonstração','lp-btn lp-btn--secondary')}</div>
    <ul class="lp-proof" data-reveal style="--d:750ms"><li>${lpCheck}Funciona no celular</li><li>${lpCheck}Carteira online ou no aparelho</li><li>${lpCheck}Exporta para planilha</li></ul>
   </div>
   <figure class="lp-media lp-media--hero" data-reveal="curtain" style="--d:150ms">
    ${lpImg('hero-celular',1600,900,'Homem sentado no sofá de casa conferindo o celular',1600,1066,true,1200)}
    <div class="lp-float lp-float--hero" aria-hidden="true">
     <span class="lp-float-label">Recebido em novembro</span>
     <strong><span data-count="185000">R$ 1.850,00</span> <small>de R$ 9.950,00</small></strong>
     <span class="lp-bar"><i style="width:19%"></i></span>
     <span class="lp-float-note">Exemplo com dados da demonstração</span>
    </div>
   </figure>
  </section>

  <section class="lp-audience" id="lp-para-quem" aria-labelledby="lp-para-quem-t">
   <h2 id="lp-para-quem-t" data-reveal>Feito para quem cuida de aluguéis no dia a dia</h2>
   <div class="lp-audience-grid">
    <article data-reveal style="--d:0ms"><h3>Locadores</h3><p>Quem aluga os próprios imóveis e quer parar de controlar tudo no caderno.</p></article>
    <article data-reveal style="--d:100ms"><h3>Administradoras</h3><p>Equipes que cuidam de vários proprietários e precisam ver tudo num só lugar.</p></article>
    <article data-reveal style="--d:200ms"><h3>Imobiliárias</h3><p>Contratos, vencimentos e manutenções da carteira de locação sob controle.</p></article>
    <article data-reveal style="--d:300ms"><h3>Carteiras familiares</h3><p>Os imóveis da família organizados, com histórico para todos acompanharem.</p></article>
   </div>
  </section>

  <div class="lp-marquee" aria-hidden="true"><div class="lp-marquee-track">${[...lpMarqueeItems,...lpMarqueeItems].map(t=>'<span>'+lpCheck+t+'</span>').join('')}</div></div>

  <section class="lp-features" id="lp-recursos" aria-label="Recursos">
   <article class="lp-feature">
    <figure class="lp-media" data-reveal="left">
     ${lpImg('imoveis-apartamento',1200,700,'Apartamento vazio e iluminado, com piso de madeira',1200,801,false)}
     <div class="lp-float" aria-hidden="true"><span class="lp-float-label">Galpão Horizonte</span><strong>R$ 3.600,00<small>/mês</small></strong><span class="lp-pill lp-pill--ok">Ocupado</span></div>
    </figure>
    <div class="lp-feature-copy" data-reveal="right">
     <p class="lp-eyebrow">01 · Imóveis e contratos</p>
     <h2>Cada imóvel com o seu contrato e o seu locatário.</h2>
     ${lpList(['Casa, apartamento, galpão ou sala comercial','Locatário e contrato ligados a cada imóvel','Vigência e dia de vencimento sempre à vista'])}
    </div>
   </article>
   <article class="lp-feature">
    <figure class="lp-media" data-reveal="right">
     ${lpImg('dinheiro-contas',1200,700,'Pessoa no sofá conferindo contas no celular, com papéis na mesa',1200,800,false)}
     <div class="lp-float" aria-hidden="true"><span class="lp-float-label">Casa Jardim das Flores</span><strong>R$ 2.400,00</strong><span class="lp-pill lp-pill--late">14 dias de atraso</span></div>
    </figure>
    <div class="lp-feature-copy" data-reveal="left">
     <p class="lp-eyebrow">02 · Cobranças e financeiro</p>
     <h2>Saiba quem pagou e quem está atrasado.</h2>
     ${lpList(['Cobranças do mês a partir dos contratos','Registre o pagamento em um toque','Lembrete pelo WhatsApp quando o locatário tem telefone','Entradas, saídas e saldo de cada mês'])}
    </div>
   </article>
   <article class="lp-feature">
    <figure class="lp-media" data-reveal="left">
     ${lpImg('manutencao',1200,700,'Homem fazendo um reparo na parede externa de uma casa',1200,800,false)}
     <div class="lp-float" aria-hidden="true"><span class="lp-float-label">Revisão da caixa-d’água</span><strong>26/11</strong><span class="lp-pill lp-pill--ok">Agendada</span></div>
    </figure>
    <div class="lp-feature-copy" data-reveal="right">
     <p class="lp-eyebrow">03 · Manutenções</p>
     <h2>Nenhum reparo esquecido.</h2>
     ${lpList(['Agende o serviço por imóvel e data','Veja o que está marcado para os próximos dias','Marque como concluída quando terminar'])}
    </div>
   </article>
  </section>

  <section class="lp-story" aria-labelledby="lp-story-t">
   <figure class="lp-story-media lp-media" data-reveal="curtain">${lpImg('sala-clara',1600,900,'Sala de estar clara e organizada',1600,1067,false,1200)}</figure>
   <div class="lp-story-card" data-reveal="right" style="--d:200ms">
    <h2 id="lp-story-t">Abra o app e saiba, em segundos:</h2>
    ${lpList(['o que vence nos próximos dias','quem está em atraso e quanto','quanto entrou e saiu no mês'])}
    ${btn('demoEntry','Ver a demonstração','lp-btn lp-btn--primary')}
   </div>
  </section>

  <section class="lp-cta" aria-labelledby="lp-cta-t">
   <h2 id="lp-cta-t" data-reveal>Comece a organizar seus aluguéis hoje.</h2>
   <p data-reveal style="--d:120ms">Entre na sua carteira online ou explore a demonstração, sem precisar de cadastro.</p>
   <div class="lp-actions" data-reveal style="--d:240ms">${btn('account','Entrar na minha carteira','lp-btn lp-btn--light')}${btn('demoEntry','Explorar a demonstração','lp-btn lp-btn--outline-light')}</div>
  </section>

  <div class="lp-footer" role="contentinfo">
   <img src="/logotipo-cor.svg" alt="AlugaFácil" width="120" height="35">
   <span>Gestão de aluguéis sem complicação.</span>
   <span>Fotos: <a href="https://www.pexels.com/pt-br/" target="_blank" rel="noopener">Pexels</a></span>
  </div>
 </div>`;
 $('#view').querySelectorAll('[data-scroll]').forEach(b=>b.onclick=()=>document.getElementById(b.dataset.scroll)?.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'}));
 lpAnimate();
}
// Animações da landing: revelar ao rolar, contador, barra de progresso, topo fixo e profundidade nas fotos.
// Sem bibliotecas; quem pede "reduzir movimento" no sistema vê tudo parado e visível.
function lpAnimate(){
 lpAnimate.stop?.();
 const root=$('#view .lp');if(!root)return;
 const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
 const h1=root.querySelector('.lp-split');
 h1.innerHTML=h1.textContent.trim().split(/\s+/).map((w,i)=>'<span class="lp-word" style="--i:'+i+'">'+w+'</span>').join(' ');
 const counters=[...root.querySelectorAll('[data-count]')];
 const showCount=(el,v)=>el.textContent=money(v);
 const runCount=el=>{const end=+el.dataset.count,t0=performance.now(),dur=1400;const step=t=>{const p=Math.min(1,(t-t0)/dur),e=1-Math.pow(1-p,3);showCount(el,p<1?Math.round(end*e):end);if(p<1&&document.body.contains(el))requestAnimationFrame(step)};requestAnimationFrame(step)};
 const nav=root.querySelector('.lp-navbar'),bar=root.querySelector('.lp-progress i');
 const els=[...root.querySelectorAll('[data-reveal]'),h1];
 if(reduce||!('IntersectionObserver' in window)){
  els.forEach(e=>e.classList.add('is-in'));
  const onScrollStatic=()=>nav.classList.toggle('is-stuck',scrollY>8);
  addEventListener('scroll',onScrollStatic,{passive:true});
  lpAnimate.stop=()=>removeEventListener('scroll',onScrollStatic);
  return;
 }
 root.classList.add('lp-anim');
 counters.forEach(el=>showCount(el,0));
 const pending=new Set(els);const reveal=el=>{if(!pending.delete(el))return;el.classList.add('is-in');el.querySelectorAll('[data-count]').forEach(c=>setTimeout(()=>runCount(c),700))};
 const io=new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting){reveal(e.target);io.unobserve(e.target)}}),{threshold:.15,rootMargin:'0px 0px -6% 0px'});
 els.forEach(e=>io.observe(e));
 const par=[...root.querySelectorAll('[data-parallax]')];
 let raf=0;
 const frame=()=>{raf=0;if(!document.body.classList.contains('landing'))return;const y=scrollY,H=innerHeight,max=document.documentElement.scrollHeight-H;
  nav.classList.toggle('is-stuck',y>8);
  bar.style.transform='scaleX('+(max>0?Math.min(1,y/max):0)+')';
  for(const el of par){const r=el.getBoundingClientRect();if(r.bottom<-100||r.top>H+100)continue;const p=(r.top+r.height/2-H/2)/(H+r.height);el.style.setProperty('--py',(p*-56).toFixed(1)+'px')}};
 const catchUp=()=>{const H=innerHeight;for(const el of pending)if(el.getBoundingClientRect().top<H*.94){reveal(el);io.unobserve(el)}};
 const onScroll=()=>{catchUp();if(!raf)raf=requestAnimationFrame(frame)};
 addEventListener('scroll',onScroll,{passive:true});addEventListener('resize',onScroll);requestAnimationFrame(frame);
 lpAnimate.stop=()=>{io.disconnect();removeEventListener('scroll',onScroll);removeEventListener('resize',onScroll);if(raf)cancelAnimationFrame(raf)};
}
// Calendário da semana no Início: contratos que começam/terminam, aluguéis, manutenções (Claude · design/ux-ui).
let wkOffset=0,wkDay=null;
const wkDays=['Seg','Ter','Qua','Qui','Sex','Sáb','Dom'],wkDaysLong=['segunda','terça','quarta','quinta','sexta','sábado','domingo'];
const wkMonths=['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
const wkSvg=d=>'<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="'+d+'"/></svg>';
const wkIcon={due:wkSvg('M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6'),late:wkSvg('M12 8v5M12 16h.01M10.3 3.9 2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0'),paid:wkSvg('m5 12 5 5 9-10'),job:wkSvg('M14.7 6.3a4 4 0 0 0 5 5l-9.4 9.4a2.1 2.1 0 0 1-3-3zM14.7 6.3l3-3'),start:wkSvg('M7 3h7l5 5v12a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM14 3v5h5M12 11v6M9 14h6'),end:wkSvg('M7 3h7l5 5v12a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM14 3v5h5M9 15h6')};
const wkTag={due:'A vencer',late:'Em atraso',paid:'Pago',job:'Manutenção',start:'Início',end:'Fim do contrato'};
const wkOrder={late:0,due:1,job:2,end:3,start:4,paid:5};
const wkAdd=(iso,n)=>{const d=new Date(iso+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)};
const wkStart=off=>{const t=today(),wd=(new Date(t+'T12:00:00Z').getUTCDay()+6)%7;return wkAdd(t,-wd+off*7)};
const wkLabel=d=>(+d.slice(8))+' '+wkMonths[+d.slice(5,7)-1];
function wkEvents(from,to){
 const ev=[],nm=(v,list,fb)=>(v&&typeof v==='object'?v.name:list.find(x=>x.id===v)?.name)||fb,names=l=>nm(l.property,db.properties,'Imóvel')+' · '+nm(l.person,db.people,'Locatário');
 for(const m of new Set([from.slice(0,7),to.slice(0,7)]))for(const c of charges(db,m)){
  if(c.due<from||c.due>to)continue;
  const type=c.status==='Pago'?'paid':c.status==='Em atraso'?'late':'due';
  ev.push({date:c.due,type,title:type==='paid'?'Aluguel recebido':'Aluguel vence',sub:names(c),amount:c.amount,act:c.paid?'':'pay|'+c.key,href:'#Cobranças'});
 }
 for(const l of db.leases){
  if(l.start>=from&&l.start<=to)ev.push({date:l.start,type:'start',title:'Contrato começa',sub:names(l),href:'#Contratos'});
  if(l.end>=from&&l.end<=to)ev.push({date:l.end,type:'end',title:'Contrato termina',sub:names(l),href:'#Contratos'});
 }
 for(const j of db.jobs)if(!j.done&&j.date>=from&&j.date<=to)ev.push({date:j.date,type:'job',title:j.name,sub:db.properties.find(p=>p.id===j.property)?.name||'',href:'#Manutenções'});
 return ev;
}
function weekCard(){
 const from=wkStart(wkOffset),to=wkAdd(from,6),now=today(),ev=wkEvents(from,to),days=Array.from({length:7},(_,i)=>wkAdd(from,i));
 const picked=days.includes(wkDay),base=days.includes(now)?now:from,overview=!picked&&!ev.some(e=>e.date===base)&&ev.some(e=>e.date>=base),sel=picked?wkDay:overview?null:base;
 const range=from.slice(5,7)===to.slice(5,7)?(+from.slice(8))+' a '+wkLabel(to):wkLabel(from)+' a '+wkLabel(to);
 const title=wkOffset===0?'Esta semana':wkOffset===1?'Próxima semana':wkOffset===-1?'Semana passada':'Semana de '+wkLabel(from);
 const strip=days.map((d,i)=>{const de=ev.filter(e=>e.date===d),types=[...new Set(de.sort((a,b)=>wkOrder[a.type]-wkOrder[b.type]).map(e=>e.type))].slice(0,3);
  return '<button type="button" class="wk-day'+(d===sel?' is-sel':'')+(d===now?' is-today':'')+'" data-day="'+d+'" aria-pressed="'+(d===sel)+'"><span>'+wkDays[i]+'</span><b>'+(+d.slice(8))+'</b><span class="wk-sr">'+wkMonths[+d.slice(5,7)-1]+(d===now?', hoje':'')+', '+(de.length?de.length+' evento'+(de.length>1?'s':''):'sem eventos')+'</span><i aria-hidden="true">'+types.map(t=>'<em class="wk-dot wk-'+t+'"></em>').join('')+'</i></button>'}).join('');
 const list=ev.filter(e=>overview?e.date>=base:e.date===sel).sort((a,b)=>overview?a.date.localeCompare(b.date)||wkOrder[a.type]-wkOrder[b.type]:wkOrder[a.type]-wkOrder[b.type]).map(e=>{
  const inner='<span class="wk-ico wk-'+e.type+'" aria-hidden="true">'+wkIcon[e.type]+'</span><span class="wk-txt"><b>'+enc(e.title)+'</b><small>'+(overview?wkDays[days.indexOf(e.date)]+', '+wkLabel(e.date)+' · ':'')+enc(e.sub)+'</small></span><span class="wk-right">'+(e.amount?'<strong>'+money(e.amount)+'</strong>':'')+'<em class="wk-tag wk-'+e.type+'">'+wkTag[e.type]+'</em></span>';
  return e.act?'<button type="button" class="wk-ev" data-act="'+enc(e.act)+'">'+inner+'</button>':'<a class="wk-ev" href="'+e.href+'">'+inner+'</a>'}).join('');
 const dayName=overview?(wkOffset===0?'Próximos dias desta semana':'Eventos da semana'):(sel===now?'Hoje, ':'')+wkDaysLong[days.indexOf(sel)]+', '+wkLabel(sel);
 const arrow=d=>'<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="'+d+'"/></svg>';
 return '<section class="wk" id="home-week" aria-labelledby="wk-t"><div class="wk-head"><div><h2 id="wk-t">'+title+'</h2><small>'+range+' · '+ev.length+' evento'+(ev.length===1?'':'s')+'</small></div><div class="wk-nav">'+(wkOffset?'<button type="button" class="wk-today" data-week="0">Hoje</button>':'')+'<button type="button" data-week="-1" aria-label="Semana anterior">'+arrow('m15 6-6 6 6 6')+'</button><button type="button" data-week="1" aria-label="Próxima semana">'+arrow('m9 6 6 6-6 6')+'</button></div></div><div class="wk-strip" role="group" aria-label="Dias da semana">'+strip+'</div><div class="wk-list" aria-live="polite"><p class="wk-dayname">'+dayName+'</p>'+(list||'<p class="wk-empty">Nada marcado para este dia.</p>')+'</div><div class="wk-legend" aria-hidden="true"><span><em class="wk-dot wk-due"></em>Aluguel</span><span><em class="wk-dot wk-late"></em>Em atraso</span><span><em class="wk-dot wk-paid"></em>Recebido</span><span><em class="wk-dot wk-job"></em>Manutenção</span><span><em class="wk-dot wk-start"></em>Contrato</span></div></section>';
}
document.addEventListener('click',e=>{
 const b=e.target.closest('#home-week [data-week],#home-week [data-day]');if(!b)return;
 if(b.dataset.week!==undefined){const n=+b.dataset.week;wkOffset=n?wkOffset+n:0;wkDay=null}else wkDay=b.dataset.day;
 const focus=b.dataset.day?'[data-day="'+b.dataset.day+'"]':'[data-week="'+(b.dataset.week==='0'?'1':b.dataset.week)+'"]';
 $('#home-week').outerHTML=weekCard();$('#home-week '+focus)?.focus();
});
function homePage(cs,fin){
 const sumAmt=list=>list.reduce((n,c)=>n+c.amount,0);
 const expected=sumAmt(cs), received=fin.income, pending=Math.max(0,expected-received), paid=cs.filter(c=>c.paid).length;
 const overdue=cs.filter(c=>c.status==='Em atraso'), upcoming=cs.filter(c=>c.status==='A vencer');
 const now=today(), limit=shift(now.slice(0,7),0)+'-31';
 const nextJobs=db.jobs.filter(j=>!j.done&&j.date>=now&&j.date<=limit).slice(0,3);
 const pct=expected?Math.min(100,Math.round(received/expected*100)):0;
 // Indicadores calculados com dados que o app já guarda.
 const active=db.leases.filter(l=>l.start<=now&&l.end>=now), busy=new Set(active.map(l=>l.property));
 const total=db.properties.length, occupied=db.properties.filter(p=>busy.has(p.id)).length, occPct=total?Math.round(occupied/total*100):0;
 const overdueAmt=sumAmt(overdue), delinq=expected?Math.round(overdueAmt/expected*100):0;
 const balance=fin.income-fin.cost, avgRent=active.length?Math.round(sumAmt(active)/active.length):0;
 const daysTo=d=>Math.round((new Date(d+'T12:00:00Z')-new Date(now+'T12:00:00Z'))/86400000);
 const leaseName=l=>(db.properties.find(p=>p.id===l.property)?.name||'Imóvel')+' · '+(db.people.find(p=>p.id===l.person)?.name||'Locatário');
 const ending=db.leases.filter(l=>l.end>=now&&daysTo(l.end)<=90).sort((a,b)=>a.end.localeCompare(b.end));
 const nextEnd=db.leases.filter(l=>l.end>=now).sort((a,b)=>a.end.localeCompare(b.end))[0];
 const endingSoon=ending.filter(l=>daysTo(l.end)<=60);
 const attention=[
  ...overdue.slice(0,3).map(c=>'<button class="home-attention-row" data-act="pay|'+enc(c.key)+'"><span class="home-attention-icon home-attention-danger">!</span><span><b>'+enc(c.person.name)+'</b><small>'+enc(c.property.name)+' · '+Math.max(1,Math.ceil((Date.now()-new Date(c.due+'T12:00:00'))/86400000))+' dias de atraso</small></span><strong>'+money(c.amount)+'</strong></button>'),
  ...endingSoon.map(l=>'<a class="home-attention-row" href="#Contratos"><span class="home-attention-icon home-attention-warn" aria-hidden="true">'+wkIcon.end+'</span><span><b>Contrato termina em '+daysTo(l.end)+' dias</b><small>'+enc(leaseName(l))+'</small></span><em>Renovar</em></a>'),
  ...nextJobs.map(j=>'<a class="home-attention-row" href="#Manutenções"><span class="home-attention-icon home-attention-job" aria-hidden="true">'+wkIcon.job+'</span><span><b>'+enc(j.name)+'</b><small>'+enc(pname(j.property))+' · '+date(j.date)+'</small></span><em>Agendada</em></a>')
 ].slice(0,4).join('');
 // Últimos 6 meses: recebido x despesas
 const series=Array.from({length:6},(_,i)=>shift(month,i-5)).map(m=>({m,...cash(db,m)}));
 const top=Math.max(1,...series.flatMap(s=>[s.income,s.cost]));
 const mName=m=>wkMonths[+m.slice(5)-1];
 const chart='<div class="home-chart" role="img" aria-label="Recebido e despesas nos últimos 6 meses: '+series.map(s=>mName(s.m)+' recebido '+money(s.income)+', despesas '+money(s.cost)).join('; ')+'">'+series.map(s=>'<div class="home-chart-col'+(s.m===month?' is-current':'')+'"><div class="home-chart-bars"><i class="in" style="height:'+Math.round(s.income/top*100)+'%"></i><i class="out" style="height:'+Math.round(s.cost/top*100)+'%"></i></div><span>'+mName(s.m)+'</span></div>').join('')+'</div>';
 const kpi=(label,value,note,extra='',tone='')=>'<div class="home-kpi'+(tone?' home-kpi--'+tone:'')+'"><span>'+label+'</span><strong>'+value+'</strong>'+extra+'<small>'+note+'</small></div>';
 const hour=new Date().getHours();
 return '<div class="home">'
 +'<div class="home-head"><a class="home-logo" href="#Painel"><img src="/logotipo-cor.svg" alt="AlugaFácil"></a><div class="home-greeting"><h1>'+(['Bom dia','Boa tarde','Boa noite'][hour<12?0:hour<18?1:2])+'</h1><p>Veja o que pede sua atenção hoje.</p></div>'+monthPick()+'</div>'
 +'<section class="home-received"><span>Recebido em '+monthName(month)+'</span><div><strong>'+money(received)+'</strong><small>de '+money(expected)+'</small></div><div class="home-progress"><i style="width:'+pct+'%"></i></div><div class="home-received-foot"><span>'+paid+' de '+cs.length+' aluguéis pagos</span><span>Faltam '+money(pending)+'</span></div></section>'
 +'<div class="home-summary"><a href="#Cobranças"><span>● Em atraso</span><strong>'+money(overdueAmt)+'</strong><small>'+overdue.length+' cobrança'+(overdue.length===1?'':'s')+'</small></a><a href="#Cobranças"><span>● A vencer</span><strong>'+money(sumAmt(upcoming))+'</strong><small>'+upcoming.length+' cobrança'+(upcoming.length===1?'':'s')+(upcoming[0]?' · dia '+upcoming[0].due.slice(-2):'')+'</small></a></div>'
 +'<section class="home-kpis" aria-label="Indicadores da carteira">'
 +kpi('Ocupação',occPct+'%',occupied+' de '+total+' imóve'+(total===1?'l':'is')+' alugado'+(occupied===1?'':'s'),'<span class="home-kpi-bar"><i style="width:'+occPct+'%"></i></span>')
 +kpi('Inadimplência',delinq+'%',money(overdueAmt)+' do previsto no mês','',delinq>0?'bad':'good')
 +kpi('Saldo do mês',money(balance),'entradas menos saídas','',balance<0?'bad':'')
 +kpi('Aluguel médio',money(avgRent),active.length+' contrato'+(active.length===1?'':'s')+' ativo'+(active.length===1?'':'s'))
 +'</section>'
 +weekCard()
 +'<section class="home-attention"><div class="home-section-head"><h2>Precisa de atenção</h2><a href="#Cobranças">Ver cobranças</a></div><div class="home-attention-list">'+(attention||'<p class="empty">Nenhuma pendência para os próximos dias.</p>')+'</div></section>'
 +'<section class="home-card home-flow" aria-labelledby="home-flow-t"><div class="home-card-head"><h2 id="home-flow-t">Últimos 6 meses</h2><a href="#Financeiro">Financeiro</a></div>'+chart+'<div class="home-legend"><span><i class="in"></i>Recebido</span><span><i class="out"></i>Despesas</span></div></section>'
 +'<section class="home-card home-ending" aria-labelledby="home-ending-t"><div class="home-card-head"><h2 id="home-ending-t">Contratos que terminam</h2><a href="#Contratos">Contratos</a></div><p class="home-card-sub">Próximos 90 dias</p>'
 +(ending.length?ending.slice(0,4).map(l=>'<a class="home-ending-row" href="#Contratos"><span><b>'+enc(leaseName(l))+'</b><small>termina em '+date(l.end)+'</small></span><em class="'+(daysTo(l.end)<=30?'is-urgent':'')+'">'+daysTo(l.end)+' dias</em></a>').join('')
  :'<p class="home-card-empty">Nenhum contrato termina nos próximos 90 dias.'+(nextEnd?' O próximo é '+enc(leaseName(nextEnd))+', em '+date(nextEnd.end)+'.':'')+'</p>')
 +'</section>'
 +'</div>';
}
function render(){
 if(entry==='landing'){renderLandingV2();return}lpAnimate.stop?.();
 document.body.classList.remove('landing');
 try{page=decodeURIComponent(location.hash.slice(1))}catch{page='Painel'}if(!pages.includes(page))page='Painel';
 $('#crumb').textContent=page;$('#nav').innerHTML=pages.map((p,i)=>'<a href="#'+p+'" class="'+(page===p?'active':'')+'">'+icon(i)+p+'</a>').join('');
 $('#switch').textContent=(wallet==='cloud'?onlineName:wallet==='demo'?'Demonstração':'Minha carteira local')+' ▾';
 const cs=charges(db,month),fin=cash(db,month),sum=list=>list.reduce((a,c)=>a+c.amount,0);
 $('#view').classList.toggle('view-wide',page==='Painel');if(page==='Painel'){ $('#view').innerHTML=homePage(cs,fin); renderTabbar(page); return; }
 const meta={'Imóveis':['Novo imóvel','property','Sua carteira de casas, apartamentos e galpões.'],'Locatários':['Novo locatário','person','Contatos dos responsáveis pelos contratos.'],'Contratos':['Novo contrato','lease','Vigência, valor mensal e vencimento de cada locação.'],'Cobranças':['','','Acompanhe os vencimentos e registre os recebimentos.'],'Manutenções':['Agendar manutenção','job','Serviços agendados para os seus imóveis.'],'Financeiro':['Lançar despesa','expense','Entradas e saídas pela data de movimentação.'],'Mais':['','','Acesso rápido à sua gestão.']};
 let h='';
 if(page==='Painel'){
 h='<div class="hero">'+sky+'<div class="eyebrow">'+(wallet==='demo'?'CARTEIRA DE DEMONSTRAÇÃO':wallet==='cloud'?'CARTEIRA ONLINE':'CARTEIRA LOCAL')+'</div><h1>Visão geral</h1><p>Acompanhe o movimento dos seus aluguéis.</p></div>'+monthPick()+'<div class="cards">'+card('Recebido no mês',money(fin.income),6)+card('A receber no mês',money(sum(cs.filter(c=>!c.paid))),4)+card('Em atraso no mês',money(sum(cs.filter(c=>c.status==='Em atraso'))),3,'over')+'</div><div class="grid">'+panel('Fluxo de caixa',chart(),navLink('Financeiro','Detalhes'))+panel('Carteira de imóveis',item('Imóveis cadastrados','',db.properties.length)+item('Contratos vigentes','Na data de hoje',db.leases.filter(l=>l.start<=today()&&l.end>=today()).length),navLink('Imóveis','Ver imóveis'))+'</div>'+panel('Cobranças do mês',chargeRows(cs.slice(0,5)),navLink('Cobranças','Ver todas'));
 }else if(page==='Mais'){
   const activeWallet=wallet==='cloud'?'Carteira online':wallet==='real'?'Carteira local':'Demonstração';
   h='<div class="sectionhead"><h1>Mais</h1><p class="sub">Acesso rápido à sua gestão.</p></div><section class="more-wallet"><img src="/icone-app.svg" alt=""><div><small>Carteira em uso</small><strong>'+activeWallet+'</strong></div>'+btn('wallet','Trocar')+'</section><section class="more-group"><h2>Gestão</h2><div class="more-list">'+['Contratos|'+db.leases.length+' vigentes','Locatários|'+db.people.length+' contatos','Manutenções|'+db.jobs.filter(j=>!j.done).length+' agendadas'].map(x=>{const [p,n]=x.split('|');return '<a href="#'+p+'"><span class="more-icon">'+icon(p==='Contratos'?3:p==='Locatários'?2:5)+'</span><span><b>'+p+'</b><small>'+n+'</small></span><strong>›</strong></a>'}).join('')+'</div></section>'+(wallet==='cloud'?'<section class="more-group"><h2>Conta</h2><div class="more-list"><button class="more-exit" data-act="logout">Sair da conta</button></div></section>':'');
 }else{
 const [label,act,sub]=meta[page];h='<div class="row sectionhead"><div><h1>'+page+'</h1><p class="sub">'+sub+'</p></div>'+(act?btn(act,'＋ '+label,'primary'):'')+'</div>';
 if(page==='Imóveis')h+=panel('Imóveis cadastrados',db.properties.map(p=>item(p.name,p.address,badge(p.type),db.leases.some(l=>l.property===p.id&&l.start<=today()&&l.end>=today())?'Ocupado':'Disponível')).join('')||empty('Cadastre o primeiro imóvel para começar.'));
 if(page==='Locatários')h+=panel('Contatos',db.people.map(p=>item(p.name,p.phone||'Sem telefone')).join('')||empty('Cadastre um locatário para vinculá-lo ao imóvel.'));
 if(page==='Contratos')h+=panel('Locações',db.leases.map(l=>item(pname(l.property),person(l.person)+' · '+date(l.start)+' a '+date(l.end),money(l.amount),'Vencimento no dia '+l.day)).join('')||empty('O contrato vincula um imóvel a um locatário e gera as cobranças mensais.'));
 if(page==='Cobranças')h+=monthPick()+'<label class="filters">Situação <select id="filter">'+['Todas','Em atraso','A vencer','Pago'].map(v=>'<option '+(filter===v?'selected':'')+'>'+v+'</option>').join('')+'</select></label>'+panel('Aluguéis de '+monthName(month),chargeRows(cs.filter(c=>filter==='Todas'||c.status===filter),true));
 if(page==='Manutenções')h+=panel('Agenda',db.jobs.slice().sort((a,b)=>Number(a.done)-Number(b.done)||a.date.localeCompare(b.date)).map(j=>item(j.name,pname(j.property)+' · '+date(j.date),badge(j.done?'Concluída':'Agendada'),j.done?'':btn('finish|'+j.id,'Concluir'))).join('')||empty('Nenhuma manutenção agendada.'));
 if(page==='Financeiro'){let moves=[...db.payments.map(p=>({...p,name:pname(db.leases.find(l=>l.id===p.key.split('/')[0])?.property),type:'Aluguel'})),...db.expenses.map(e=>({...e,amount:-e.amount,type:'Despesa'}))].filter(x=>x.date.startsWith(month)).sort((a,b)=>b.date.localeCompare(a.date));
 h+=monthPick()+'<div class="cards">'+card('Entradas',money(fin.income),4)+card('Saídas',money(fin.cost),6)+card('Saldo do mês',money(fin.income-fin.cost),6)+'</div>'+panel('Movimentações',moves.map(x=>item(x.name,date(x.date)+' · '+x.type,money(x.amount))).join('')||empty('Nenhuma movimentação no mês.'),btn('exportFinance','Exportar CSV'))}
 }
 if(wallet==='cloud')h='<div class="row"><strong>Carteira online · '+enc(onlineName)+'</strong><div class="actions">'+btn('refresh','Atualizar')+btn('logout','Sair da conta')+'</div></div>'+h;
 $('#view').innerHTML=h;renderTabbar(page);
}
const input=(label,name,type='text',attrs='')=>'<label>'+label+'<input required name="'+name+'" type="'+type+'" '+attrs+'></label>';
const select=(label,name,items)=>'<label>'+label+'<select required name="'+name+'"><option value="">Selecione</option>'+items.map(x=>'<option value="'+enc(x.id)+'">'+enc(x.name)+'</option>').join('')+'</select></label>';
const amount=()=>input('Valor (R$)','amount','number','min=".01" max="999999999" step=".01"');
function open(act){action=act;const [type,id]=act.split('|');let title,fields;
 if(type==='demoEntry'){entry='app';wallet='demo';read();render();return}
 if(type==='logout'){if($('dialog').open)$('dialog').close();remember(null);tenants=[];walletChange('demo');toast('Sessão encerrada neste navegador.');return}
 if(type==='refresh'){refreshOnline().catch(err=>toast(err.message));return}
 if(type==='account'){
   if(auth){title='Carteira online';fields='<p>'+enc(auth.user.email)+'</p>'+btn('chooseTenant','Abrir carteiras')+' '+btn('logout','Sair da conta');}
   else {title='Entrar no Aluguel Fácil';fields=input('E-mail da conta','email','email','autocomplete="username"')+input('Senha','password','password','autocomplete="current-password"');}
 }
 if(type==='chooseTenant'){showTenants().catch(err=>toast(err.message));return}
 if(type==='wallet'){title='Escolher carteira';fields=select('Carteira','wallet',[{id:'cloud',name:'Carteira online (Supabase)'},{id:'real',name:'Minha carteira local'},{id:'demo',name:'Demonstração'}])+'<small>Use a carteira online para acessar seus dados em outros dispositivos.</small>'}
 if(type==='property'){title='Novo imóvel';fields=input('Nome do imóvel','name')+select('Tipo','type',['Apartamento','Casa','Galpão','Sala comercial','Outro'].map(name=>({name,id:name})))+input('Endereço','address')}
 if(type==='person'){title='Novo locatário';fields=input('Nome completo','name')+'<label>WhatsApp com DDD (opcional)<input type="tel" name="phone" pattern="[+0-9() .-]{10,22}"></label>'}
 if(type==='lease'){if(!db.people.length||!db.properties.length)return toast('Cadastre pelo menos um imóvel e um locatário.');title='Novo contrato';fields=(wallet==='cloud'?select('Imóvel e unidade','unit',db.units.filter(u=>u.status==='available').map(u=>({id:u.id,name:pname(u.property_id)+' · '+u.name}))):select('Imóvel','property',db.properties))+select('Locatário','person',db.people)+input('Início','start','date')+input('Término','end','date')+amount()+input('Dia do vencimento','day','number','min="1" max="31"')+'<small>A primeira cobrança vence no primeiro dia de vencimento dentro da vigência.</small>'}
 if(type==='expense'){title='Lançar despesa';fields=input('Descrição','name')+amount()+input('Data do pagamento','date','date','value="'+today()+'" max="'+today()+'"')}
 if(type==='job'){if(!db.properties.length)return toast('Cadastre um imóvel para agendar o serviço.');title='Agendar manutenção';fields=select('Imóvel','property',db.properties)+input('Serviço','name')+input('Data agendada','date','date')}
 if(type==='finish'){title='Concluir manutenção';fields='<p>'+enc(db.jobs.find(j=>j.id===id).name)+'</p><label>Custo pago (R$)<input required name="amount" type="number" step=".01" min="0" max="999999999" value="0"></label>'+input('Data de conclusão','date','date','max="'+today()+'" value="'+today()+'"')}
 if(type==='pay'){const c=charges(db,month).find(x=>x.key===id);if(!c||c.paid)return;title='Registrar pagamento';fields='<p>'+enc(c.person.name)+' · '+enc(c.property.name)+'<br><strong>'+money(c.amount)+'</strong></p>'+input('Data do recebimento','date','date','value="'+today()+'" max="'+today()+'"')}
 $('#formTitle').textContent=title;$('#fields').innerHTML=fields;$('#error').textContent='';$('#form .primary').hidden=type==='account'&&!!auth;$('#form .primary').textContent=type==='account'?'Entrar':'Salvar';if(!$('dialog').open)$('dialog').showModal();
}
async function showTenants(){
 tenants=await onlineTenants();
 if(!tenants.length)throw Error('Esta conta ainda não é membro ativo de uma carteira.');
 if(tenants.length===1){await activate(tenants[0]);return}
 action='tenant';$('#fields').innerHTML=select('Carteira','tenant',tenants.map(m=>({id:m.tenant_id,name:m.tenants?.name||m.tenant_id})));$('#formTitle').textContent='Selecionar carteira';$('#form .primary').hidden=false;$('#form .primary').textContent='Abrir';if(!$('dialog').open)$('dialog').showModal();
}
async function activate(member){
 const data=await loadOnline(member.tenant_id);
 tenantId=member.tenant_id;onlineName=member.tenants?.name||'Aluguel Fácil';wallet='cloud';db=data;
 sessionStorage.setItem('af.activeTenant',tenantId);$('#wallet').value='cloud';$('dialog').close();render();
}
async function refreshOnline(){const id=tenantId;const data=await loadOnline(id);if(wallet==='cloud'&&tenantId===id){db=data;render()}}
$('#form').onsubmit=async e=>{e.preventDefault();if(busy)return;busy=true;$('#form .primary').disabled=true;const f=Object.fromEntries(new FormData(e.target)),[type,id]=action.split('|');try{
 if(type==='account'){if(!auth)await login(f.email.trim(),f.password);$('#fields').querySelector('[name=password]')?.remove();await showTenants();return}
 if(type==='tenant'){await activate(tenants.find(m=>m.tenant_id===f.tenant));return}
 for(const k in f)f[k]=f[k].trim();if('name' in f&&!f.name||'address' in f&&!f.address)throw Error('Preencha os campos obrigatórios.');
 if(type==='wallet'){$('dialog').close();walletChange(f.wallet);return}
 if(f.amount!==undefined)f.amount=Math.round(Number(f.amount)*100);
 if(wallet==='cloud'){
   await writeOnline(tenantId,type,id,f,db,month);
   $('dialog').close();
   try{await refreshOnline();toast('Salvo no Supabase.')}catch{toast('Salvo no Supabase. Clique em Atualizar para recarregar.')}
   return;
 }
 if(type==='lease'){if(f.end<f.start)throw Error('O término deve ser igual ou posterior ao início.');if(db.leases.some(l=>l.property===f.property&&l.start<=f.end&&l.end>=f.start))throw Error('Este imóvel já tem contrato nesse período.');f.day=Number(f.day)}
 const table={property:'properties',person:'people',lease:'leases',job:'jobs',expense:'expenses'}[type];
 if(table)db[table].push({...f,id:crypto.randomUUID(),...(type==='job'?{done:false}:{})});
 if(type==='pay'){const c=charges(db,month).find(x=>x.key===id);if(!c||c.paid)throw Error('Cobrança já liquidada ou indisponível.');db.payments.push({key:id,date:f.date,amount:c.amount})}
 if(type==='finish'){const j=db.jobs.find(x=>x.id===id);if(!j||j.done)throw Error('Serviço já concluído.');j.done=true;j.completed=f.date;if(f.amount)db.expenses.push({...f,id:crypto.randomUUID(),name:j.name+' · '+pname(j.property)})}
 save();$('dialog').close();render();toast('Salvo na carteira.')
 }catch(err){read();render();$('#error').textContent=err.message}finally{busy=false;$('#form .primary').disabled=false}};
function exportFinance(){const moves=[...db.payments.map(p=>({...p,name:pname(db.leases.find(l=>l.id===p.key.split('/')[0])?.property),type:'Aluguel'})),...db.expenses.map(e=>({...e,amount:-e.amount,type:'Despesa'}))].filter(x=>x.date.startsWith(month)).sort((a,b)=>a.date.localeCompare(b.date));const csv=['Data,Descrição,Tipo,Valor (centavos)',...moves.map(x=>[x.date,'"'+String(x.name||'').replaceAll('"','""')+'"',x.type,x.amount].join(','))].join('\n');const link=document.createElement('a');link.href=URL.createObjectURL(new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'}));link.download='alugafacil-financeiro-'+month+'.csv';link.click();URL.revokeObjectURL(link.href);toast('Arquivo CSV preparado.')}
document.addEventListener('click',e=>{const b=e.target.closest('[data-act]');if(b?.dataset.act==='exportFinance')exportFinance();else if(b)open(b.dataset.act)});
document.addEventListener('change',e=>{if(e.target.id==='month'&&/^\d{4}-\d{2}$/.test(e.target.value)){month=e.target.value;render()}if(e.target.id==='filter'){filter=e.target.value;render()}});
$('#wallet').onchange=e=>walletChange(e.target.value);$('#switch').onclick=()=>open('wallet');$('#close').onclick=()=>$('dialog').close();addEventListener('hashchange',render);addEventListener('storage',e=>{if(wallet!=='cloud'&&e.key===key()&&!$('dialog').open){read();render()}});read();render();

