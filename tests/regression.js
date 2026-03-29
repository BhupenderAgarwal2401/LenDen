/* LenDen dev regression tests */
'use strict';

function testAssert(cond, msg){
  if(!cond) throw new Error(msg);
}

function backupKeys(keys){
  const state={};
  keys.forEach(k=>{ state[k]=localStorage.getItem(k); });
  return state;
}

function restoreKeys(state){
  Object.keys(state).forEach(k=>{
    if(state[k]===null) localStorage.removeItem(k);
    else localStorage.setItem(k, state[k]);
  });
}

function renderLines(target, title, lines, isError){
  const text=[title].concat(lines.map(l=>`- ${l}`)).join('\n');
  target.textContent=text;
  target.className = isError ? 'card bad' : 'card ok';
}

async function runRegressionTests(){
  const out=document.getElementById('results');
  const lines=[];
  const managedKeys=[
    'ld2_people','ld2_cards','ld2_txns','ld2_payments','ld2_emi_schedules','ld2_borrows','ld2_bpayments','ld2_pin','ld2_settings','ld2_refunds','ld2_report_views',
    'ld_people','ld_txns','lenden_data',
    'ld2_app_version','ld2_upgrade_snapshot_latest'
  ];
  const snapshot=backupKeys(managedKeys);
  try{
    localStorage.setItem('ld2_txns', JSON.stringify([{id:'t1',type:'given',chargedAmount:100,settlementAmount:100,screenshots:[{data:'data:image/png;base64,abc',name:'x.png'}]}]));
    const withImages=buildBackupData(true);
    testAssert(withImages.includesImages===true, 'Expected includesImages=true');
    testAssert(Array.isArray(withImages.transactions[0].screenshots), 'Expected screenshots in image backup');
    lines.push('Backup with images keeps attachments');

    localStorage.removeItem('ld2_people');
    localStorage.setItem('ld_people', JSON.stringify([{id:'p1',name:'Legacy Person'}]));
    runStorageUpgradeMigrations();
    const migratedPeople = JSON.parse(localStorage.getItem('ld2_people') || '[]');
    testAssert(migratedPeople.length===1 && migratedPeople[0].name==='Legacy Person', 'Legacy migration failed');
    lines.push('Legacy storage migration works');

    localStorage.setItem('ld2_app_version', JSON.stringify('4.1.0'));
    ensureUpgradeSafetySnapshot();
    const upSnap = JSON.parse(localStorage.getItem('ld2_upgrade_snapshot_latest') || 'null');
    testAssert(!!upSnap && !!upSnap.data, 'Upgrade snapshot missing');
    lines.push('Upgrade safety snapshot created');

    const zone=document.createElement('div');
    zone.id='test-ss-zone';
    document.body.appendChild(zone);
    setUploadList('test-ss-zone', []);
    renderSSZone('test-ss-zone');
    const html=zone.innerHTML.toLowerCase();
    testAssert(html.includes('take photo') && html.includes('upload from gallery'), 'Camera/gallery choices missing');
    zone.remove();
    lines.push('Attachment zone has camera and gallery options');

    const emiPlan=computeEmiPlan({
      principal:12000,
      annualRatePct:12,
      tenureValue:6,
      tenureUnit:'months',
      startDate:'2026-01-10',
      processingFee:300,
      processingFeeGstPct:18,
      interestGstPct:18
    });
    testAssert(emiPlan.schedule.length===6, 'EMI schedule installments count mismatch');
    testAssert(emiPlan.schedule[0].expectedAmount>emiPlan.schedule[1].expectedAmount, 'First EMI should include one-time fee + GST');
    testAssert(emiPlan.endDate==='2026-06-10', 'EMI end date should match tenure');
    lines.push('EMI plan calculation covers first-installment charges');

    const txnId='emi-txn-1';
    const txns=[{id:txnId,personId:'p1',type:'given',chargedAmount:12000,settlementAmount:emiPlan.overallTotal,isEmi:true,status:'pending',date:'2026-01-10'}];
    DB.transactions=txns;
    DB.payments=[];
    DB.emiSchedules=buildEmiScheduleEntries(txnId,emiPlan);
    testAssert(getTxnPaid(txnId)===0, 'Scheduled EMI entries must not auto-settle');
    testAssert(getTxnBalance(txns[0])===emiPlan.overallTotal, 'Balance should remain full before EMI confirmation');
    const schedules=DB.emiSchedules.slice();
    const first=schedules[0];
    schedules[0]={...first,settled:true,receivedAmount:first.expectedAmount,receivedDate:'2026-01-10',paymentId:'pm-emi-1'};
    DB.emiSchedules=schedules;
    DB.payments=[{id:'pm-emi-1',txnId,amount:first.expectedAmount,date:'2026-01-10',mode:'UPI',notes:'EMI received',sourceEmiScheduleId:first.id}];
    updateTxnSettlementStatus(txnId);
    testAssert(getTxnPaid(txnId)===first.expectedAmount, 'Confirmed EMI amount should count as repayment');
    testAssert(getTxnBalance(DB.transactions[0])===Math.max(0,emiPlan.overallTotal-first.expectedAmount), 'Balance should reduce only after EMI confirmation');
    lines.push('EMI scheduled vs confirmed repayment behavior is correct');

    const editedTxn={...DB.transactions[0],emiTenureValue:8,emiTenureUnit:'months',emiAnnualRatePct:12};
    const rebuilt=rebuildPendingEmiScheduleForTxn(editedTxn);
    testAssert(rebuilt.ok===true, 'Pending EMI rebuild should succeed when tenure >= settled installments');
    const rebuiltSchedules=DB.emiSchedules.filter(s=>s.txnId===txnId);
    testAssert(rebuiltSchedules.length===8, 'Rebuilt schedule should match updated tenure');
    testAssert(rebuiltSchedules.filter(s=>s.settled).length===1, 'Settled EMI installments should be preserved after rebuild');
    lines.push('Pending EMI rebuild keeps settled entries and regenerates remaining');

    renderLines(out, 'All tests passed', lines, false);
  }catch(err){
    renderLines(out, `Test failed: ${err.message}`, lines, true);
  }finally{
    restoreKeys(snapshot);
  }
}
