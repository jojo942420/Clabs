// Explicit save/approve actions share the existing validated submission path.
const simpleApprovalResultForm=resultForm;
resultForm=function(id){
 simpleApprovalResultForm(id);
 const order=db.orders.find(o=>o.id===id),form=document.getElementById('form');
 if(!order||order.reviewed||!document.getElementById('modal').open)return;
 const action=form.querySelector('[name="action"]'),footer=form.querySelector('.modalfoot');
 if(!action||!footer)return;
 action.closest('label').hidden=true;
 action.value='Draft';
 const review=form.querySelector('#releaseReview');
 if(review&&!can(currentUser,'review'))review.hidden=true;
 const signature=form.querySelector('#signaturePad')?.closest('section');
 if(signature){const details=document.createElement('details');details.className=signature.className;const summary=document.createElement('summary');summary.textContent='Reviewer signature (optional)';details.append(summary);signature.querySelector('h3')?.remove();while(signature.firstChild)details.append(signature.firstChild);signature.replaceWith(details);}
 footer.querySelectorAll('button:not([type="button"])').forEach(button=>button.remove());
 const draft=document.createElement('button');draft.type='button';draft.className='btn';draft.textContent='Save draft';draft.id='saveResultDraft';footer.append(draft);
 const verified=form.querySelector('[name="verify_release"]'),evidence=form.querySelector('[name="reviewEvidence"]');
 function submitAs(value){
  if(form.dataset.submitting==='true')return;
  action.value=value;
  if(verified)verified.required=value==='Reviewed';
  if(evidence)evidence.required=value==='Reviewed';
  form.requestSubmit();
 }
 draft.onclick=()=>submitAs('Draft');
 if(can(currentUser,'review')&&[...action.options].some(o=>o.value==='Reviewed')){const approve=document.createElement('button');approve.type='button';approve.className='btn primary';approve.textContent='Approve result';approve.id='approveResult';approve.onclick=()=>submitAs('Reviewed');footer.append(approve);}
 const submit=form.onsubmit;
 form.onsubmit=async event=>{
  event.preventDefault();
  if(action.value==='Reviewed'&&(!can(currentUser,'review')||!form.checkValidity())){form.reportValidity();return false;}
  return submit(event);
 };
};
