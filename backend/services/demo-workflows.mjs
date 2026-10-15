// TEMPORARY PLATFORM STUBS. Rafay owns replacement workflows/providers.
// No network, Slack submission, real Jira ticket or AD operation occurs here.
import { requireValue } from './errors.mjs';

export const demoWorkflows = {
  name: 'platform-stub',
  provision({ store, hire, request, event, now, id }) {
    for (const group of hire.requestedGroups) {
      const existing = store.list('assignments', { hireId: hire.id }).find(a => a.group === group);
      if (!existing) {
        const assignment = { id: id(), hireId: hire.id, group, provider: 'mock', implementation: 'platform-stub', status: 'pending', attempts: 0, error: null, updatedAt: now() };
        store.put('assignments', assignment);
        event('assignment-queued', assignment.id, { group });
      }
    }
    if (hire.adminRequired) request('admin', 'admin', { route: 'form', text: 'Mock admin request; dedicated form, outside Slack queue.' });
  },
  assignmentAction({ assignment, body }) {
    requireValue(['success', 'failure', 'retry'].includes(body.action), 400, 'INVALID_ACTION', 'Choose success, failure or retry.');
    const retry = body.action === 'retry';
    requireValue(retry ? assignment.status === 'failed' : assignment.status === 'pending', 409, 'INVALID_TRANSITION', 'Retry only failed assignments; resolve only pending assignments.');
    return { ...assignment, status: retry ? 'pending' : body.action === 'success' ? 'succeeded' : 'failed',
      attempts: assignment.attempts + (retry ? 0 : 1), error: body.action === 'failure' ? 'Simulated directory failure. Retry this group.' : null };
  },
  requestAction({ request, body }) {
    // The existing entitlement queue remains Rafay's domain; this stub handles account/admin only.
    const allowed = request.kind === 'account'
      ? { pending: { ticket: 'ticket-created' } }
      : { pending: { ticket: 'ticket-created' }, 'ticket-created': { grant: 'granted', deny: 'denied' }, granted: { verify: 'verified' } };
    const status = allowed[request.status]?.[body.action];
    requireValue(status, 409, 'INVALID_TRANSITION', 'This mock action is unavailable in the current request state.');
    return { ...request, status, attempts: request.attempts + (body.action === 'ticket' ? 1 : 0), ticket: body.action === 'ticket' ? { key: `DEMO-${request.id.slice(0, 8).toUpperCase()}`, provider: 'mock' } : request.ticket };
  }
};
