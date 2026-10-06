// Three-way merge of independent workspace records. Conflicting edits stay on the device.
export function mergeWorkspace(base, local, remote) {
  const result = structuredClone(remote);
  const conflicts = [];
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  for (const field of ['patients', 'orders', 'qc', 'analyzers', 'customTests', 'prices', 'sales', 'ultrasoundReports']) {
    const before = new Map((base[field] || []).map(record => [record.id, record]));
    const edited = new Map((local[field] || []).map(record => [record.id, record]));
    const latest = new Map((remote[field] || []).map(record => [record.id, record]));
    for (const id of new Set([...before.keys(), ...edited.keys()])) {
      const oldValue = before.get(id), newValue = edited.get(id), serverValue = latest.get(id);
      if (same(oldValue, newValue)) continue;
      if (!same(serverValue, oldValue) && !same(serverValue, newValue)) {
        conflicts.push(`${field}: ${id}`);
        continue;
      }
      if (newValue === undefined) latest.delete(id);
      else latest.set(id, newValue);
    }
    result[field] = [...latest.values()];
  }
  result.testConfig = { ...remote.testConfig };
  for (const key of new Set([...Object.keys(base.testConfig || {}), ...Object.keys(local.testConfig || {})])) {
    const oldValue = base.testConfig?.[key], newValue = local.testConfig?.[key], serverValue = remote.testConfig?.[key];
    if (same(oldValue, newValue)) continue;
    if (!same(serverValue, oldValue) && !same(serverValue, newValue)) {
      conflicts.push(`testConfig: ${key}`);
      continue;
    }
    if (newValue === undefined) delete result.testConfig[key];
    else result.testConfig[key] = newValue;
  }
  const logs = [...(local.activity || []), ...(remote.activity || [])];
  result.activity = logs.filter((entry, index) => logs.findIndex(other => same(entry, other)) === index).slice(0, 20);
  return { data: result, conflicts };
}

export function changesReviewedResult(base, local) {
  const previous = new Map([...(base.orders||[]),...(base.ultrasoundReports||[])].map(order => [order.id, order]));
  if ([...previous.values()].some(order => order.reviewed && ![...(local.orders||[]),...(local.ultrasoundReports||[])].some(next => next.id === order.id))) return true;
  return [...(local.orders||[]),...(local.ultrasoundReports||[])].some(order => {
    const old = previous.get(order.id);
    return (order.reviewed || old?.reviewed) && JSON.stringify(order) !== JSON.stringify(old);
  });
}

// A staff member explicitly chooses a version for each conflicting record.
export function resolveWorkspaceConflicts(base,local,remote,choices){
 const merged=mergeWorkspace(base,local,remote);
 for(const conflict of merged.conflicts){
  if(!['local','shared'].includes(choices[conflict]))throw new Error('Choose a version for '+conflict);
  if(choices[conflict]==='shared')continue;
  const split=conflict.indexOf(': '),field=conflict.slice(0,split),id=conflict.slice(split+2);
  if(field==='testConfig'){if(Object.hasOwn(local.testConfig||{},id))merged.data.testConfig[id]=structuredClone(local.testConfig[id]);else delete merged.data.testConfig[id];}
  else{const value=(local[field]||[]).find(r=>r.id===id);merged.data[field]=merged.data[field].filter(r=>r.id!==id);if(value)merged.data[field].push(structuredClone(value));}
 }
 return merged.data;
}
