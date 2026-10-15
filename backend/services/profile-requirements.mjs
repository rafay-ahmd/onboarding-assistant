import dealertrack from '../../profiles/dealertrack-developer.json' with {type:'json'};
import cms from '../../profiles/cms-developer.json' with {type:'json'};

// Fixed recipe IDs only: a similarly named managed profile must not inherit a
// different team's guide. This is the same static catalogue served to the planner.
const recipes=new Map([dealertrack,cms].map(recipe=>[recipe.id,recipe]));

export function profileRequirements(hire) {
  const recipe=recipes.get(hire.profileId);
  return {
    hire:{id:hire.id,name:hire.name,managerId:hire.managerId,location:hire.location,
      profileId:hire.profileId,profileName:hire.profileName},
    assignedRequirements:{
      basis:'Requirements snapshotted when this onboarding plan was created; not proof of granted or verified access.',
      profileRevision:hire.profileRevision,profileGroups:hire.profileGroups,
      locationRevision:hire.locationRevision,locationGroups:hire.locationGroups,
      requestedGroups:hire.requestedGroups,adminRequired:hire.adminRequired
    },
    recipeAvailable:!!recipe,
    guidance:recipe?structuredClone(recipe):null,
    guidanceNotice:recipe
      ?'The recipe is reference guidance, with its own review status and sources. Access candidates and programme checklists are not automatically assigned to this hire. Confirm applicability and open questions with the manager/subteam.'
      :'No onboarding recipe is mapped to this managed profile. Ask the manager to agree its setup guidance; do not substitute another team’s recipe.',
    realReadiness:'Not assessed by this requirements view'
  };
}
