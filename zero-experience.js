// Fail-closed evidence gate for jobs requiring zero prior experience.
// This is not a substitute for checking the original employer posting.
export function zeroExperienceEvidence(job) {
  const evidence=String(job.zeroExperienceEvidence||"").trim();
  const url=String(job.zeroExperienceSourceUrl||"").trim();
  if(!evidence||!/^https:\/\//i.test(url))return false;
  const explicit=/\b(no (?:prior |previous |professional |relevant |work )?experience (?:is )?(?:required|necessary|needed)|no experience needed|no experience necessary|without (?:any |prior |previous )?experience|no previous work experience|no prior work experience|experience (?:is )?not required|previous experience (?:is )?not required|(?:zero|0) (?:years? of )?experience required)\b/i.test(evidence);
  const contradictory=/\b(?:[1-9]\d*\+?\s*(?:years?|yrs?)|minimum (?:of )?(?:one|two|three|four|five) years?)\b/i.test(evidence);
  return explicit&&!contradictory;
}
