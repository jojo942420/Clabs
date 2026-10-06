// Calendar age in GMT. Reports use the specimen/order date, preserving historical age.
export function patientAge(dob,at=new Date().toISOString()){
 const parse=value=>{
  const match=typeof value==='string'&&value.match(/^(\d{4})-(\d{2})-(\d{2})(?:$|T| )/);
  if(!match)return null;
  const [year,month,day]=match.slice(1).map(Number),date=new Date(0);
  date.setUTCFullYear(year,month-1,day);date.setUTCHours(0,0,0,0);
  return date.getUTCFullYear()===year&&date.getUTCMonth()===month-1&&date.getUTCDate()===day?date:null;
 };
 const birth=parse(dob),date=parse(at);
 if(!birth||!date||birth>date)return 'Not recorded';
 const years=date.getUTCFullYear()-birth.getUTCFullYear();
 const months=years*12+date.getUTCMonth()-birth.getUTCMonth()-(date.getUTCDate()<birth.getUTCDate()?1:0);
 const unit=(n,label)=>n+' '+label+(n===1?'':'s');
 if(months>=24)return unit(Math.floor(months/12),'year');
 if(months>=1)return unit(months,'month');
 return unit(Math.round((date-birth)/86400000),'day');
}
