import test from "node:test";
import assert from "node:assert/strict";
import { buildAnswerBook, answerQuestion } from "./screening-answers.mjs";
const profile={city:"Herzliya",country:"Israel",minimumSalary:"3000",linkedin:"https://www.linkedin.com/in/example",notes:"Israeli citizen, no sponsorship needed. Can start immediately. Expected salary 3,000 USD/month. US hours and 5 office days are fine. Skip Indigo."};
const book=buildAnswerBook(profile);
const a=(q,f)=>answerQuestion(q,f,book);
test("answer book comes from the profile notes",()=>{
  assert.equal(book.salaryText,"3,000 USD per month");assert.equal(book.salaryNumber,"3000");
  assert.equal(book.israeliCitizen,true);assert.equal(book.needsSponsorship,false);assert.equal(book.startImmediately,true);
  assert.equal(book.usHoursOk,true);assert.equal(book.officeDaysOk,true);assert.equal(book.location,"Herzliya, Israel");
});
test("empty notes answer nothing sensitive",()=>{
  const b=buildAnswerBook({city:"Herzliya",country:"Israel"});
  assert.equal(answerQuestion("Will you now or in the future require visa sponsorship?",{kind:"radio",options:["Yes","No"]},b),null);
  assert.equal(answerQuestion("What is your notice period?",{},b),null);
  assert.equal(answerQuestion("Are you willing to work US hours?",{kind:"radio",options:["Yes","No"]},b),null);
});
test("sponsorship and work authorisation",()=>{
  assert.deepEqual(a("Will you now or in the future require visa sponsorship?",{kind:"radio",options:["Yes","No"]}),{option:"No"});
  assert.deepEqual(a("Are you legally authorized to work in Israel?",{kind:"select",options:["Select...","Yes","No"]}),{option:"Yes"});
  assert.deepEqual(a("Do you require sponsorship?",{kind:"text"}),{value:"No"});
  assert.deepEqual(a("Citizenship",{kind:"text"}),{value:"Israeli"});
});
test("start date, salary, hours, office",()=>{
  assert.deepEqual(a("When can you start?",{kind:"text"}),{value:"Immediately"});
  assert.deepEqual(a("Notice period",{kind:"select",options:["Immediately","1 month","2 months"]}),{option:"Immediately"});
  assert.deepEqual(a("What are your salary expectations?",{kind:"text"}),{value:"3,000 USD per month"});
  assert.deepEqual(a("Expected monthly salary",{kind:"number"}),{value:"3000"});
  assert.equal(a("Expected salary (NIS)",{kind:"select",options:["10-12K","12-15K"]}),null);
  assert.deepEqual(a("Are you comfortable working US hours?",{kind:"radio",options:["Yes","No"]}),{option:"Yes"});
  assert.deepEqual(a("Are you willing to work 5 days a week from the office?",{kind:"radio",options:["Yes","No"]}),{option:"Yes"});
  assert.equal(a("Are you available for 2 evening shifts a week?",{kind:"radio",options:["Yes","No"]}),null);
});
test("languages and location",()=>{
  assert.deepEqual(a("English level",{kind:"select",options:["Basic","Good","Fluent","Native"]}),{option:"Native"});
  assert.deepEqual(a("What is your English proficiency?",{kind:"text"}),{value:"Native (mother tongue)"});
  assert.deepEqual(a("Hebrew level",{kind:"select",options:["None","Basic","Fluent","Native"]}),{option:"Basic"});
  assert.deepEqual(a("Hebrew proficiency",{kind:"text"}),{value:"Basic"});
  assert.deepEqual(a("Where do you live?",{kind:"text"}),{value:"Herzliya, Israel"});
  assert.deepEqual(a("Current city",{kind:"text"}),{value:"Herzliya"});
  assert.deepEqual(a("Are you based in Israel?",{kind:"radio",options:["Yes","No"]}),{option:"Yes"});
  assert.deepEqual(a("LinkedIn Profile",{kind:"text"}),{value:"https://www.linkedin.com/in/example"});
});
test("unknown, demographic, experience and consent questions stop the run",()=>{
  for(const [q,f] of [["How many years of B2B sales experience do you have?",{kind:"number"}],["Gender",{kind:"select",options:["Male","Female"]}],["Have you worked in a call center?",{kind:"radio",options:["Yes","No"]}],["I agree to the privacy policy",{kind:"checkbox"}],["Why do you want to work here?",{kind:"textarea"}],["",{}]])assert.equal(a(q,f),null,q);
});
test("notes can override language levels",()=>{
  const b=buildAnswerBook({...profile,notes:profile.notes+" Hebrew: conversational."});
  assert.equal(b.hebrewLevel,"conversational");
  assert.equal(answerQuestion("Hebrew level",{kind:"select",options:["Basic","Fluent"]},b),null);
});
