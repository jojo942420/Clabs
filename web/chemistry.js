// Pure calculations; no diagnostic classifications or reference intervals.
function chemistryDerived(values, age, sex, egfrEligible=false) {
 const out={};
 const n=(name,unit)=>{const r=values[name];if(!r||r.unit!==unit||r.state!=='Result'||!/^\d+(\.\d+)?$/.test(String(r.value)))return null;const v=Number(r.value);return Number.isFinite(v)?v:null};
 const put=(name,value,unit,formula)=>{if(Number.isFinite(value)&&value>=0)out[name]={value:value.toFixed(2),unit,formula}};
 const tc=n('Total cholesterol','mmol/L'),hdl=n('HDL cholesterol','mmol/L'),tg=n('Triglycerides','mmol/L');
 if(tc!==null&&hdl!==null&&tc>=hdl){put('Non-HDL cholesterol',tc-hdl,'mmol/L','Total cholesterol − HDL cholesterol');if(hdl>0)put('C risk (TC/HDL ratio)',tc/hdl,'ratio','Total cholesterol ÷ HDL cholesterol; not a 10-year cardiovascular risk score');if(tg!==null&&tg<4.5){put('LDL cholesterol (calculated)',tc-hdl-tg/2.2,'mmol/L','Friedewald: TC − HDL − TG/2.2; TG <4.5 mmol/L');put('VLDL cholesterol (estimated)',tg/2.2,'mmol/L','TG/2.2; Friedewald estimate')}}
 const tp=n('Total protein','g/L'),alb=n('Albumin','g/L');
 if(tp!==null&&alb!==null&&tp>=alb){put('Globulin',tp-alb,'g/L','Total protein − albumin');if(tp>alb)put('Albumin/globulin ratio',alb/(tp-alb),'ratio','Albumin ÷ (total protein − albumin)')}
 const tb=n('Total bilirubin','µmol/L'),dbil=n('Direct bilirubin','µmol/L');if(tb!==null&&dbil!==null&&tb>=dbil)put('Indirect bilirubin',tb-dbil,'µmol/L','Total bilirubin − direct bilirubin');
 const na=n('Sodium','mmol/L'),cl=n('Chloride','mmol/L'),hc=n('Bicarbonate','mmol/L');if(na!==null&&cl!==null&&hc!==null)put('Anion gap (without potassium)',na-cl-hc,'mmol/L','Na − (Cl + bicarbonate); excludes potassium');
 const cr=n('Creatinine','µmol/L');if(egfrEligible&&cr>0&&Number.isInteger(age)&&age>=18&&['Male','Female'].includes(sex)){const female=sex==='Female',scr=cr/88.4,k=female?0.7:0.9,a=female?-0.241:-0.302;put('eGFR (CKD-EPI 2021)',142*Math.min(scr/k,1)**a*Math.max(scr/k,1)**-1.2*0.9938**age*(female?1.012:1),'mL/min/1.73 m²','CKD-EPI 2021 creatinine, race-free; age '+age+', '+sex+', creatinine '+cr+' µmol/L')}
 return out;
}
