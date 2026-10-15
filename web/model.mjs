export const accessStatuses = ['not-requested', 'requested', 'granted', 'verified', 'blocked'];
export const checkStatuses = ['ready', 'missing', 'blocked', 'unverified'];
export function planStorageKey(profileId,hireId) {
  if(hireId)return 'dt-onboarding-hire-v1:'+hireId+(profileId==='dealertrack-developer'?'':':'+profileId);
  return profileId === 'dealertrack-developer' ? 'dt-onboarding-v1' : `onboarding-plan-${profileId}-v1`;
}
export function draftRequest(item, hire, profile = {}) {
  const missing = ['name', 'email', ...item.fields].filter(key => !String(hire[key] || '').trim());
  const repositoryGroup = String(hire.githubTeam || '').trim();
  if ([...item.fields,...(item.optionalFields || [])].includes('githubTeam') && repositoryGroup && (repositoryGroup === item.groupPrefix || /[*?]/.test(repositoryGroup))) missing.push('exact repository team / AD group (no wildcard or prefix-only value)');
  if (missing.length) return { missing, text: '' };
  const text = `Hi helpdesk, could you please provide ${item.name} for ${hire.name} (${hire.email}), joining as a ${profile.roleLabel || 'Dealertrack software developer'}${hire.startDate ? ` on ${hire.startDate}` : ''}?\n\n${item.reason}${item.destination ? `\nRequest destination: ${item.destination}` : ''}${item.group ? `\nRequested group: ${item.group}` : ''}${item.id === 'aws' ? `\nRequested Okta group: ${hire.awsGroup}` : ''}${item.fields.includes('githubUsername') ? `\nGitHub username: ${hire.githubUsername}` : ''}${item.fields.includes('githubRepository') ? `\nRequested repository and permission: ${hire.githubRepository}` : ''}${[...item.fields,...(item.optionalFields || [])].includes('githubTeam') && repositoryGroup ? `\nRequested repository group: ${repositoryGroup}` : ''}${item.optionalFields?.includes('githubMirrorUser') && hire.githubMirrorUser ? `\nExample GitHub user with required access: ${hire.githubMirrorUser}` : ''}${hire.subteam ? `\nSubteam: ${hire.subteam}` : ''}${hire.manager ? `\nManager: ${hire.manager}` : ''}\n\nPlease confirm any required approval.`;
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
export function validateReport(report, profileId = 'dealertrack-developer') {
  if (profileId !== 'dealertrack-developer') throw new Error('No inventory checker is available for this profile. Dealertrack reports cannot verify CMS readiness.');
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
  if (url.protocol !== 'https:' || !['go.helpdesk.autoscout24.com','autoscout24.atlassian.net'].includes(url.hostname) || url.username || url.password || !url.pathname.startsWith('/servicedesk/customer/')) throw new Error('Use an HTTPS ticket link from go.helpdesk.autoscout24.com or autoscout24.atlassian.net.');
  url.search = ''; url.hash = '';
  return url.href;
}
export function normalizeState(state, profile) {
  const clean = { hire: {}, access: {}, completedSteps: [] };
  for (const key of ['name','email','startDate','manager','githubUsername','githubTeam','githubRepository','githubMirrorUser','subteam','awsGroup']) clean.hire[key] = typeof state?.hire?.[key] === 'string' ? state.hire[key].slice(0,300) : '';
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

// A hire selects its recipe through its saved profile, not a mutable URL parameter.
export function resolvePlannerProfile(catalog,requestedProfile,hireProfileId){
 const id=hireProfileId||requestedProfile||'dealertrack-developer';
 if(!catalog.some(p=>p.id===id))throw Error(hireProfileId?'This managed profile has no workstation/access template mapped yet. Return to the dashboard.':'Unknown onboarding profile.');
 return id;
}
