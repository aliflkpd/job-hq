// The instructions the agent gets for one role. Candidate-specific rules (voice, claims, CV facts) come from
// the preloaded skills and from career-ops' own cv.md and profile, not from this file.

export function buildPrompt({ job, folder, resultPath, careerOps, candidate }) {
  return `You are preparing ONE job application for the candidate, unattended. Nobody can answer questions, so decide with the rules below and flag doubts in "notes". You never send, submit or log in anywhere.

# The role
- Company: ${job.company}
- Title: ${job.title}
- Location text: ${job.location || 'not stated'}
- Found on: ${job.source}
- Posting: ${String(job.url).startsWith('app:') ? 'no link saved, find the posting with web_search' : job.url}
- Listed pay: ${job.salary || 'not listed'}
${job.fit != null ? `- Rule-based fit estimate: ${job.fit}/100 (${job.reasons.slice(0, 6).join('; ')})` : '- This application was added by hand; judge fit yourself.'}

# Folders
- career-ops: ${careerOps} (cv.md, config/profile.yml, modes/pdf.md, build-cv-html.mjs, verify-cv-facts.mjs, generate-pdf.mjs, jd-skill-gap.mjs)
- Save every deliverable in: ${folder} (create it)
- Write the final result JSON to: ${resultPath}

# Steps
1. Read the full posting (web_extract; if it fails use browser_exec). If you cannot read it, write a result with verdict "skip" and say why.
2. Screen eligibility first, following the loaded job-application skill (residency or work-authorization limits, required years far above the candidate's, on-site elsewhere, required skills with no proof in cv.md, recruiter or agency posts that hide the employer). If it fails, do not build a CV: write verdict "skip" with one plain sentence as skipReason.
3. Save the posting text to ${careerOps}/jds/<company-slug>-<role-slug>.md and run the tailored CV recipe in the skill reference career-ops-pipeline.md: payload JSON, build-cv-html.mjs, verify-cv-facts.mjs, generate-pdf.mjs (A4). Output PDF named "${candidate} - CV - <Company>.pdf" in the folder above. Re-read the summary and competencies against cv.md and remove any phrase that is not there. Do not invent anything.
4. Write cover-letter.md in the folder: 100 to 130 words, English, plain and casual, the candidate's own voice per the skill. No job IDs, requisition numbers or reference codes. No em dash. Mention only real projects from cv.md.
5. Find contacts, public information only: web_search the company careers page, the posting, and "<company> recruiter OR talent acquisition OR head of design linkedin". Keep up to 4 people who plausibly own this hire (recruiter, hiring manager, design lead) with their LinkedIn URL, plus any OFFICIAL recruiting inbox (talent@, careers@, work@, hello@) taken from the company site or the posting. Never guess an email address. Never use a personal email or phone number from someone's profile. If there is no official email, still list the people but leave email empty. LinkedIn pages cannot be read without login, so do not invent details about a person: use only what search results show.
6. For contacts with an email, write a 100 to 130 word email body in "draft" (subject goes in the first line as "Subject: ..."). For LinkedIn contacts leave "draft" empty.
7. Also save outreach.md in the folder summarising the contacts.
8. Write the result file as JSON, exactly this shape (use the write_file tool, not a shell heredoc):

{
  "verdict": "prepare" or "skip",
  "skipReason": "",
  "company": "", "role": "", "location": "", "salary": "",
  "score": "3.8/5",
  "applyUrl": "official apply link if different from the posting, else empty",
  "notes": "one or two short lines: gaps, anything the candidate must check",
  "contacts": [ { "name": "", "role": "", "channel": "email" or "linkedin", "email": "", "url": "", "draft": "", "note": "" } ]
}

# Hard rules
- Do not edit data/applications.md, portals.yml, cv.md or any career-ops config. Do not send emails or messages. Do not log in anywhere. Do not delete files, and do not use shell heredocs.
- Never claim anything that is not in cv.md. verify-cv-facts.mjs must pass.
- If a step fails, still write the result file: verdict "prepare" with whatever is done and say what is missing in "notes", or verdict "skip" if the role is not viable.
- Proofread cover-letter.md and every draft before finishing: no missing words, no typos, natural grammar.
- Finish with one line: DONE.
`;
}
