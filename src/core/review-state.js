import { hash, contentHash } from './hash.js';
import { QUALITY_PROFILE } from './schema.js';

// The walkthrough cannot include its own digest in the material it describes.
export function walkthroughHash(snapshot) {
  const { walkthrough, ...discovery } = snapshot.discovery;
  return hash({ name: snapshot.name, mode: snapshot.mode, xml: snapshot.xml, discovery });
}
export const currentWalkthrough = snapshot => {
  const walkthrough = snapshot.discovery.walkthrough;
  return walkthrough?.basisHash === walkthroughHash(snapshot) ? walkthrough : null;
};
export const currentReview = (snapshot, review) => review?.contentHash === contentHash(snapshot) && review.profile === QUALITY_PROFILE ? review : null;
