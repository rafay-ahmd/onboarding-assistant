export const accessStatuses = ['not-requested', 'requested', 'granted', 'verified', 'blocked'];
export const checkStatuses = ['ready', 'missing', 'blocked', 'unverified'];
export function draftRequest(item, hire) {
  const missing = ['name', 'email', ...item.fields].filter(key => !String(hire[key] || '').trim());
  if (missing.length) return { missing, text: '' };
  const text = `Hi helpdesk, could you please provide ${item.name} for ${hire.name} (${hire.email}), joining as a Dealertrack software developer${hire.startDate ? ` on ${hire.startDate}` : ''}?\n\n${item.reason}${item.id === 'aws' ? `\nRequested Okta group: ${hire.awsGroup}` : ''}${item.id === 'github' ? `\nGitHub username: ${hire.githubUsername}` : ''}${hire.manager ? `\nManager: ${hire.manager}` : ''}\n\nPlease confirm any required approval.`;
  return { missing: [], text };
}
export function dependencyStatus(step, access, completedSteps) {
  return step.dependsOn.filter(id => access[id]?.status !== 'verified' && !completedSteps.includes(id));
}
export function reconcileCompletions(profile, access, completedSteps) {
  let valid = [...completedSteps];
  let next = valid.filter(id => {
    const step = profile.steps.find(s => s.id === id);
    return step && !dependencyStatus(step, access, valid).length;
  });
  while (next.length !== valid.length) {
    valid = next;
    next = valid.filter(id => !dependencyStatus(profile.steps.find(s => s.id === id), access, valid).length);
  }
  return next;
}
export function validateReport(report) {
  if (!report || report.schemaVersion !== 1 || report.profileId !== 'dealertrack-developer' || report.mode !== 'read-only' || !Array.isArray(report.checks) || report.checks.length === 0 || report.checks.length > 200 || !Number.isFinite(Date.parse(report.generatedAt))) throw new Error('Unsupported or incomplete readiness report. Use the supplied checker or a demo report.');
  const ids = new Set();
  for (const c of report.checks) {
    if (!c || !checkStatuses.includes(c.status) || typeof c.id !== 'string' || !c.id || ids.has(c.id) || typeof c.name !== 'string' || typeof c.detail !== 'string' || c.name.length > 300 || c.detail.length > 3000) throw new Error('Invalid or duplicate check in report.');
    ids.add(c.id);
  }
  return report;
}
export function validateTicketUrl(value) {
  if (!value.trim()) return '';
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.hostname !== 'go.helpdesk.autoscout24.com' || url.username || url.password || !url.pathname.startsWith('/servicedesk/customer/')) throw new Error('Use an HTTPS ticket link from go.helpdesk.autoscout24.com.');
  url.search = ''; url.hash = '';
  return url.href;
}
export function normalizeState(state, profile) {
  const clean = { hire: {}, access: {}, completedSteps: [] };
  for (const key of ['name','email','startDate','manager','githubUsername','awsGroup']) clean.hire[key] = typeof state?.hire?.[key] === 'string' ? state.hire[key].slice(0,300) : '';
  for (const item of profile.access) {
    const saved = state?.access?.[item.id];
    let ticket = '';
    try { ticket = validateTicketUrl(typeof saved?.ticket === 'string' ? saved.ticket : ''); } catch {}
    clean.access[item.id] = { status: accessStatuses.includes(saved?.status) ? saved.status : 'not-requested', ticket };
  }
  clean.completedSteps = profile.steps.filter(s => state?.completedSteps?.includes(s.id)).map(s => s.id);
  clean.completedSteps = reconcileCompletions(profile, clean.access, clean.completedSteps);
  return clean;
}

// A linked Slack request takes precedence over a manual record for that entitlement.
export function accessProgress(profile,access,requests=[]){
 const total=profile.access.length;
 const verified=profile.access.filter(item=>{const r=requests.find(x=>x.profileId===profile.id&&x.accessId===item.id);return r?r.status==='verified':access[item.id]?.status==='verified';}).length;
 return {verified,total,percent:total?Math.round(verified/total*100):0};
}
