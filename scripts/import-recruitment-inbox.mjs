// Convert reviewed public vacancy records to safely quoted D1 SQL.
// No personal profile, passwords or application materials belong in the feed.
import { readFileSync, writeFileSync } from "node:fs";
import { zeroExperienceEvidence } from "../zero-experience.js";
import { readdirSync, existsSync } from "node:fs";
const quote = v => "'" + String(v ?? "").replaceAll("'", "''") + "'";
const clean = (v,n) => typeof v === "string" ? v.trim().slice(0,n) : "";
const dir="recruitment-inbox";
const files=(existsSync(dir)?readdirSync(dir):[]).filter(f=>/^jobs-[0-9]{4}-[0-9]{2}-[0-9]{2}(?:-[a-z0-9-]+)?\.json$/.test(f)).sort();
const statements=[];
let total=0,excluded=0;
for(const file of files){
  const batch=JSON.parse(readFileSync(dir+"/"+file,"utf8"));
  if(!Array.isArray(batch.jobs)||batch.jobs.length>50)throw Error(file+": jobs must be array of at most 50");
  for(const job of batch.jobs){
    if(!job||typeof job!=="object")throw Error(file+": invalid job");
    if(!zeroExperienceEvidence(job)){excluded++;continue;}
    const title=clean(job.title,250),company=clean(job.company,250);
    if(!title||!company)throw Error(file+": missing title/company");
    const url=new URL(job.url);
    if(url.protocol!=="https:")throw Error(file+": HTTPS URL required");
    url.hash="";
    for(const k of [...url.searchParams.keys()])if(/^(utm_|fbclid$|gclid$)/i.test(k))url.searchParams.delete(k);
    const fields=[crypto.randomUUID(),url.toString(),title,company,clean(job.location,250),clean(job.workArrangement,80),clean(job.employmentType,80),clean(job.salary,120),Number.isInteger(job.matchScore)&&job.matchScore>=0&&job.matchScore<=100?job.matchScore:null,clean(job.matchReason,2500),clean(job.languageEvidence,1500),clean(job.eligibilityEvidence,1500),clean(job.verificationStatus,80)||"Unverified",clean(job.source,150)||"ChatGPT Daily Job Search"];
    const vals=fields.map(v=>v===null?"NULL":typeof v==="number"?String(v):quote(v));
    statements.push("INSERT INTO recruitment_jobs(id,url,title,company,location,work_arrangement,employment_type,salary,match_score,match_reason,language_evidence,eligibility_evidence,verification_status,source) VALUES("+vals.join(",")+") ON CONFLICT(url) DO UPDATE SET title=excluded.title,company=excluded.company,location=excluded.location,work_arrangement=excluded.work_arrangement,employment_type=excluded.employment_type,salary=excluded.salary,match_score=excluded.match_score,match_reason=excluded.match_reason,language_evidence=excluded.language_evidence,eligibility_evidence=excluded.eligibility_evidence,verification_status=excluded.verification_status,source=excluded.source,last_seen_at=CURRENT_TIMESTAMP;");
    statements.push("INSERT INTO recruitment_zero_experience_evidence(job_url,evidence,source_url) VALUES("+[url.toString(),clean(job.zeroExperienceEvidence,1500),clean(job.zeroExperienceSourceUrl,1000)].map(quote).join(",")+") ON CONFLICT(job_url) DO UPDATE SET evidence=excluded.evidence,source_url=excluded.source_url,verified_at=CURRENT_TIMESTAMP;");
    total++;
  }
}
writeFileSync("/tmp/careerfinder-recruitment-import.sql",statements.join("\n")+"\n");
console.log("Prepared "+total+" verified zero-experience vacancy records; excluded "+excluded+" unverified/ineligible records from "+files.length+" batches");
