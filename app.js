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
const paths=['M3 11l9-8 9 8v10H4V11 M9 21v-7h6v7','M4 21V4h12v17 M16 10h4v11 M7 8h2 M11 8h2 M7 12h2 M11 12h2 M2 21h20','M16 21v-2a5 5 0 0 0-10 0v2 M11 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M18 6a3 3 0 0 1 0 6 M19 15q3 1 3 5','M5 3h10l4 4v14H5z M14 3v5h5 M8 12h8 M8 16h6','M3 6h18v13H3z M3 10h18 M7 15h3','M14 5a5 5 0 0 0-6 6l-5 6a2 2 0 0 0 3 3l6-6a5 5 0 0 0 6-7l-3 3-3-3z','M4 3v17h17 M8 16v-4 M13 16V8 M18 16V5'];
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
function renderLanding(){
 document.body.classList.add('landing');
 $('#view').innerHTML='<div class="landing-wrap"><div class="landing-copy"><div class="landing-brand"><b>⌂</b><span>Aluga</span>Fácil</div><p class="eyebrow">GESTÃO DE ALUGUÉIS SEM COMPLICAÇÃO</p><h1>Mais controle para seus imóveis. Mais tranquilidade para você.</h1><p class="landing-lead">Organize imóveis, locatários, contratos, cobranças e manutenções em um só lugar.</p><div class="landing-actions">'+btn('account','Entrar na minha carteira','primary')+btn('demoEntry','Conhecer a demonstração')+'</div><div class="landing-proof"><span>✓ Carteira online</span><span>✓ Acesso pelo celular</span><span>✓ Visão financeira</span></div></div><div class="login-card"><div class="eyebrow">ALUGAFÁCIL</div><h2>Comece pela sua carteira</h2><p>Entre para acompanhar seus imóveis e receber uma visão clara do que precisa da sua atenção.</p><div class="login-points"><div><strong>01</strong><span>Cadastre seus imóveis e locatários</span></div><div><strong>02</strong><span>Controle contratos e vencimentos</span></div><div><strong>03</strong><span>Acompanhe pagamentos e despesas</span></div></div><button class="landing-login" data-act="account">Acessar carteira online <span>→</span></button></div></div><div class="landing-features"><div><b>Imóveis organizados</b><span>Tenha uma visão rápida de casas, apartamentos e galpões.</span></div><div><b>Cobranças sob controle</b><span>Saiba quem pagou, quem está atrasado e o que vence em seguida.</span></div><div><b>Decisões mais simples</b><span>Use o fluxo financeiro para cuidar melhor da sua carteira.</span></div></div>';
}
function renderLandingV2(){
 document.body.classList.add('landing');
 $('#view').innerHTML=`<div class="landing-shell">
  <nav class="landing-nav"><div class="landing-brand"><b>⌂</b><span>Aluga</span>Fácil</div><div class="landing-navlinks"><a href="#recursos">Recursos</a><a href="#como-funciona">Como funciona</a><a href="#planos">Planos</a></div><button class="nav-login" data-act="account">Entrar</button></nav>
  <section class="landing-hero" id="recursos"><div class="hero-copy"><p class="eyebrow">GESTÃO DE ALUGUÉIS PARA QUEM QUER TER CONTROLE</p><h1>O aluguel da sua carteira, em uma visão só.</h1><p class="landing-lead">Imóveis, contratos, cobranças e manutenções organizados para você cuidar do que importa — sem planilhas espalhadas.</p><div class="landing-actions">${btn('account','Começar agora','primary')}${btn('demoEntry','Explorar demonstração')}</div><div class="landing-proof"><span>✓ 7 dias para testar</span><span>✓ Sem cartão</span><span>✓ Feito para celular</span></div></div><div class="product-shot shot-hero"><div class="shot-top"><b>AlugaFácil</b><span>Minha gestão</span><i>•••</i></div><div class="shot-welcome"><small>VISÃO DA CARTEIRA</small><strong>Bom dia, Paulo</strong><span>Veja o que pede sua atenção hoje.</span></div><div class="shot-metrics"><div><small>Recebido no mês</small><b>R$ 8.420</b><em>+12,4%</em></div><div><small>Em atraso</small><b>R$ 1.280</b><em class="warn">3 contratos</em></div></div><div class="shot-bars"><i style="height:45%"></i><i style="height:68%"></i><i style="height:52%"></i><i style="height:82%"></i><i style="height:72%"></i><i style="height:94%"></i></div></div></section>
  <section class="logo-strip"><span>UMA ROTINA MAIS SIMPLES PARA</span><b>Locadores</b><b>Administradoras</b><b>Imobiliárias</b><b>Carteiras familiares</b></section>
  <section class="feature-section" id="como-funciona"><div class="section-intro"><p class="eyebrow">DO CADASTRO AO RECEBIMENTO</p><h2>Menos tarefas repetidas. Mais clareza para decidir.</h2><p>O AlugaFácil transforma a rotina de gestão em um fluxo simples, visual e fácil de acompanhar.</p></div><div class="feature-grid"><article><span class="feature-num">01</span><h3>Organize seus imóveis</h3><p>Tenha cada unidade, locatário e contrato no lugar certo.</p><div class="product-shot mini-shot"><div class="shot-list-title">Meus imóveis <b>+ Adicionar</b></div><div class="shot-list-row"><i class="house-icon">⌂</i><span><b>Casa Jardim</b><small>3 quartos · Alugada</small></span><strong>R$ 1.850</strong></div><div class="shot-list-row"><i class="house-icon">⌂</i><span><b>Apto Centro</b><small>2 quartos · Disponível</small></span><strong>R$ 1.420</strong></div></div></article><article><span class="feature-num">02</span><h3>Acompanhe o dinheiro</h3><p>Veja recebimentos, despesas e atrasos antes que virem problema.</p><div class="product-shot mini-shot"><div class="shot-list-title">Cobranças de novembro <b class="green">R$ 6.980</b></div><div class="shot-list-row"><span><b>Marina Costa</b><small>Casa Jardim · vence 10/11</small></span><em class="status-paid">Pago</em></div><div class="shot-list-row"><span><b>Rafael Lima</b><small>Apto Centro · vence 12/11</small></span><em class="status-late">Em atraso</em></div></div></article><article><span class="feature-num">03</span><h3>Resolva o que importa</h3><p>Centralize manutenções e transforme pendências em próximas ações.</p><div class="product-shot mini-shot"><div class="shot-list-title">Manutenções <b>Ver agenda</b></div><div class="shot-list-row"><i class="task-dot"></i><span><b>Trocar torneira</b><small>Casa Jardim · amanhã</small></span><em class="status-open">Em aberto</em></div><div class="shot-list-row"><i class="task-dot"></i><span><b>Revisar elétrica</b><small>Apto Centro · sexta</small></span><em class="status-done">Agendado</em></div></div></article></div></section>
  <section class="story-section"><div><p class="eyebrow">FEITO PARA A VIDA REAL</p><h2>Você não precisa ser especialista em tecnologia para gerir melhor.</h2><p>O sistema acompanha a sua forma de trabalhar: começa simples, cresce junto com a carteira e deixa tudo visível quando você precisa.</p><button data-act="demoEntry" class="text-cta">Ver a demonstração completa →</button></div><div class="story-card"><div class="story-check">✓</div><div><b>Hoje, você sabe o que está acontecendo.</b><span>Próximo vencimento em 2 dias</span></div><div class="story-check">✓</div><div><b>Hoje, você sabe onde agir.</b><span>1 manutenção aguardando orçamento</span></div><div class="story-check">✓</div><div><b>Hoje, você tem histórico.</b><span>Fluxo financeiro por imóvel e mês</span></div></div></section>
  <section class="final-cta"><p class="eyebrow">SUA CARTEIRA MERECE MAIS CLAREZA</p><h2>Comece a organizar seus aluguéis hoje.</h2><p>Teste a demonstração ou entre na sua carteira online.</p><div class="landing-actions">${btn('account','Entrar na minha carteira','primary')}${btn('demoEntry','Conhecer o AlugaFácil')}</div></section>
  <footer class="landing-footer"><div class="landing-brand"><b>⌂</b><span>Aluga</span>Fácil</div><span>Gestão de aluguéis sem complicação.</span><button data-act="account">Acessar carteira</button></footer></div>`;
}
function render(){
 if(entry==='landing'){renderLandingV2();return}
 document.body.classList.remove('landing');
 try{page=decodeURIComponent(location.hash.slice(1))}catch{page='Painel'}if(!pages.includes(page))page='Painel';
 $('#crumb').textContent=page;$('#nav').innerHTML=pages.map((p,i)=>'<a href="#'+p+'" class="'+(page===p?'active':'')+'">'+icon(i)+p+'</a>').join('');
 $('#switch').textContent=(wallet==='cloud'?onlineName:wallet==='demo'?'Demonstração':'Minha carteira local')+' ▾';
 const cs=charges(db,month),fin=cash(db,month),sum=list=>list.reduce((a,c)=>a+c.amount,0);
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

