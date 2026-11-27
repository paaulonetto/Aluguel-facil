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
// Tradução entre os rótulos das telas e os códigos do banco (migração 20261127_cadastros_completos).
const dbIndex={'IGP-M':'igpm','IPCA':'ipca','IVAR':'ivar','Sem reajuste':'none'};
const dbGuarantee={'Sem garantia':'none','Caução':'deposit','Fiador':'guarantor','Seguro fiança':'surety_insurance','Título de capitalização':'capitalization_bond'};
const dbMarital={'Solteiro(a)':'single','Casado(a)':'married','União estável':'stable_union','Divorciado(a)':'divorced','Viúvo(a)':'widowed'};
const dbPref={'WhatsApp':'whatsapp','Ligação':'phone_call','E-mail':'email'};
const dbBack=m=>Object.fromEntries(Object.entries(m).map(([a,b])=>[b,a]));
const [uiIndex,uiGuarantee,uiMarital,uiPref]=[dbIndex,dbGuarantee,dbMarital,dbPref].map(dbBack);
const dbNull=v=>v===''||v==null?null:v,dbReais=c=>c?c/100:null,dbCents=v=>v==null?0:Math.round(Number(v)*100),dbDigits=v=>String(v||'').replace(/\D/g,'');
const uiCep=v=>v&&v.length===8?v.slice(0,5)+'-'+v.slice(5):'';
const uiAddress=a=>{const line=[a.street,a.number].filter(Boolean).join(', ')+(a.complement?' · '+a.complement:'');return [line,a.neighborhood].filter(Boolean).join(' – ')+(a.city?', '+a.city+(a.state?'/'+a.state:''):'')};
function dbBlob(url){const [head,data]=url.split(',');const bin=atob(data),buf=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)buf[i]=bin.charCodeAt(i);return new Blob([buf],{type:head.slice(5,head.indexOf(';'))})}
async function loadOnline(t){
 const filter='tenant_id=eq.'+encodeURIComponent(t)+'&select=';
 const rows=(table,cols,order)=>listRows(table,filter+cols,order);
 const [props,units,people,contracts,payments,jobs,expenses,photos]=await Promise.all([
 rows('properties','id,name,property_type,cep,street,number,complement,neighborhood,city,state,purpose,bedrooms,bathrooms,parking,furnished,pets_allowed,registry,reference,condo_fee,iptu_yearly,fees_payer'),
 rows('property_units','id,name,property_id,status,area_m2,suggested_rent','created_at'),
 rows('renters','id,person_type,name,document,email,phone,secondary_contact_name,secondary_contact_phone,cep,street,number,complement,neighborhood,city,state,notes,birth_date,marital_status,rg,occupation,legal_rep,monthly_income,contact_pref,guarantee_type,guarantee_amount,guarantor_name,guarantor_document,guarantor_phone,guarantee_ref'),
 rows('rental_contracts','id,unit_id,renter_id,start_date,end_date,monthly_rent,due_day,status,adjustment_index,penalty_percent,late_interest_percent,guarantee_type,deposit_amount,notes'),
 rows('af_payments','contract_id,period,received,cents','contract_id,period'),rows('af_jobs','id,property_id,name,scheduled,completed'),rows('af_expenses','id,name,paid,cents'),
 rows('property_photos','property_id,storage_path','created_at')]);
 const unitMap=new Map(units.map(u=>[u.id,u])),mainUnit=new Map();for(const u of units)if(!mainUnit.has(u.property_id))mainUnit.set(u.property_id,u);
 const photoPath=new Map(photos.map(p=>[p.property_id,p.storage_path])),signed=new Map();
 if(photoPath.size)try{
  const list=await api('/storage/v1/object/sign/property-photos',{method:'POST',body:JSON.stringify({expiresIn:3600,paths:[...photoPath.values()]})},await token());
  for(const x of list||[])if(x.signedURL)signed.set(x.path,endpoint+'/storage/v1'+x.signedURL);
 }catch{}
 return {units,properties:props.map(p=>{const u=mainUnit.get(p.id)||{},n=p.number||'';return {id:p.id,name:p.name,type:types[p.property_type]||'Outro',
  purpose:p.purpose==='commercial'?'Comercial':'Residencial',area:u.area_m2==null?null:Number(u.area_m2),bedrooms:p.bedrooms,bathrooms:p.bathrooms,parking:p.parking,furnished:!!p.furnished,pets:!!p.pets_allowed,registry:p.registry||'',
  photo:signed.get(photoPath.get(p.id))||'',cep:uiCep(p.cep),street:p.street||'',number:n,noNumber:n==='S/N',complement:p.complement||'',district:p.neighborhood||'',city:p.city||'',uf:p.state||'',reference:p.reference||'',
  address:uiAddress(p),rent:dbCents(u.suggested_rent),condo:dbCents(p.condo_fee),iptu:dbCents(p.iptu_yearly),payer:p.fees_payer==='owner'?'Locador':'Locatário'}}),
 people:people.map(p=>{const pj=p.person_type==='pj',n=p.number||'';return {id:p.id,kind:pj?'PJ':'PF',name:p.name,doc:p.document||'',birth:p.birth_date||'',marital:uiMarital[p.marital_status]||'',rg:p.rg||'',job:p.occupation||'',rep:p.legal_rep||'',income:dbCents(p.monthly_income),
  phone:p.phone||'',email:p.email||'',pref:uiPref[p.contact_pref]||'WhatsApp',emName:p.secondary_contact_name||'',emPhone:p.secondary_contact_phone||'',
  cep:uiCep(p.cep),street:p.street||'',number:n,noNumber:n==='S/N',complement:p.complement||'',district:p.neighborhood||'',city:p.city||'',uf:p.state||'',address:p.street?uiAddress(p):'',
  guarantee:uiGuarantee[p.guarantee_type]||'Sem garantia',gValue:dbCents(p.guarantee_amount),gName:p.guarantor_name||'',gDoc:p.guarantor_document||'',gPhone:p.guarantor_phone||'',gRef:p.guarantee_ref||'',notes:p.notes||''}}),
 leases:contracts.filter(c=>['active','ended'].includes(c.status)).map(c=>({id:c.id,unit:c.unit_id,property:unitMap.get(c.unit_id)?.property_id,person:c.renter_id,start:c.start_date,end:c.end_date,day:c.due_day,amount:Math.round(c.monthly_rent*100),
  months:lfMonths(c.start_date,c.end_date),index:uiIndex[c.adjustment_index]||'',fine:c.penalty_percent==null?null:Number(c.penalty_percent),interest:c.late_interest_percent==null?null:Number(c.late_interest_percent),
  guarantee:uiGuarantee[c.guarantee_type]||'Sem garantia',gValue:dbCents(c.deposit_amount),notes:c.notes||''})),
 payments:payments.map(p=>({key:p.contract_id+'/'+p.period.slice(0,7),amount:Number(p.cents),date:p.received})),
 jobs:jobs.map(j=>({id:j.id,property:j.property_id,name:j.name,date:j.scheduled,done:!!j.completed})),
 expenses:expenses.map(e=>({id:e.id,name:e.name,date:e.paid,amount:Number(e.cents)}))};
}
async function writeOnline(t,type,id,f,db,month){
 const post=async(path,body)=>api('/rest/v1/'+path,{method:'POST',body:JSON.stringify(body)},await token());
 const friendly=e=>{const m=e.message||'';
  if(/no_overlap|exclusion constraint/.test(m))return Error('Este imóvel já tem contrato nesse período.');
  if(/renters_document_uidx/.test(m))return Error('Já existe um locatário com este CPF/CNPJ nesta carteira.');
  if(/check constraint/.test(m))return Error('Algum campo está em formato inválido. Confira e tente de novo.');
  return e};
 try{switch(type){
 case 'property':{
  const pid=crypto.randomUUID();
  await post('rpc/af_add_property_v2',{t,p:{id:pid,name:f.name,type:Object.keys(types).find(k=>types[k]===f.type)||'other',
   cep:dbNull(dbDigits(f.cep)),street:dbNull(f.street),number:dbNull(f.number),complement:dbNull(f.complement),neighborhood:dbNull(f.district),city:dbNull(f.city),state:dbNull((f.uf||'').toUpperCase()),
   purpose:f.purpose==='Comercial'?'commercial':'residential',bedrooms:f.bedrooms,bathrooms:f.bathrooms,parking:f.parking,furnished:!!f.furnished,pets_allowed:!!f.pets,
   registry:dbNull(f.registry),reference:dbNull(f.reference),condo_fee:dbReais(f.condo),iptu_yearly:dbReais(f.iptu),fees_payer:f.payer==='Locador'?'owner':'renter',area_m2:f.area||null,suggested_rent:dbReais(f.rent)}});
  if(!f.photo)return {};
  try{
   const blob=dbBlob(f.photo),path=t+'/'+pid+(blob.type==='image/jpeg'?'.jpg':'.webp');
   const res=await fetch(endpoint+'/storage/v1/object/property-photos/'+path,{method:'POST',headers:{apikey:publicKey,Authorization:'Bearer '+await token(),'Content-Type':blob.type,'x-upsert':'true'},body:blob});
   if(!res.ok)throw Error();
   await post('property_photos',{tenant_id:t,property_id:pid,storage_path:path});return {};
  }catch{return {warn:'Imóvel salvo, mas a foto não foi enviada. Tente uma foto menor.'}}
 }
 case 'person':{let phone=dbDigits(f.phone);if(phone.length>11&&phone.startsWith('55'))phone=phone.slice(2);
  return await post('renters',{tenant_id:t,person_type:f.kind==='PJ'?'pj':'pf',name:f.name,document:dbNull(f.doc),email:dbNull(f.email),phone:dbNull(phone),
   secondary_contact_name:dbNull(f.emName),secondary_contact_phone:dbNull(f.emPhone),cep:dbNull(dbDigits(f.cep)),street:dbNull(f.street),number:dbNull(f.number),complement:dbNull(f.complement),
   neighborhood:dbNull(f.district),city:dbNull(f.city),state:dbNull((f.uf||'').toUpperCase()),notes:dbNull(f.notes),birth_date:dbNull(f.birth),marital_status:dbMarital[f.marital]||null,
   rg:dbNull(f.rg),occupation:dbNull(f.job),legal_rep:dbNull(f.rep),monthly_income:dbReais(f.income),contact_pref:dbPref[f.pref]||'whatsapp',
   guarantee_type:dbGuarantee[f.guarantee]||'none',guarantee_amount:dbReais(f.gValue),guarantor_name:dbNull(f.gName),guarantor_document:dbNull(f.gDoc),guarantor_phone:dbNull(f.gPhone),guarantee_ref:dbNull(f.gRef)})}
 case 'lease':return await post('rental_contracts',{tenant_id:t,unit_id:f.unit,renter_id:f.person,start_date:f.start,end_date:f.end,monthly_rent:f.amount/100,due_day:+f.day,status:'active',
   ...(dbIndex[f.index]?{adjustment_index:dbIndex[f.index]}:{}),penalty_percent:f.fine,late_interest_percent:f.interest,guarantee_type:dbGuarantee[f.guarantee]||'none',deposit_amount:dbReais(f.gValue),notes:dbNull(f.notes)});
 case 'pay':{const c=charges(db,month).find(c=>c.key===id&&!c.paid);if(!c)throw Error('Cobrança indisponível.');return await post('af_payments',{tenant_id:t,contract_id:c.id,period:month+'-01',received:f.date,cents:c.amount})}
 case 'job':return await post('af_jobs',{tenant_id:t,property_id:f.property,name:f.name,scheduled:f.date});
 case 'finish':return await post('rpc/af_finish_job',{t,j:id,dt:f.date,cost:f.amount});
 case 'expense':return await post('af_expenses',{tenant_id:t,name:f.name,paid:f.date,cents:f.amount});
 default:throw Error('Operação desconhecida.');
 }}catch(e){throw friendly(e)}
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
 $('#view').classList.toggle('view-wide',['Painel','Imóveis','Locatários','Contratos','Cobranças','Manutenções','Financeiro'].includes(page));if(page!==ltPage){ltPage=page;ltQ='';ltSt='Todos'}if(page==='Painel'){ $('#view').innerHTML=homePage(cs,fin); renderTabbar(page); return; }
 const meta={'Imóveis':['Novo imóvel','property','Sua carteira de casas, apartamentos e galpões.'],'Locatários':['Novo locatário','person','Contatos dos responsáveis pelos contratos.'],'Contratos':['Novo contrato','lease','Vigência, valor mensal e vencimento de cada locação.'],'Cobranças':['','','Acompanhe os vencimentos e registre os recebimentos.'],'Manutenções':['Agendar manutenção','job','Serviços agendados para os seus imóveis.'],'Financeiro':['Lançar despesa','expense','Entradas e saídas pela data de movimentação.'],'Mais':['','','Acesso rápido à sua gestão.']};
 let h='';
 if(page==='Painel'){
 h='<div class="hero">'+sky+'<div class="eyebrow">'+(wallet==='demo'?'CARTEIRA DE DEMONSTRAÇÃO':wallet==='cloud'?'CARTEIRA ONLINE':'CARTEIRA LOCAL')+'</div><h1>Visão geral</h1><p>Acompanhe o movimento dos seus aluguéis.</p></div>'+monthPick()+'<div class="cards">'+card('Recebido no mês',money(fin.income),6)+card('A receber no mês',money(sum(cs.filter(c=>!c.paid))),4)+card('Em atraso no mês',money(sum(cs.filter(c=>c.status==='Em atraso'))),3,'over')+'</div><div class="grid">'+panel('Fluxo de caixa',chart(),navLink('Financeiro','Detalhes'))+panel('Carteira de imóveis',item('Imóveis cadastrados','',db.properties.length)+item('Contratos vigentes','Na data de hoje',db.leases.filter(l=>l.start<=today()&&l.end>=today()).length),navLink('Imóveis','Ver imóveis'))+'</div>'+panel('Cobranças do mês',chargeRows(cs.slice(0,5)),navLink('Cobranças','Ver todas'));
 }else if(page==='Mais'){
   const activeWallet=wallet==='cloud'?'Carteira online':wallet==='real'?'Carteira local':'Demonstração';
   h='<div class="sectionhead"><h1>Mais</h1><p class="sub">Acesso rápido à sua gestão.</p></div><section class="more-wallet"><img src="/icone-app.svg" alt=""><div><small>Carteira em uso</small><strong>'+activeWallet+'</strong></div>'+btn('wallet','Trocar')+'</section><section class="more-group"><h2>Gestão</h2><div class="more-list">'+['Contratos|'+db.leases.length+' vigentes','Locatários|'+db.people.length+' contatos','Manutenções|'+db.jobs.filter(j=>!j.done).length+' agendadas'].map(x=>{const [p,n]=x.split('|');return '<a href="#'+p+'"><span class="more-icon">'+icon(p==='Contratos'?3:p==='Locatários'?2:5)+'</span><span><b>'+p+'</b><small>'+n+'</small></span><strong>›</strong></a>'}).join('')+'</div></section>'+(wallet==='cloud'?'<section class="more-group"><h2>Conta</h2><div class="more-list"><button class="more-exit" data-act="logout">Sair da conta</button></div></section>':'');
 }else{
 const [label,act,sub]=meta[page];h='<div class="row sectionhead"><div><h1>'+page+'</h1><p class="sub">'+sub+'</p></div>'+(act?btn(act,'＋ '+label,'primary'):'')+'</div>';
 if(page==='Imóveis')h+=propertyList();
 if(page==='Locatários')h+=personList();
 if(page==='Contratos')h+=leaseList();
 if(page==='Cobranças')h+=chargePage(cs);
 if(page==='Manutenções')h+=jobPage();
 if(page==='Financeiro')h+=financePage(fin);
 }
 if(wallet==='cloud')h='<div class="row"><strong>Carteira online · '+enc(onlineName)+'</strong><div class="actions">'+btn('refresh','Atualizar')+btn('logout','Sair da conta')+'</div></div>'+h;
 $('#view').innerHTML=h;ltApply();renderTabbar(page);
}
const input=(label,name,type='text',attrs='')=>'<label>'+label+'<input required name="'+name+'" type="'+type+'" '+attrs+'></label>';
const select=(label,name,items)=>'<label>'+label+'<select required name="'+name+'"><option value="">Selecione</option>'+items.map(x=>'<option value="'+enc(x.id)+'">'+enc(x.name)+'</option>').join('')+'</select></label>';
const amount=()=>input('Valor (R$)','amount','number','min=".01" max="999999999" step=".01"');
// Cadastro de imóvel em 3 etapas: identificação, localização e valores (Claude · design/ux-ui).
const pfTypes=['Apartamento','Casa','Sala comercial','Loja','Galpão','Terreno','Outro'],pfBusiness=['Sala comercial','Loja','Galpão'];
const pfUF='AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' ');
const pfSteps=['Identificação','Localização','Valores'];
let pfStep=0,pfSeen=0,pfMax=2,pfSave='Salvar imóvel';
const pfChips=(name,items,val,req,label)=>'<div class="pf-chips" role="radiogroup" aria-label="'+label+'">'+items.map((v,i)=>'<label class="pf-chip"><input type="radio" name="'+name+'" value="'+enc(v)+'"'+(v===val?' checked':'')+(req&&!i?' required':'')+'><span>'+enc(v)+'</span></label>').join('')+'</div>';
const pfField=(label,name,attrs='',hint='',cls='')=>'<label class="pf-field '+cls+'"><span>'+label+'</span><input name="'+name+'" '+attrs+'>'+(hint?'<small>'+hint+'</small>':'')+'</label>';
const pfMoney=(label,name,req,hint='')=>'<label class="pf-field"><span>'+label+'</span><span class="pf-money"><i aria-hidden="true">R$</i><input name="'+name+'" type="number" inputmode="decimal" step=".01" min="0" max="999999999"'+(req?' required min=".01"':'')+' placeholder="0,00"></span>'+(hint?'<small>'+hint+'</small>':'')+'</label>';
const pfOpt=' <em>(opcional)</em>';
function propertyForm(){
 pfStep=0;pfSeen=0;pfMax=2;pfSave='Salvar imóvel';
 const steps='<ol class="pf-steps">'+pfSteps.map((s,i)=>'<li><button type="button" data-pf-go="'+i+'"'+(i?' disabled':'')+' aria-current="'+(i?'false':'step')+'"><b>'+(i+1)+'</b><span>'+s+'</span></button></li>').join('')+'</ol>';
 const id='<fieldset class="pf-step" data-step="0"><legend>Identificação do imóvel</legend>'
  +pfField('Nome do imóvel','name','required maxlength="80" autocomplete="off" placeholder="Ex.: Apto 204 · Residencial Aurora"','Como você chama este imóvel no dia a dia.')
  +'<div class="pf-field"><span id="pf-type-l">Tipo</span>'+pfChips('type',pfTypes,'',true,'Tipo')+'</div>'
  +'<div class="pf-field"><span>Finalidade</span>'+pfChips('purpose',['Residencial','Comercial'],'Residencial',false,'Finalidade')+'</div>'
  +'<div class="pf-field"><span>Características'+pfOpt+'</span><div class="pf-grid4">'
  +[['Área (m²)','area','step=".01"'],['Quartos','bedrooms',''],['Banheiros','bathrooms',''],['Vagas','parking','']].map(([l,n,a])=>'<label class="pf-mini"><small>'+l+'</small><input name="'+n+'" type="number" inputmode="numeric" min="0" max="99999" '+a+'></label>').join('')
  +'</div><div class="pf-checks"><label><input type="checkbox" name="furnished" value="1"> Mobiliado</label><label><input type="checkbox" name="pets" value="1"> Aceita animais</label></div></div>'
  +'<div class="pf-field"><span>Foto da fachada'+pfOpt+'</span><div class="pf-photo" id="pf-photo"><input type="file" id="pf-file" accept="image/*" class="pf-sr"><input type="hidden" name="photo"><label for="pf-file" class="pf-photo-add"><svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3v11H4zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8"/></svg><b>Adicionar foto</b><small>Tire agora ou escolha da galeria</small></label></div></div>'
  +pfField('Matrícula ou inscrição do IPTU'+pfOpt,'registry','maxlength="40" autocomplete="off"','Ajuda a achar o imóvel em documentos e boletos.')
  +'</fieldset>';
 const loc='<fieldset class="pf-step" data-step="1" hidden><legend>Localização do imóvel</legend>'
  +pfAddr(true)
  +pfField('Ponto de referência'+pfOpt,'reference','maxlength="100"','Útil para prestadores de manutenção.')
  +'</fieldset>';
 const val='<fieldset class="pf-step" data-step="2" hidden><legend>Valores do imóvel</legend>'
  +pfMoney('Aluguel pretendido por mês','rent',true,'Serve de sugestão ao criar o contrato.')
  +'<div class="pf-row pf-two">'+pfMoney('Condomínio por mês'+pfOpt,'condo')+pfMoney('IPTU por ano'+pfOpt,'iptu',false,'<span id="pf-iptu-m"></span>')+'</div>'
  +'<div class="pf-field"><span>Quem paga condomínio e IPTU</span>'+pfChips('payer',['Locatário','Locador'],'Locatário',false,'Quem paga condomínio e IPTU')+'</div>'
  +'<div class="pf-total" aria-live="polite"><span>Total mensal para o locatário</span><strong id="pf-total">R$ 0,00</strong><small id="pf-total-d">Aluguel</small></div>'
  
  +'</fieldset>';
 return steps+id+loc+val+'<div class="pf-foot"><button type="button" class="pf-back" data-pf-back hidden>Voltar</button><button class="primary pf-next">Continuar</button></div>';
}
const pfEl=()=>$('#form');
function pfGo(n){
 pfStep=n;pfSeen=Math.max(pfSeen,n);
 pfEl().querySelectorAll('.pf-step').forEach(s=>s.hidden=+s.dataset.step!==n);
 pfEl().querySelectorAll('[data-pf-go]').forEach(b=>{const i=+b.dataset.pfGo;b.disabled=i>pfSeen;b.setAttribute('aria-current',i===n?'step':'false');b.parentNode.classList.toggle('is-done',i<n)});
 pfEl().querySelector('[data-pf-back]').hidden=!n;pfEl().querySelector('.pf-next').textContent=n===pfMax?pfSave:'Continuar';
 $('#error').textContent='';$('dialog').scrollTop=0;
 pfEl().querySelector('.pf-step:not([hidden]) input:not([type=hidden]):not([type=file]):not([type=checkbox]):not([type=radio])')?.focus({preventScroll:true});
}
function pfCheck(n){
 const step=pfEl().querySelector('.pf-step[data-step="'+n+'"]');
 if(action==='person'){const E=pfEl().elements;E.number.required=!!E.street.value.trim()&&!E.noNumber.checked}
 for(const el of step.querySelectorAll('input,select')){
  if(el.type==='text')el.value=el.value.trim();
  if(!el.checkValidity()){if(pfStep!==n)pfGo(n);el.reportValidity();if(el.type!=='radio')el.focus();return false}
 }
 return true;
}
const pfCents=v=>Math.round((Number(v)||0)*100);
function pfTotals(){
 const f=pfEl();if(!f.querySelector('#pf-total'))return;
 const E=f.elements,rent=pfCents(E.rent.value),condo=pfCents(E.condo.value),iptu=Math.round(pfCents(E.iptu.value)/12),tenant=f.querySelector('[name=payer]:checked')?.value!=='Locador';
 $('#pf-iptu-m').textContent=iptu?'≈ '+money(iptu)+' por mês':'';
 const parts=[['Aluguel',rent],...(tenant?[['condomínio',condo],['IPTU',iptu]]:[])].filter(([,v],i)=>!i||v);
 $('#pf-total').textContent=money(parts.reduce((n,[,v])=>n+v,0));
 $('#pf-total-d').textContent=parts.map(([l])=>l).join(' + ')+(!tenant&&(condo||iptu)?' · condomínio e IPTU por conta do locador':'');
}
// Busca do endereço pelo CEP (ViaCEP, com BrasilAPI de reserva). Só preenche campos vazios ou que vieram da busca anterior.
let pfCepSeq=0;
async function pfCep(raw){
 const cep=raw.replace(/\D/g,''),msg=$('#pf-cep-msg'),f=pfEl();if(cep.length!==8)return;
 const seq=++pfCepSeq;msg.textContent='Buscando endereço…';msg.className='';
 let a=null;
 try{const r=await fetch('https://viacep.com.br/ws/'+cep+'/json/');const j=await r.json();if(r.ok&&!j.erro)a={street:j.logradouro,district:j.bairro,city:j.localidade,uf:j.uf}}catch{}
 if(!a)try{const r=await fetch('https://brasilapi.com.br/api/cep/v1/'+cep);if(r.ok){const j=await r.json();a={street:j.street,district:j.neighborhood,city:j.city,uf:j.state}}}catch{}
 if(seq!==pfCepSeq||!f.elements.cep)return;
 if(!a){msg.textContent='Não encontramos esse CEP. Confira os números ou preencha o endereço abaixo.';msg.className='is-bad';return}
 for(const k of ['street','district','city','uf']){const el=f.elements[k];if(a[k]&&(!el.value||el.dataset.auto)){el.value=a[k];el.dataset.auto='1'}}
 msg.textContent=a.street?'Endereço encontrado. Confira e informe o número.':'CEP da cidade inteira: informe rua e bairro.';msg.className='is-ok';
 (a.street?(f.elements.noNumber.checked?f.elements.complement:f.elements.number):f.elements.street).focus();
}
async function pfPhoto(file){
 const box=$('#pf-photo');if(!file)return;
 if(!file.type.startsWith('image/')){toast('Escolha um arquivo de imagem.');return}
 try{
  const img=await createImageBitmap(file),max=960,s=Math.min(1,max/Math.max(img.width,img.height));
  const c=document.createElement('canvas');c.width=Math.round(img.width*s);c.height=Math.round(img.height*s);c.getContext('2d').drawImage(img,0,0,c.width,c.height);
  let url='';for(const q of [.72,.6,.48,.36]){url=c.toDataURL('image/webp',q);if(!url.startsWith('data:image/webp'))url=c.toDataURL('image/jpeg',q);if(url.length*.75<290e3)break}
  pfEl().elements.photo.value=url;box.classList.add('has-photo');
  box.querySelector('.pf-photo-prev')?.remove();
  box.insertAdjacentHTML('beforeend','<div class="pf-photo-prev"><img src="'+url+'" alt="Foto da fachada escolhida"><div><label for="pf-file" class="pf-photo-btn">Trocar foto</label><button type="button" class="pf-photo-btn" data-pf-rm>Remover</button></div></div>');
 }catch{toast('Não foi possível ler esta imagem. Tente outra foto.')}
}
function pfData(f){
 const g=n=>(f.get(n)||'').toString().trim(),num=n=>g(n)===''?null:Number(g(n));
 const noNumber=!!f.get('noNumber'),number=noNumber?'S/N':g('number'),cep=g('cep').replace(/\D/g,'');
 const street=[g('street'),number].filter(Boolean).join(', ')+(g('complement')?' · '+g('complement'):'');
 return {name:g('name'),type:g('type'),purpose:g('purpose')||'Residencial',area:num('area'),bedrooms:num('bedrooms'),bathrooms:num('bathrooms'),parking:num('parking'),furnished:!!f.get('furnished'),pets:!!f.get('pets'),registry:g('registry'),photo:g('photo'),
  cep:cep.slice(0,5)+'-'+cep.slice(5),street:g('street'),number,noNumber,complement:g('complement'),district:g('district'),city:g('city'),uf:g('uf'),reference:g('reference'),
  address:street+' – '+g('district')+', '+g('city')+'/'+g('uf'),
  rent:pfCents(g('rent')),condo:pfCents(g('condo')),iptu:pfCents(g('iptu')),payer:g('payer')||'Locatário'};
}
document.addEventListener('input',e=>{
 const t=e.target;if(!t.closest?.('.pf-step'))return;
 if(t.name==='cep'){const d=t.value.replace(/\D/g,'').slice(0,8);t.value=d.length>5?d.slice(0,5)+'-'+d.slice(5):d;if(d.length===8)pfCep(d);else{$('#pf-cep-msg').textContent='Digite o CEP para preencher o endereço.';$('#pf-cep-msg').className=''}}
 if(['street','district','city'].includes(t.name))delete t.dataset.auto;
 if(['rent','condo','iptu'].includes(t.name))pfTotals();
});
document.addEventListener('change',e=>{
 const t=e.target;
 if(!t.closest?.('.pf-step'))return;
 if(t.id==='pf-file'){pfPhoto(t.files[0]);t.value=''}
 if(t.name==='type'){const p=pfEl().querySelector('[name=purpose][value="'+(pfBusiness.includes(t.value)?'Comercial':'Residencial')+'"]');if(p)p.checked=true}
 if(t.name==='noNumber'){const n=pfEl().elements.number;n.disabled=t.checked;n.required=!t.checked&&action==='property';if(t.checked)n.value='';else n.focus()}
 if(t.name==='payer')pfTotals();
 if(t.name==='uf')delete t.dataset.auto;
});
document.addEventListener('click',e=>{
 const go=e.target.closest('[data-pf-go]'),back=e.target.closest('[data-pf-back]'),rm=e.target.closest('[data-pf-rm]');
 if(go){const n=+go.dataset.pfGo;for(let i=pfStep;i<n;i++)if(!pfCheck(i))return;pfGo(n)}
 if(back)pfGo(pfStep-1);
 if(rm){pfEl().elements.photo.value='';$('#pf-photo').classList.remove('has-photo');$('#pf-photo .pf-photo-prev')?.remove();$('#pf-photo .pf-photo-add').focus()}
});
// Barra das telas de cadastro: indicadores, busca e filtro por situação (Claude · design/ux-ui).
let ltQ='',ltSt='Todos',ltPage='';
const ltNorm=v=>String(v||'').toLowerCase().normalize('NFD').replace(/\p{M}/gu,'');
function ltTools(kpis,chips,ph,extra=''){
 return '<section class="home-kpis lt-kpis" aria-label="Indicadores">'+kpis.map(([label,val,hint,mod,bar])=>'<div class="home-kpi'+(mod?' home-kpi--'+mod:'')+'"><span>'+label+'</span><strong>'+val+'</strong>'+(bar!=null?'<span class="home-kpi-bar" aria-hidden="true"><i style="width:'+bar+'%"></i></span>':'')+(hint?'<small>'+hint+'</small>':'')+'</div>').join('')+'</section>'
  +'<div class="lt-bar"><label class="lt-search"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg><input type="search" id="lt-q" placeholder="'+ph+'" aria-label="'+ph+'" value="'+enc(ltQ)+'" autocomplete="off"></label>'+extra
  +'<div class="lt-chips" role="group" aria-label="Filtrar por situação">'+['Todos',...chips].map(c=>'<button type="button" data-lt-st="'+enc(c)+'" aria-pressed="'+(c===ltSt)+'">'+enc(c)+'</button>').join('')+'</div></div>'
  +'<p class="empty lt-none" hidden>Nada encontrado com esse filtro.</p>';
}
function ltApply(){
 const q=ltNorm(ltQ).trim();let shown=0;
 document.querySelectorAll('#view [data-st]').forEach(c=>{const ok=(ltSt==='Todos'||c.dataset.st.split('|').includes(ltSt))&&(!q||ltNorm(c.textContent).includes(q));c.hidden=!ok;if(ok)shown++});
 const none=$('#view .lt-none');if(none)none.hidden=!!shown||!document.querySelector('#view [data-st]');
}
document.addEventListener('input',e=>{if(e.target.id==='lt-q'){ltQ=e.target.value;ltApply()}});
document.addEventListener('click',e=>{const b=e.target.closest('[data-lt-st]');if(!b)return;ltSt=b.dataset.ltSt;document.querySelectorAll('[data-lt-st]').forEach(x=>x.setAttribute('aria-pressed',x===b));ltApply()});
// Cobranças, Manutenções e Financeiro no padrão das telas largas (Claude · design/ux-ui).
const opDays=(a,b)=>Math.round((Date.parse(b)-Date.parse(a))/864e5);
const opMonth=()=>'<label class="lt-month"><span>Mês</span><input id="month" aria-label="Mês de referência" type="month" min="1900-01" max="2199-12" value="'+month+'"></label>';
const opPill=s=>'<span class="tl-st '+(s==='Pago'||s==='Concluída'?'is-ok':s==='Em atraso'||s==='Atrasada'?'is-late':'is-soon')+'">'+enc(s)+'</span>';
const opSum=xs=>xs.reduce((n,x)=>n+x.amount,0);
function chargePage(cs){
 const now=today(),paid=cs.filter(c=>c.paid),late=cs.filter(c=>c.status==='Em atraso'),open=cs.filter(c=>c.status==='A vencer'),total=opSum(cs),pct=total?Math.round(opSum(paid)/total*100):0;
 const kpis=[['A receber no mês',money(total),cs.length+' cobrança'+(cs.length===1?'':'s')],['Recebido',money(opSum(paid)),pct+'% do previsto','good',pct],['Em atraso',money(opSum(late)),late.length?late.length+' cobrança'+(late.length>1?'s':''):'nenhuma em atraso',late.length?'bad':'good'],['A vencer',money(opSum(open)),open.length?'próxima em '+date(open[0].due):'nada a vencer']];
 if(!cs.length)return ltTools(kpis,['Em atraso','A vencer','Pago'],'Buscar por imóvel ou locatário',opMonth())+panel('Aluguéis de '+monthName(month),empty('Nenhuma cobrança neste mês.'));
 const order={'Em atraso':0,'A vencer':1,'Pago':2};
 return ltTools(kpis,['Em atraso','A vencer','Pago'],'Buscar por imóvel ou locatário',opMonth())+'<div class="ch-grid">'+cs.slice().sort((a,b)=>order[a.status]-order[b.status]||a.due.localeCompare(b.due)).map(c=>{
  const ph=tfDigits(c.person?.phone),wa=ph?'https://wa.me/'+(ph.length<=11?'55':'')+ph+'?text='+encodeURIComponent('Olá, '+c.person.name+'! O aluguel de '+c.property.name+', no valor de '+money(c.amount)+', tem vencimento em '+date(c.due)+'.'):'';
  const d=opDays(now,c.due),when=c.paid?'Recebido em '+date(c.paid.date):c.status==='Em atraso'?'Venceu em '+date(c.due)+' · '+(-d)+' dia'+(d===-1?'':'s')+' de atraso':'Vence em '+date(c.due)+(d===0?' · hoje':d===1?' · amanhã':' · em '+d+' dias');
  return '<article class="ch-card" data-st="'+c.status+'"><div class="ch-head"><div><h2>'+enc(c.property?.name||'Imóvel')+'</h2><small>'+enc(c.person?.name||'Locatário')+'</small></div>'+opPill(c.status)+'</div>'
   +'<div class="ch-amt"><strong>'+money(c.amount)+'</strong><span class="'+(c.status==='Em atraso'?'lf-bad':'')+'">'+when+'</span></div>'
   +(c.paid?'':'<div class="ch-act">'+btn('pay|'+c.key,'Registrar pagamento','primary')+(wa?'<a class="button" target="_blank" rel="noopener" href="'+enc(wa)+'">WhatsApp</a>':'')+'</div>')+'</article>'}).join('')+'</div>';
}
function jobPage(){
 const now=today(),todo=db.jobs.filter(j=>!j.done),late=todo.filter(j=>j.date<now),doneM=db.jobs.filter(j=>j.done&&(j.completed||j.date).startsWith(current())),next=todo.filter(j=>j.date>=now).sort((a,b)=>a.date.localeCompare(b.date))[0];
 const kpis=[['Agendadas',todo.length,todo.length?'a fazer':'nada pendente'],['Atrasadas',late.length,late.length?'data já passou':'tudo no prazo',late.length?'bad':'good'],['Concluídas no mês',doneM.length,monthName(current())],['Próxima',next?date(next.date).slice(0,5):'—',next?enc(next.name):'sem serviço agendado']];
 if(!db.jobs.length)return ltTools(kpis,['Agendadas','Atrasadas','Concluídas'],'Buscar por serviço ou imóvel')+panel('Agenda',empty('Nenhuma manutenção agendada.'));
 return ltTools(kpis,['Agendadas','Atrasadas','Concluídas'],'Buscar por serviço ou imóvel')+'<div class="ch-grid">'+db.jobs.slice().sort((a,b)=>Number(a.done)-Number(b.done)||(a.done?b.date.localeCompare(a.date):a.date.localeCompare(b.date))).map(j=>{
  const d=opDays(now,j.date),st=j.done?'Concluída':j.date<now?'Atrasada':'Agendada';
  const when=j.done?'Concluída em '+date(j.completed||j.date):d<0?'Era para '+date(j.date)+' · há '+(-d)+' dia'+(d===-1?'':'s'):date(j.date)+(d===0?' · hoje':d===1?' · amanhã':' · em '+d+' dias');
  return '<article class="ch-card mt-card" data-st="'+(st==='Atrasada'?'Atrasadas|Agendadas':st==='Concluída'?'Concluídas':'Agendadas')+'"><div class="ch-head"><div><h2>'+enc(j.name)+'</h2><small>'+enc(pname(j.property)||'Imóvel')+'</small></div>'+opPill(st)+'</div>'
   +'<p class="mt-when '+(st==='Atrasada'?'lf-bad':'')+'">'+when+'</p>'+(j.done?'':'<div class="ch-act">'+btn('finish|'+j.id,'Concluir serviço','primary')+'</div>')+'</article>'}).join('')+'</div>';
}
function financePage(fin){
 const moves=[...db.payments.map(p=>({...p,name:pname(db.leases.find(l=>l.id===p.key.split('/')[0])?.property),type:'Aluguel'})),...db.expenses.map(e=>({...e,amount:-e.amount,type:'Despesa'}))].filter(x=>x.date.startsWith(month)).sort((a,b)=>b.date.localeCompare(a.date));
 const cs=charges(db,month),pend=opSum(cs.filter(c=>!c.paid)),bal=fin.income-fin.cost,prev=cash(db,shift(month,-1)),pb=prev.income-prev.cost;
 const kpis=[['Entradas',money(fin.income),'aluguéis recebidos','good'],['Saídas',money(fin.cost),'despesas e manutenções'],['Saldo do mês',money(bal),prev.income||prev.cost?(bal>=pb?'▲ ':'▼ ')+money(Math.abs(bal-pb))+' vs. mês anterior':'sem mês anterior',bal<0?'bad':''],['Ainda a receber',money(pend),pend?'cobranças em aberto no mês':'tudo recebido',pend?'':'good']];
 const rows=moves.map(x=>'<div class="item fin-row" data-st="'+(x.amount<0?'Saídas':'Entradas')+'"><div><h3>'+enc(x.name||x.type)+'</h3><small>'+date(x.date)+' · '+x.type+'</small></div><div class="right"><strong class="num '+(x.amount<0?'fin-out':'fin-in')+'">'+(x.amount<0?'− ':'+ ')+money(Math.abs(x.amount))+'</strong></div></div>').join('');
 return ltTools(kpis,['Entradas','Saídas'],'Buscar movimentação',opMonth())
  +'<div class="fin-grid">'+panel('Movimentações de '+monthName(month),rows||empty('Nenhuma movimentação no mês.'),btn('exportFinance','Exportar CSV'))
  +panel('Últimos 6 meses',chart())+'</div>';
}
function propertyList(){
 if(!db.properties.length)return panel('Seus imóveis',empty('Cadastre o primeiro imóvel para começar.'));
 const now=today(),plural=(n,a,b)=>n+' '+(n===1?a:b),act=p=>db.leases.find(l=>l.property===p.id&&l.start<=now&&l.end>=now);
 const busy=db.properties.filter(act),inc=busy.reduce((n,p)=>n+act(p).amount,0),free=db.properties.length-busy.length,occ=Math.round(busy.length/db.properties.length*100);
 return ltTools([['Imóveis',db.properties.length,'na carteira'],['Ocupação',occ+'%',busy.length+' de '+db.properties.length+' alugados','',occ],['Disponíveis',free,free?'sem contrato vigente':'todos alugados',free?'':'good'],['Receita mensal',money(inc),busy.length?'média de '+money(Math.round(inc/busy.length)):'nenhum contrato vigente']],['Alugados','Disponíveis'],'Buscar por nome, endereço ou bairro')+'<div class="pl-grid">'+db.properties.map(p=>{
  const l=db.leases.find(l=>l.property===p.id&&l.start<=now&&l.end>=now),who=l&&db.people.find(x=>x.id===l.person)?.name;
  const feats=[p.area?String(p.area).replace('.',',')+' m²':'',p.bedrooms?plural(p.bedrooms,'quarto','quartos'):'',p.bathrooms?plural(p.bathrooms,'banheiro','banheiros'):'',p.parking?plural(p.parking,'vaga','vagas'):'',p.furnished?'mobiliado':''].filter(Boolean).join(' · ');
  const value=l?l.amount:p.rent;
  return '<article class="pl-card" data-st="'+(l?'Alugados':'Disponíveis')+'"><div class="pl-media">'+(p.photo?'<img src="'+enc(p.photo)+'" alt="Fachada de '+enc(p.name)+'" loading="lazy">':'<span class="pl-ph" aria-hidden="true">'+icon(1)+'</span>')+'<span class="pl-status '+(l?'is-busy':'is-free')+'">'+(l?'Alugado':'Disponível')+'</span></div><div class="pl-body"><h2>'+enc(p.name)+'</h2><p>'+enc(p.address)+'</p>'+(feats?'<small>'+enc(feats)+'</small>':'')+'<div class="pl-foot"><span class="pl-type">'+enc(p.type)+'</span>'+(value?'<strong>'+money(value)+'<small>/mês</small></strong>':'')+'</div>'+(who?'<small class="pl-who">Locatário: '+enc(who)+'</small>':'')+'</div></article>'}).join('')+'</div>';
}
// Cadastro de locatário em 3 etapas: dados pessoais, contato e endereço/garantia (Claude · design/ux-ui).
const tfGuarantees=['Sem garantia','Caução','Fiador','Seguro fiança','Título de capitalização'];
const tfMarital=['Solteiro(a)','Casado(a)','União estável','Divorciado(a)','Viúvo(a)'];
const tfDigits=v=>String(v||'').replace(/\D/g,'');
const tfPhoneMask=v=>{let d=tfDigits(v);if(d.length>11&&d.startsWith('55'))d=d.slice(2);d=d.slice(0,11);return d.length<3?d:'('+d.slice(0,2)+') '+(d.length>10?d.slice(2,7)+'-'+d.slice(7):d.length>6?d.slice(2,6)+'-'+d.slice(6):d.slice(2))};
const tfDocMask=(v,pj)=>{const d=tfDigits(v).slice(0,pj?14:11);return pj?d.replace(/^(\d{2})(\d)/,'$1.$2').replace(/^(\d{2})\.(\d{3})(\d)/,'$1.$2.$3').replace(/\.(\d{3})(\d)/,'.$1/$2').replace(/(\d{4})(\d)/,'$1-$2'):d.replace(/(\d{3})(\d)/,'$1.$2').replace(/(\d{3})(\d)/,'$1.$2').replace(/(\d{3})(\d{1,2})$/,'$1-$2')};
function tfDocOk(v){
 const d=tfDigits(v);if(!d)return true;if(/^(\d)\1+$/.test(d))return false;
 const dv=(s,w)=>{const r=s.split('').reduce((n,c,i)=>n+ +c*w[i],0)%11;return r<2?0:11-r};
 if(d.length===11){const w=n=>Array.from({length:n},(_,i)=>n+1-i);return dv(d.slice(0,9),w(9))===+d[9]&&dv(d.slice(0,10),w(10))===+d[10]}
 if(d.length===14){const w1=[5,4,3,2,9,8,7,6,5,4,3,2],w2=[6,...w1];return dv(d.slice(0,12),w1)===+d[12]&&dv(d.slice(0,13),w2)===+d[13]}
 return false;
}
// Endereço reutilizável (CEP com busca, rua, número ou "Sem número", complemento, bairro, cidade/UF).
const pfAddr=req=>{const r=req?'required ':'';return '<div class="pf-row pf-cep">'+pfField('CEP'+(req?'':pfOpt),'cep',r+'inputmode="numeric" autocomplete="postal-code" maxlength="9" pattern="\\d{5}-?\\d{3}" placeholder="00000-000"','<span id="pf-cep-msg" role="status">Digite o CEP para preencher o endereço.</span>')
 +'<a class="pf-link" href="https://buscacepinter.correios.com.br/app/endereco/index.php" target="_blank" rel="noopener">Não sei o CEP</a></div>'
 +pfField('Rua ou avenida','street',r+'maxlength="120" autocomplete="address-line1"')
 +'<div class="pf-row pf-num">'+pfField('Número','number',r+'maxlength="10" inputmode="numeric" autocomplete="off"')
 +'<label class="pf-sn"><input type="checkbox" name="noNumber" value="1"> Sem número</label></div>'
 +pfField('Complemento'+pfOpt,'complement','maxlength="60" placeholder="Apto, bloco, sala, fundos"')
 +pfField('Bairro','district',r+'maxlength="80"')
 +'<div class="pf-row pf-city">'+pfField('Cidade','city',r+'maxlength="80" autocomplete="address-level2"')
 +'<label class="pf-field pf-uf"><span>UF</span><select name="uf" '+r+'><option value="">—</option>'+pfUF.map(u=>'<option>'+u+'</option>').join('')+'</select></label></div>'};
const tfSel=(label,name,items)=>'<label class="pf-field"><span>'+label+'</span><select name="'+name+'"><option value="">Selecione</option>'+items.map(v=>'<option>'+enc(v)+'</option>').join('')+'</select></label>';
function tenantForm(){
 pfStep=0;pfSeen=0;pfMax=2;pfSave='Salvar locatário';
 const steps='<ol class="pf-steps">'+['Dados pessoais','Contato','Endereço e garantia'].map((s,i)=>'<li><button type="button" data-pf-go="'+i+'"'+(i?' disabled':'')+' aria-current="'+(i?'false':'step')+'"><b>'+(i+1)+'</b><span>'+s+'</span></button></li>').join('')+'</ol>';
 const who='<fieldset class="pf-step" data-step="0"><legend>Dados do locatário</legend>'
  +'<div class="pf-field"><span>Quem vai alugar</span>'+pfChips('kind',['Pessoa física','Pessoa jurídica'],'Pessoa física',false,'Quem vai alugar')+'</div>'
  +'<label class="pf-field"><span id="tf-name-l">Nome completo</span><input name="name" required maxlength="100" autocomplete="off" placeholder="Como está no documento"></label>'
  +'<label class="pf-field"><span><b id="tf-doc-l">CPF</b>'+pfOpt+'</span><input name="doc" inputmode="numeric" maxlength="18" autocomplete="off" placeholder="000.000.000-00"><small>Vai no contrato. Conferimos se os números são válidos.</small></label>'
  +'<div class="pf-row pf-two tf-pf">'+pfField('Data de nascimento'+pfOpt,'birth','type="date" max="'+today()+'" min="1900-01-01"')+tfSel('Estado civil'+pfOpt,'marital',tfMarital)+'</div>'
  +'<div class="pf-row pf-two tf-pf">'+pfField('RG'+pfOpt,'rg','maxlength="20" autocomplete="off"')+pfField('Profissão'+pfOpt,'job','maxlength="60"')+'</div>'
  +'<div class="tf-pj" hidden>'+pfField('Responsável legal'+pfOpt,'rep','maxlength="100" disabled','Quem assina pela empresa.')+'</div>'
  +pfMoney('<b id="tf-income-l">Renda mensal</b>'+pfOpt,'income',false,'<span id="tf-income-h">Referência comum: o aluguel não passar de 30% da renda.</span>')
  +'</fieldset>';
 const contact='<fieldset class="pf-step" data-step="1" hidden><legend>Contato</legend>'
  +pfField('WhatsApp com DDD','phone','type="tel" inputmode="tel" autocomplete="off" maxlength="16" pattern="\\(\\d{2}\\) \\d{4,5}-\\d{4}" placeholder="(11) 98765-4321"','Usado para enviar lembretes de cobrança. Recomendado.')
  +pfField('E-mail'+pfOpt,'email','type="email" maxlength="120" autocomplete="off" placeholder="nome@exemplo.com"')
  +'<div class="pf-field"><span>Melhor forma de contato</span>'+pfChips('pref',['WhatsApp','Ligação','E-mail'],'WhatsApp',false,'Melhor forma de contato')+'</div>'
  +'<div class="pf-field"><span>Contato de emergência'+pfOpt+'</span><div class="pf-row pf-two">'
  +'<label class="pf-mini"><small>Nome</small><input name="emName" maxlength="100" autocomplete="off"></label>'
  +'<label class="pf-mini"><small>Telefone</small><input name="emPhone" type="tel" inputmode="tel" maxlength="16" autocomplete="off" pattern="\\(\\d{2}\\) \\d{4,5}-\\d{4}"></label></div></div>'
  +'</fieldset>';
 const addr='<fieldset class="pf-step" data-step="2" hidden><legend>Endereço e garantia</legend>'
  +'<div class="pf-field"><span>Endereço atual'+pfOpt+'</span><small>Onde o locatário mora hoje. Pode deixar em branco se ele vai morar no imóvel alugado.</small></div>'
  +pfAddr(false)
  +'<div class="pf-field"><span>Garantia do contrato</span>'+pfChips('guarantee',tfGuarantees,'Sem garantia',false,'Garantia do contrato')+'</div>'
  +'<div class="tf-g" data-g="Caução" hidden>'+pfMoney('Valor da caução','gValue',false,'O usual é até 3 meses de aluguel.')+'</div>'
  +'<div class="tf-g pf-field" data-g="Fiador" hidden><span>Dados do fiador</span>'
  +'<label class="pf-mini"><small>Nome completo</small><input name="gName" maxlength="100" autocomplete="off"></label>'
  +'<div class="pf-row pf-two"><label class="pf-mini"><small>CPF</small><input name="gDoc" inputmode="numeric" maxlength="14" autocomplete="off" placeholder="000.000.000-00"></label>'
  +'<label class="pf-mini"><small>Telefone</small><input name="gPhone" type="tel" inputmode="tel" maxlength="16" autocomplete="off" pattern="\\(\\d{2}\\) \\d{4,5}-\\d{4}"></label></div></div>'
  +'<div class="tf-g" data-g="Seguro fiança|Título de capitalização" hidden>'+pfField('Empresa e número da apólice'+pfOpt,'gRef','maxlength="80" autocomplete="off"')+'</div>'
  +'<label class="pf-field"><span>Observações'+pfOpt+'</span><textarea name="notes" rows="3" maxlength="500" placeholder="Ex.: tem um cachorro pequeno; prefere contato à tarde"></textarea></label>'
  
  +'</fieldset>';
 return steps+who+contact+addr+'<div class="pf-foot"><button type="button" class="pf-back" data-pf-back hidden>Voltar</button><button class="primary pf-next">Continuar</button></div>';
}
function tfKind(pj){
 const f=pfEl(),E=f.elements;
 $('#tf-name-l').textContent=pj?'Razão social':'Nome completo';$('#tf-doc-l').textContent=pj?'CNPJ':'CPF';$('#tf-income-l').textContent=pj?'Faturamento mensal':'Renda mensal';
 E.doc.placeholder=pj?'00.000.000/0000-00':'000.000.000-00';E.doc.value=tfDocMask(E.doc.value,pj);tfDocCheck(E.doc);
 f.querySelectorAll('.tf-pf').forEach(b=>{b.hidden=pj;b.querySelectorAll('input,select').forEach(i=>i.disabled=pj)});
 f.querySelectorAll('.tf-pj').forEach(b=>{b.hidden=!pj;b.querySelectorAll('input').forEach(i=>i.disabled=!pj)});
}
function tfDocCheck(el){const d=tfDigits(el.value),pj=el.name==='doc'&&pfEl().querySelector('[name=kind]:checked')?.value==='Pessoa jurídica';el.setCustomValidity(!d||tfDocOk(d)&&d.length===(pj?14:11)?'':(pj?'CNPJ':'CPF')+' inválido. Confira os números.')}
function tfGuarantee(v){pfEl().querySelectorAll('.tf-g').forEach(b=>{const on=b.dataset.g.split('|').includes(v);b.hidden=!on;b.querySelectorAll('input').forEach(i=>i.disabled=!on)})}
function tfData(f){
 const g=n=>(f.get(n)||'').toString().trim(),pj=g('kind')==='Pessoa jurídica',noNumber=!!f.get('noNumber'),number=noNumber?'S/N':g('number'),cep=tfDigits(g('cep')),gu=g('guarantee')||'Sem garantia';
 const address=g('street')?[g('street'),number].filter(Boolean).join(', ')+(g('complement')?' · '+g('complement'):'')+(g('district')?' – '+g('district'):'')+(g('city')?', '+g('city')+(g('uf')?'/'+g('uf'):''):''):'';
 return {kind:pj?'PJ':'PF',name:g('name'),doc:tfDigits(g('doc')),birth:pj?'':g('birth'),marital:pj?'':g('marital'),rg:pj?'':g('rg'),job:pj?'':g('job'),rep:pj?g('rep'):'',income:pfCents(g('income')),
  phone:tfDigits(g('phone')),email:g('email').toLowerCase(),pref:g('pref')||'WhatsApp',emName:g('emName'),emPhone:tfDigits(g('emPhone')),
  cep:cep?cep.slice(0,5)+'-'+cep.slice(5):'',street:g('street'),number:g('street')?number:'',noNumber,complement:g('complement'),district:g('district'),city:g('city'),uf:g('uf'),address,
  guarantee:gu,gValue:gu==='Caução'?pfCents(g('gValue')):0,gName:gu==='Fiador'?g('gName'):'',gDoc:gu==='Fiador'?tfDigits(g('gDoc')):'',gPhone:gu==='Fiador'?tfDigits(g('gPhone')):'',gRef:/Seguro|Título/.test(gu)?g('gRef'):'',notes:g('notes')};
}
document.addEventListener('input',e=>{
 const t=e.target;if(action!=='person'||!t.closest?.('.pf-step'))return;
 if(['phone','emPhone','gPhone'].includes(t.name))t.value=tfPhoneMask(t.value);
 if(t.name==='doc'||t.name==='gDoc'){t.value=tfDocMask(t.value,t.name==='doc'&&pfEl().querySelector('[name=kind]:checked')?.value==='Pessoa jurídica');tfDocCheck(t)}
});
document.addEventListener('change',e=>{
 const t=e.target;if(action!=='person'||!t.closest?.('.pf-step'))return;
 if(t.name==='kind')tfKind(t.value==='Pessoa jurídica');
 if(t.name==='guarantee')tfGuarantee(t.value);
});
// Lista de locatários em cartões, com situação do contrato e atalho de WhatsApp.
function personList(){
 if(!db.people.length)return panel('Seus locatários',empty('Cadastre um locatário para vinculá-lo ao imóvel.'));
 const now=today(),cs=charges(db,month),lateP=new Set(cs.filter(c=>c.status==='Em atraso').map(c=>c.person?.id)),withL=db.people.filter(p=>db.leases.some(l=>l.person===p.id&&l.start<=now&&l.end>=now)).length,noPhone=db.people.filter(p=>!tfDigits(p.phone)).length;
 return ltTools([['Locatários',db.people.length,'na carteira'],['Com contrato ativo',withL,db.people.length-withL?(db.people.length-withL)+' sem contrato':'todos com contrato'],['Em atraso',lateP.size,lateP.size?'em '+monthName(month):'ninguém em atraso',lateP.size?'bad':'good'],['Sem WhatsApp',noPhone,noPhone?'cadastre para enviar lembretes':'todos com contato',noPhone?'':'good']],['Em atraso','Contrato ativo','Sem contrato'],'Buscar por nome, e-mail ou imóvel')+'<div class="tl-grid">'+db.people.map(p=>{
  const l=db.leases.find(l=>l.person===p.id&&l.start<=now&&l.end>=now),prop=l&&db.properties.find(x=>x.id===l.property);
  const late=cs.filter(c=>c.person?.id===p.id&&c.status==='Em atraso');
  const st=late.length?['is-late','Em atraso']:l?['is-ok','Contrato ativo']:['is-none','Sem contrato'];
  const ini=p.name.split(/\s+/).filter(Boolean).map(w=>w[0]).filter((_,i,a)=>!i||i===a.length-1).join('').toUpperCase();
  const d=tfDigits(p.doc),doc=d.length===11?'CPF ***.'+d.slice(3,6)+'.'+d.slice(6,9)+'-**':d.length===14?'CNPJ '+tfDocMask(d,true):'';
  const ph=tfDigits(p.phone),wa=ph?'https://wa.me/'+(ph.length<=11?'55':'')+ph:'';
  const rows=[ph?['Telefone','<a href="'+enc(wa)+'" target="_blank" rel="noopener">'+enc(tfPhoneMask(ph))+'</a>']:['Telefone','<span class="tl-muted">Sem telefone</span>'],p.email?['E-mail','<a href="mailto:'+enc(p.email)+'">'+enc(p.email)+'</a>']:null,['Imóvel',prop?enc(prop.name)+' · '+money(l.amount)+'/mês':'<span class="tl-muted">Nenhum no momento</span>'],p.guarantee&&p.guarantee!=='Sem garantia'?['Garantia',enc(p.guarantee)+(p.gValue?' · '+money(p.gValue):'')+(p.gName?' · '+enc(p.gName):'')]:null].filter(Boolean);
  return '<article class="tl-card" data-st="'+(late.length?'Em atraso|':'')+(l?'Contrato ativo':'Sem contrato')+'"><div class="tl-head"><span class="tl-av" aria-hidden="true">'+enc(ini||'?')+'</span><div><h2>'+enc(p.name)+'</h2><small>'+(p.kind==='PJ'?'Pessoa jurídica':'Pessoa física')+(doc?' · '+doc:'')+'</small></div><span class="tl-st '+st[0]+'">'+st[1]+'</span></div>'
   +'<dl>'+rows.map(([k,v])=>'<div><dt>'+k+'</dt><dd>'+v+'</dd></div>').join('')+'</dl>'
   +(late.length?'<p class="tl-alert">'+late.length+' cobrança'+(late.length>1?'s':'')+' em atraso · '+money(late.reduce((n,c)=>n+c.amount,0))+'</p>':'')
   +(wa?'<a class="button tl-wa" href="'+enc(wa+'?text='+encodeURIComponent('Olá, '+p.name.split(' ')[0]+'!'))+'" target="_blank" rel="noopener">Conversar no WhatsApp</a>':'')
   +'</article>'}).join('')+'</div>';
}
// Cadastro de contrato em 3 etapas: partes, prazo e valor, condições (Claude · design/ux-ui).
const lfISO=d=>d.toISOString().slice(0,10);
const lfLast=(y,m)=>new Date(Date.UTC(y,m,0)).getUTCDate();
function lfEnd(start,n){const [y,m,d]=start.split('-').map(Number),t=new Date(Date.UTC(y,m-1+n,1));t.setUTCDate(Math.min(d,lfLast(t.getUTCFullYear(),t.getUTCMonth()+1)));t.setUTCDate(t.getUTCDate()-1);return lfISO(t)}
function lfDues(start,end,day){const out=[];let mo=start.slice(0,7);for(let i=0;i<600&&mo<=end.slice(0,7);i++,mo=shift(mo,1)){const [y,m]=mo.split('-').map(Number),due=mo+'-'+String(Math.min(day,lfLast(y,m))).padStart(2,'0');if(due>=start&&due<=end)out.push(due)}return out}
const lfMonths=(start,end)=>Math.max(0,Math.round((Date.parse(end)-Date.parse(start)+864e5)/(864e5*30.4375)));
function leaseForm(){
 pfStep=0;pfSeen=0;pfMax=2;pfSave='Salvar contrato';
 const cloud=wallet==='cloud',now=today(),start=shift(current(),1)+'-01';
 const busy=p=>db.leases.filter(l=>l.property===p.id&&l.end>=now).sort((a,b)=>b.end.localeCompare(a.end))[0];
 const props=cloud?db.units.filter(u=>u.status==='available').map(u=>'<option value="'+enc(u.id)+'">'+enc(pname(u.property_id)+' · '+u.name)+'</option>').join('')
  :db.properties.map(p=>{const b=busy(p);return '<option value="'+enc(p.id)+'">'+enc(p.name+(b?' · alugado até '+date(b.end):' · disponível'))+'</option>'}).join('');
 const steps='<ol class="pf-steps">'+['Partes','Prazo e valor','Condições'].map((s,i)=>'<li><button type="button" data-pf-go="'+i+'"'+(i?' disabled':'')+' aria-current="'+(i?'false':'step')+'"><b>'+(i+1)+'</b><span>'+s+'</span></button></li>').join('')+'</ol>';
 const parts='<fieldset class="pf-step" data-step="0"><legend>Quem aluga o quê</legend>'
  +'<label class="pf-field"><span>'+(cloud?'Imóvel e unidade':'Imóvel')+'</span><select name="'+(cloud?'unit':'property')+'" required><option value="">Selecione o imóvel</option>'+props+'</select></label>'
  +'<div class="lf-info" id="lf-prop" hidden></div>'
  +'<label class="pf-field"><span>Locatário</span><select name="person" required><option value="">Selecione o locatário</option>'+db.people.map(p=>'<option value="'+enc(p.id)+'">'+enc(p.name)+'</option>').join('')+'</select><small>Não está na lista? Cadastre antes em Locatários.</small></label>'
  +'<div class="lf-info" id="lf-person" hidden></div>'
  +'</fieldset>';
 const term='<fieldset class="pf-step" data-step="1" hidden><legend>Prazo e valor</legend>'
  +'<div class="pf-field"><span>Duração</span>'+pfChips('dur',['12 meses','24 meses','30 meses','36 meses','Outro'],'12 meses',false,'Duração do contrato')+'</div>'
  +'<div class="pf-row pf-two">'+pfField('Início','start','type="date" required value="'+start+'"')+pfField('Término','end','type="date" required value="'+lfEnd(start,12)+'"','<span id="lf-len"></span>')+'</div>'
  +pfMoney('Aluguel mensal','amount',true,'<span id="lf-amount-h"></span>')
  +pfField('Dia do vencimento','day','type="number" inputmode="numeric" required min="1" max="31" value="10"','<span id="lf-first"></span>','lf-day')
  +'</fieldset>';
 const cond='<fieldset class="pf-step" data-step="2" hidden><legend>Condições</legend>'
  +'<div class="pf-field"><span>Reajuste anual'+pfOpt+'</span>'+pfChips('index',['IGP-M','IPCA','IVAR','Sem reajuste'],'',false,'Índice de reajuste')+'<small id="lf-index-h">O índice é combinado entre as partes e fica escrito no contrato.</small></div>'
  +'<div class="pf-row pf-two">'+pfField('Multa por atraso (%)'+pfOpt,'fine','type="number" inputmode="decimal" min="0" max="100" step=".1" placeholder="Ex.: 2"')+pfField('Juros ao mês (%)'+pfOpt,'interest','type="number" inputmode="decimal" min="0" max="10" step=".1" placeholder="Ex.: 1"')+'</div>'
  +'<div class="pf-field"><span>Garantia</span>'+pfChips('guarantee',tfGuarantees,'Sem garantia',false,'Garantia do contrato')+'<small id="lf-g-h"></small></div>'
  +'<div class="tf-g" data-g="Caução" hidden>'+pfMoney('Valor da caução','gValue',false)+'</div>'
  +'<label class="pf-field"><span>Observações'+pfOpt+'</span><textarea name="notes" rows="3" maxlength="500" placeholder="Ex.: pintura na entrega; chaves entregues em 2 vias"></textarea></label>'
  +'<div class="pf-total lf-sum" aria-live="polite"><span>Resumo do contrato</span><div id="lf-sum"></div></div>'
  
  +'</fieldset>';
 return steps+parts+term+cond+'<div class="pf-foot"><button type="button" class="pf-back" data-pf-back hidden>Voltar</button><button class="primary pf-next">Continuar</button></div>';
}
function lfRefresh(){
 const f=pfEl(),E=f.elements;if(!E.start||action!=='lease')return;
 const cloud=wallet==='cloud',pid=cloud?db.units.find(u=>u.id===E.unit.value)?.property_id:E.property.value,p=db.properties.find(x=>x.id===pid),who=db.people.find(x=>x.id===E.person.value);
 const pi=$('#lf-prop');pi.hidden=!p;if(p)pi.innerHTML='<b>'+enc(p.type||'Imóvel')+'</b> · '+enc(p.address||'')+(p.rent?'<br>Aluguel pretendido: '+money(p.rent):'');
 const wi=$('#lf-person');wi.hidden=!who;if(who)wi.innerHTML=(who.phone?'WhatsApp '+enc(tfPhoneMask(who.phone)):'Sem telefone cadastrado')+(who.guarantee&&who.guarantee!=='Sem garantia'?' · Garantia no cadastro: '+enc(who.guarantee):'');
 const s=E.start.value,e=E.end.value,day=+E.day.value,amt=pfCents(E.amount.value);
 let err='';if(s&&e&&e<s)err='O término precisa ser depois do início.';
 else if(!cloud&&p&&s&&e){const c=db.leases.find(l=>l.property===p.id&&l.start<=e&&l.end>=s);if(c)err='Este imóvel já tem contrato de '+date(c.start)+' a '+date(c.end)+'. Ajuste as datas.'}
 E.end.setCustomValidity(err);
 const n=s&&e&&e>=s?lfMonths(s,e):0;$('#lf-len').textContent=err||(n?n+' '+(n===1?'mês':'meses'):'');$('#lf-len').className=err?'lf-bad':'';
 $('#lf-amount-h').textContent=p?.rent&&amt&&amt!==p.rent?'Aluguel pretendido do imóvel: '+money(p.rent):'';
 const dues=s&&e&&day>=1&&day<=31&&!err?lfDues(s,e,day):[];
 $('#lf-first').textContent=dues.length?'Primeira cobrança em '+date(dues[0])+(day>28?' · nos meses mais curtos, vence no último dia':''):'';
 const idx=f.querySelector('[name=index]:checked')?.value,adj=s&&idx&&idx!=='Sem reajuste'?lfEnd(s,12):'';
 $('#lf-index-h').textContent=adj?'Primeiro reajuste por '+idx+' em '+date(lfISO(new Date(Date.parse(adj)+864e5))).slice(3)+', no aniversário do contrato.':'O índice é combinado entre as partes e fica escrito no contrato.';
 const g=f.querySelector('[name=guarantee]:checked')?.value,gv=pfCents(E.gValue?.value);
 $('#lf-sum').innerHTML=(who&&p?'<p><b>'+enc(who.name)+'</b> aluga <b>'+enc(p.name)+'</b></p>':'<p>Escolha o imóvel e o locatário.</p>')
  +(n?'<p>'+date(s)+' a '+date(e)+' · '+n+' '+(n===1?'mês':'meses')+'</p>':'')
  +(amt?'<p><strong>'+money(amt)+'</strong>/mês'+(day?', todo dia '+day:'')+'</p>':'')
  +(dues.length&&amt?'<p>'+dues.length+' cobranças · total de '+money(dues.length*amt)+'</p>':'')
  +(g&&g!=='Sem garantia'?'<p>Garantia: '+enc(g)+(g==='Caução'&&gv?' de '+money(gv):'')+'</p>':'');
}
function lfData(f){
 const g=n=>(f.get(n)||'').toString().trim(),gu=g('guarantee')||'Sem garantia',num=n=>g(n)===''?null:Number(g(n));
 return {property:g('property'),unit:g('unit'),person:g('person'),start:g('start'),end:g('end'),amount:pfCents(g('amount')),day:Number(g('day')),months:lfMonths(g('start'),g('end')),
  index:g('index'),fine:num('fine'),interest:num('interest'),guarantee:gu,gValue:gu==='Caução'?pfCents(g('gValue')):0,notes:g('notes')};
}
document.addEventListener('input',e=>{const t=e.target;if(action!=='lease'||!t.closest?.('.pf-step'))return;
 if(t.name==='end'){const o=pfEl().querySelector('[name=dur][value=Outro]');if(o)o.checked=true}
 if(t.name==='start')t.dataset.touched='1';
 if(t.name==='start'){const d=pfEl().querySelector('[name=dur]:checked')?.value;if(d&&d!=='Outro'&&t.value)pfEl().elements.end.value=lfEnd(t.value,parseInt(d))}
 lfRefresh()});
document.addEventListener('change',e=>{const t=e.target;if(action!=='lease'||!t.closest?.('.pf-step'))return;const E=pfEl().elements;
 if(t.name==='property'||t.name==='unit'){const pid=t.name==='unit'?db.units.find(u=>u.id===t.value)?.property_id:t.value,p=db.properties.find(x=>x.id===pid);if(p?.rent&&(!E.amount.value||E.amount.dataset.auto)){E.amount.value=(p.rent/100).toFixed(2);E.amount.dataset.auto='1'}
  const last=p&&db.leases.filter(l=>l.property===p.id).sort((a,b)=>b.end.localeCompare(a.end))[0];
  if(last&&!E.start.dataset.touched&&last.end>=E.start.value){E.start.value=lfISO(new Date(Date.parse(last.end)+864e5));const d=pfEl().querySelector('[name=dur]:checked')?.value;if(d&&d!=='Outro')E.end.value=lfEnd(E.start.value,parseInt(d))}}
 if(t.name==='amount')delete t.dataset.auto;
 if(t.name==='person'){const w=db.people.find(x=>x.id===t.value),r=w?.guarantee&&pfEl().querySelector('[name=guarantee][value="'+w.guarantee+'"]');if(r){r.checked=true;tfGuarantee(w.guarantee);if(w.gValue)E.gValue.value=(w.gValue/100).toFixed(2)}}
 if(t.name==='dur'&&t.value!=='Outro'&&E.start.value)E.end.value=lfEnd(E.start.value,parseInt(t.value));
 if(t.name==='dur'&&t.value==='Outro')E.end.focus();
 if(t.name==='guarantee')tfGuarantee(t.value);
 lfRefresh()});
// Lista de contratos em cartões: vigência, situação do mês e reajuste.
function leaseList(){
 if(!db.leases.length)return panel('Seus contratos',empty('O contrato vincula um imóvel a um locatário e gera as cobranças mensais.'));
 const now=today(),cs=charges(db,month),days=(a,b)=>Math.round((Date.parse(b)-Date.parse(a))/864e5);
 const order=l=>l.end<now?2:l.start>now?1:0,live=db.leases.filter(l=>l.start<=now&&l.end>=now),ending=live.filter(l=>days(now,l.end)<=90),late=cs.filter(c=>c.status==='Em atraso');
 return ltTools([['Vigentes',live.length,db.leases.length-live.length?(db.leases.length-live.length)+' futuros ou encerrados':'todos vigentes'],['Receita contratada',money(live.reduce((n,l)=>n+l.amount,0)),'por mês'],['Terminam em 90 dias',ending.length,ending.length?'hora de renovar ou anunciar':'nenhum perto do fim',ending.length?'':'good'],['Em atraso no mês',late.length,late.length?money(late.reduce((n,c)=>n+c.amount,0)):'tudo em dia',late.length?'bad':'good']],['Vigentes','Terminam em breve','Futuros','Encerrados'],'Buscar por imóvel ou locatário')+'<div class="lc-grid">'+db.leases.slice().sort((a,b)=>order(a)-order(b)||a.end.localeCompare(b.end)).map(l=>{
  const p=db.properties.find(x=>x.id===l.property),who=db.people.find(x=>x.id===l.person),left=days(now,l.end);
  const st=l.end<now?['is-none','Encerrado']:l.start>now?['is-soon','Começa em '+date(l.start)]:left<=60?['is-warn','Termina em '+left+' dia'+(left===1?'':'s')]:['is-ok','Vigente'];
  const total=Math.max(1,days(l.start,l.end)),pct=Math.min(100,Math.max(0,Math.round(days(l.start,now)/total*100)));
  const n=lfMonths(l.start,l.end),cur=Math.min(n,Math.max(0,lfMonths(l.start,now)));
  const c=cs.find(x=>x.id===l.id),mc=c?c.paid?['is-ok','Pago em '+date(c.paid.date)]:c.status==='Em atraso'?['is-late','Em atraso desde '+date(c.due)]:['is-soon','Vence em '+date(c.due)]:null;
  const rows=[['Locatário',enc(who?.name||'Locatário')],['Vigência',date(l.start)+' a '+date(l.end)],['Vencimento','Todo dia '+l.day],l.index&&l.index!=='Sem reajuste'?['Reajuste',enc(l.index)+' · '+date(lfISO(new Date(Date.parse(lfEnd(l.start,12))+864e5))).slice(3)]:null,l.guarantee&&l.guarantee!=='Sem garantia'?['Garantia',enc(l.guarantee)+(l.gValue?' · '+money(l.gValue):'')]:null].filter(Boolean);
  return '<article class="lc-card" data-st="'+(l.end<now?'Encerrados':l.start>now?'Futuros':'Vigentes'+(left<=60?'|Terminam em breve':''))+'"><div class="lc-head"><div><h2>'+enc(p?.name||'Imóvel')+'</h2><strong>'+money(l.amount)+'<small>/mês</small></strong></div><span class="tl-st '+st[0]+'">'+st[1]+'</span></div>'
   +(st[1]==='Encerrado'||l.start>now?'':'<div class="lc-bar" role="img" aria-label="Mês '+cur+' de '+n+'"><span style="width:'+pct+'%"></span></div><small class="lc-bar-l">Mês '+cur+' de '+n+'</small>')
   +'<dl>'+rows.map(([k,v])=>'<div><dt>'+k+'</dt><dd>'+v+'</dd></div>').join('')+'</dl>'
   +(mc?'<p class="lc-month '+mc[0]+'"><span>'+monthName(month).replace(/^./,c=>c.toUpperCase())+'</span>'+mc[1]+'</p>':'')
   +'</article>'}).join('')+'</div>';
}
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
 if(type==='property'){title='Novo imóvel';fields=propertyForm()}
 if(type==='person'){title='Novo locatário';fields=tenantForm()}
 if(type==='lease'){if(!db.people.length||!db.properties.length)return toast('Cadastre pelo menos um imóvel e um locatário.');title='Novo contrato';fields=leaseForm()}
 if(type==='expense'){title='Lançar despesa';fields=input('Descrição','name')+amount()+input('Data do pagamento','date','date','value="'+today()+'" max="'+today()+'"')}
 if(type==='job'){if(!db.properties.length)return toast('Cadastre um imóvel para agendar o serviço.');title='Agendar manutenção';fields=select('Imóvel','property',db.properties)+input('Serviço','name')+input('Data agendada','date','date')}
 if(type==='finish'){title='Concluir manutenção';fields='<p>'+enc(db.jobs.find(j=>j.id===id).name)+'</p><label>Custo pago (R$)<input required name="amount" type="number" step=".01" min="0" max="999999999" value="0"></label>'+input('Data de conclusão','date','date','max="'+today()+'" value="'+today()+'"')}
 if(type==='pay'){const c=charges(db,month).find(x=>x.key===id);if(!c||c.paid)return;title='Registrar pagamento';fields='<p>'+enc(c.person.name)+' · '+enc(c.property.name)+'<br><strong>'+money(c.amount)+'</strong></p>'+input('Data do recebimento','date','date','value="'+today()+'" max="'+today()+'"')}
 $('#formTitle').textContent=title;$('#fields').innerHTML=fields;$('#error').textContent='';const wide=type==='property'||type==='person'||type==='lease';$('#form > .primary').hidden=type==='account'&&!!auth||wide;$('#form').noValidate=wide;$('dialog').classList.toggle('dlg-wide',wide);$('#form > .primary').textContent=type==='account'?'Entrar':'Salvar';if(!$('dialog').open)$('dialog').showModal();if(wide)pfGo(0);if(type==='lease')lfRefresh();
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
$('#form').onsubmit=async e=>{e.preventDefault();if(busy)return;if(action==='property'||action==='person'||action==='lease'){if(pfStep<pfMax){if(pfCheck(pfStep))pfGo(pfStep+1);return}for(let i=0;i<=pfMax;i++)if(!pfCheck(i))return}busy=true;$('#form .primary').disabled=true;const f=Object.fromEntries(new FormData(e.target)),[type,id]=action.split('|');try{
 if(type==='account'){if(!auth)await login(f.email.trim(),f.password);$('#fields').querySelector('[name=password]')?.remove();await showTenants();return}
 if(type==='tenant'){await activate(tenants.find(m=>m.tenant_id===f.tenant));return}
 if(type==='property'){const p=pfData(new FormData(e.target));
  if(wallet==='cloud'){const r=await writeOnline(tenantId,type,id,p,db,month);$('dialog').close();try{await refreshOnline();toast(r?.warn||'Imóvel salvo no Supabase.')}catch{toast('Salvo no Supabase. Clique em Atualizar para recarregar.')}return}
  db.properties.push({...p,id:crypto.randomUUID()});save();$('dialog').close();render();toast('Imóvel cadastrado.');return}
 if(type==='lease'){const p=lfData(new FormData(e.target));
  if(wallet==='cloud'){await writeOnline(tenantId,type,id,p,db,month);$('dialog').close();try{await refreshOnline();toast('Contrato salvo no Supabase.')}catch{toast('Salvo no Supabase. Clique em Atualizar para recarregar.')}return}
  if(p.end<p.start)throw Error('O término deve ser igual ou posterior ao início.');if(db.leases.some(l=>l.property===p.property&&l.start<=p.end&&l.end>=p.start))throw Error('Este imóvel já tem contrato nesse período.');
  const {unit,...row}=p;db.leases.push({...row,id:crypto.randomUUID()});save();$('dialog').close();render();toast('Contrato cadastrado.');return}
 if(type==='person'){const p=tfData(new FormData(e.target));
  if(wallet==='cloud'){await writeOnline(tenantId,type,id,p,db,month);$('dialog').close();try{await refreshOnline();toast('Locatário salvo no Supabase.')}catch{toast('Salvo no Supabase. Clique em Atualizar para recarregar.')}return}
  db.people.push({...p,id:crypto.randomUUID()});save();$('dialog').close();render();toast('Locatário cadastrado.');return}
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
 }catch(err){read();render();$('#error').textContent=err.name==='QuotaExceededError'?'Não há espaço no navegador para guardar a foto. Tente uma foto menor ou salve sem foto.':err.message}finally{busy=false;$('#form .primary').disabled=false}};
function exportFinance(){const moves=[...db.payments.map(p=>({...p,name:pname(db.leases.find(l=>l.id===p.key.split('/')[0])?.property),type:'Aluguel'})),...db.expenses.map(e=>({...e,amount:-e.amount,type:'Despesa'}))].filter(x=>x.date.startsWith(month)).sort((a,b)=>a.date.localeCompare(b.date));const csv=['Data,Descrição,Tipo,Valor (centavos)',...moves.map(x=>[x.date,'"'+String(x.name||'').replaceAll('"','""')+'"',x.type,x.amount].join(','))].join('\n');const link=document.createElement('a');link.href=URL.createObjectURL(new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'}));link.download='alugafacil-financeiro-'+month+'.csv';link.click();URL.revokeObjectURL(link.href);toast('Arquivo CSV preparado.')}
document.addEventListener('click',e=>{const b=e.target.closest('[data-act]');if(b?.dataset.act==='exportFinance')exportFinance();else if(b)open(b.dataset.act)});
document.addEventListener('change',e=>{if(e.target.id==='month'&&/^\d{4}-\d{2}$/.test(e.target.value)){month=e.target.value;render()}if(e.target.id==='filter'){filter=e.target.value;render()}});
$('#wallet').onchange=e=>walletChange(e.target.value);$('#switch').onclick=()=>open('wallet');$('#close').onclick=()=>$('dialog').close();addEventListener('hashchange',render);addEventListener('storage',e=>{if(wallet!=='cloud'&&e.key===key()&&!$('dialog').open){read();render()}});read();render();

