let preparedResultEmail=null;
async function emailResult(id){
 if(!permitted('emailResults'))return notify('Ask the administrator for result email permission.');
 if(unsaved)return notify('Save or reload before preparing a result email.');
 if(!navigator.onLine)return notify('Reconnect to verify the current validated report before emailing.');
 const o=db.orders.find(o=>o.id===id);if(!o?.reviewed)return notify('Validate the result before emailing it.');
 preparedResultEmail=null;
 modal('Email validated result', '<p class="help full">'+esc(patient(o.patient)?.name)+' · '+esc(o.test)+' · '+esc(displayNumber(o))+'</p>'+field('recipient','Recipient email address','email',true,'')+'<label class="full" style="display:flex;gap:10px;align-items:center"><input style="width:18px" type="checkbox" name="confirmed" required>I have verified this recipient is authorized to receive this patient’s report.</label><p class="help full">Prepare a draft, then review and send it in your email application. The website does not send email directly.</p>',async v=>{try{preparedResultEmail=await api('/api/results/email-draft','POST',{orderId:id,recipient:v.recipient,revision:serverRevision});const f=document.getElementById('form');f.innerHTML='<div class="fields"><p class="full"><b>To:</b> '+esc(preparedResultEmail.recipient)+'<br><b>Subject:</b> '+esc(preparedResultEmail.subject)+'</p><p class="help full">Open the downloaded .eml draft in your email app, review, and send. Attach uploaded scans separately if needed.</p><div class="full">'+btn('Download email with report','downloadResultEmail()',true)+' '+btn('Download report','downloadEmailReport()')+'</div><p class="help full">On a phone, download the report first, then open your email app and attach the downloaded report manually.</p><div class="full">'+btn('Open email app','openResultEmailApp()')+'</div></div><div class="modalfoot"><button class="btn" type="button" onclick="closeModal()">Done</button></div>';f.onsubmit=e=>e.preventDefault();return false}catch(e){notify(e.message);return false}},'Prepare email');
}
function downloadResultEmail(){if(preparedResultEmail)download('CLabs-'+preparedResultEmail.accession+'.eml',preparedResultEmail.eml,'message/rfc822')}
function downloadEmailReport(){if(preparedResultEmail)download('CLabs-'+preparedResultEmail.accession+'.html',preparedResultEmail.html,'text/html')}
function openResultEmailApp(){if(!preparedResultEmail)return;const d=preparedResultEmail;location.href='mailto:'+encodeURIComponent(d.recipient)+'?subject='+encodeURIComponent(d.subject)+'&body='+encodeURIComponent(d.message);notify('Attach the downloaded report before sending. No email has been sent by the website.');}
const emailShowReport=showReport;
showReport=function(id){emailShowReport(id);const o=db.orders.find(o=>o.id===id);if(o?.reviewed&&permitted('emailResults'))document.querySelector('#app .pagehead')?.insertAdjacentHTML('beforeend',btn('Email result',"emailResult('"+o.id+"')"));};
const emailListContent=listContent;
listContent=function(){let content=emailListContent();if(['Results','Reports'].includes(page)&&permitted('emailResults'))content=content.replace(/(<button[^>]*onclick="showReport\('([^']+)'\)"[^>]*>[\s\S]*?<\/button>)/g,(button,id)=>button+' '+btn('Email',"emailResult('"+id+"')"));return content};
actionPermissions.emailResult='emailResults';
const emailSignOut=manualSignOut;
manualSignOut=function(){preparedResultEmail=null;return emailSignOut()};
