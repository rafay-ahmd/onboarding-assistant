// Explicit demo binding, never inferred from an email or a displayed name.
// These are account identifiers, not credentials. Tokens remain in server environment.
export const rafaySlackIdentity={teamId:'TT299RP8X',userId:'U0BUMD5CNP9'};
export function seedSlackDemoAccount(store,platform){
 const seeded=platform.create('em-vibgy','seed-slack-rafay-v1',{
  firstName:'Rafay',lastName:'Ahmed',email:'rafay.ahmed@trader.ca',startDate:'2026-11-02',location:'Toronto',profileId:'dealertrack-developer',requestedGroups:['DEMO-TORONTO-DEVELOPERS'],adminRequired:true
 });
 store.transaction(()=>{const hire=store.get('hires',seeded.id);store.put('hires',{...hire,slackIdentity:{...rafaySlackIdentity}});});
 return seeded.id;
}
