export const blank=()=>({properties:[],people:[],leases:[],payments:[],jobs:[],expenses:[]});
export const today=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(new Date());
export const current=()=>today().slice(0,7);
export function shift(month,n){const [y,m]=month.split('-').map(Number);const d=new Date(Date.UTC(y,m-1+n,1));return d.toISOString().slice(0,7)}
export function charges(db,month){
 return db.leases.flatMap(l=>{
  const [year,m]=month.split('-').map(Number);
  const due=month+'-'+String(Math.min(l.day,new Date(Date.UTC(year,m,0)).getUTCDate())).padStart(2,'0');
  if(due<l.start||due>l.end)return [];
  const key=l.id+'/'+month, paid=db.payments.find(p=>p.key===key);
  return [{...l,key,due,paid,status:paid?'Pago':due<today()?'Em atraso':'A vencer',property:db.properties.find(p=>p.id===l.property),person:db.people.find(p=>p.id===l.person)}];
 }).sort((a,b)=>a.due.localeCompare(b.due));
}
export function cash(db,month){
 const sum=xs=>xs.reduce((v,x)=>v+x.amount,0);
 return {income:sum(db.payments.filter(p=>p.date.startsWith(month))),cost:sum(db.expenses.filter(e=>e.date.startsWith(month)))};
}
export function demo(){
 const db=blank(), m=current();
 const places=[['Residencial Aurora · 204','Apartamento','Av. das Palmeiras, 120',185000],['Casa Jardim das Flores','Casa','Rua das Flores, 42',240000],['Galpão Horizonte','Galpão','Rua Industrial, 610',360000],['Edifício Atlântico · 301','Apartamento','Av. Beira-Mar, 85',210000]];
 const people=['Ana Martins','Carlos Almeida','Marina Costa','Rafael Lima'];
 places.forEach(([name,type,address,amount],i)=>{
 const x=[{purpose:'Residencial',area:68,bedrooms:2,bathrooms:1,parking:1,district:'Centro'},{purpose:'Residencial',area:120,bedrooms:3,bathrooms:2,parking:2,district:'Jardim das Flores'},{purpose:'Comercial',area:850,bathrooms:2,parking:4,district:'Distrito Industrial'},{purpose:'Residencial',area:74,bedrooms:2,bathrooms:2,parking:1,furnished:true,district:'Beira-Mar'}][i];
 db.properties.push({id:'im'+i,name,type,address:address+' – '+x.district+', Cidade Exemplo/SP',rent:amount,...x});db.people.push({id:'pe'+i,name:people[i],phone:''});
 db.leases.push({id:'ct'+i,property:'im'+i,person:'pe'+i,start:shift(m,-5)+'-01',end:shift(m,6)+'-28',amount,day:[5,10,20,28][i]});
 for(let n=-5;n<=0;n++){const period=shift(m,n),date=period+'-'+String([5,10,20,28][i]).padStart(2,'0');if(n<0||i===0&&date<=today())db.payments.push({key:'ct'+i+'/'+period,date,amount})}
 });
 db.jobs.push({id:'mt1',property:'im1',name:'Revisão da caixa-d’água',date:m+'-26',done:false});
 for(let n=-5;n<=0;n++)db.expenses.push({id:'de'+n,name:'Conservação dos imóveis',amount:42000+Math.abs(n)*3200,date:shift(m,n)+'-01'});
 return db;
}
