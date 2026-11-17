import { zeroExperienceEvidence } from "./zero-experience.js";

// Executor boundary: no generic URL POSTs, LinkedIn/Indeed bots, or fabricated confirmations.
// A future provider adapter must use a documented, authorized application endpoint,
// securely configured credentials, and return a verifiable external reference.
export async function assessApplication(job, evidence, profile, policy) {
  const reasons=[];
  if(!policy||policy.enabled!==1)reasons.push("Automatic submission disabled");
  if(!Number.isInteger(job?.match_score)||job.match_score<Math.max(85,Number(policy?.min_match_score||85)))reasons.push("Match score below threshold");
  if(!zeroExperienceEvidence({zeroExperienceEvidence:evidence?.evidence,zeroExperienceSourceUrl:evidence?.source_url}))reasons.push("Explicit zero-experience requirement not verified");
  if(!/confirmed open|accepting applications/i.test(job?.verification_status||""))reasons.push("Employer is not confirmed to be accepting applications");
  if(!/english/i.test(job?.language_evidence||"")||/not confirmed|unclear|verify/i.test(job?.language_evidence||""))reasons.push("English-only requirement not verified");
  if(!job?.eligibility_evidence||/not confirmed|unclear|verify|potential gap/i.test(job.eligibility_evidence))reasons.push("Candidate eligibility not confirmed");
  if(!profile||!profile.firstName||!profile.lastName||!profile.email||!profile.cv)reasons.push("Complete application identity and CV are missing from private profile");
  if(!/israel|tel aviv|herzliya|raanana|ra'anana|ramat gan|petah tikva|jerusalem|haifa|beer sheva/i.test(job?.location||"")&&!/israel.*eligible|eligible.*israel/i.test(job?.eligibility_evidence||""))reasons.push("Israel work eligibility not confirmed");
  return {eligible:reasons.length===0,reasons};
}

export async function executeApplication() {
  // No employer-authorized adapter or credential has been configured.
  // Fail closed, without attempting to contact the employer.
  return {submitted:false,status:"Blocked",reason:"No permitted employer application adapter and credentials configured"};
}
