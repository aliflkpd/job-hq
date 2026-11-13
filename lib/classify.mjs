// Rule-based fit estimate for scanned postings. No AI involved: every point is explained in `reasons`.
// Tuned for a mid-to-senior UI/UX or product designer based in Indonesia: remote with international
// first, Indonesia OK, overseas only with visa sponsorship, minimum IDR 10jt/month, about 5 years experience.
// Edit the constants below to fit your own search.

const ID_PLACES = /indonesia|jakarta|bali\b|surabaya|bandung|yogyakarta|sleman|banten|jawa\b|java\b|kudus|batam|medan|semarang|tangerang|bekasi|depok|bogor|balaraja|karawang|padalarang|margahayu|gunung sindur|cengkareng|kemayoran|setiabudi|pasar minggu|pulo gadung|badung|canggu|denpasar|makassar|malang\b|pondok/i;
const MY_PLACES = /malaysia|kuala lumpur|selangor|petaling|cheras|subang|puchong|penang|johor|bangsar|klang|shah alam|mont kiara|sungai besi|bukit mertajam|sdn\b/i;
const SG_PLACES = /singapore|islandwide|\b(central|east|west|north|north-east) region\b|\bD\d{2}\s/i;
const AU_PLACES = /australia|sydney|melbourne|brisbane|perth|canberra/i;
const OTHER_SPONSOR = /japan|tokyo|osaka|hong kong|dubai|\buae\b|abu dhabi|korea|seoul|taiwan|taipei|thailand|bangkok|vietnam|new zealand/i;
const PH = /philippines|manila|makati|metro manila|\bcebu\b/i;
const RESTRICTED = /united states|\busa\b|\bus\b|u\.s\.|new york|san francisco|seattle|austin|boston|chicago|los angeles|california|texas|north carolina|raleigh|, ?(ca|ny|tx|wa|ma)\b|canada|toronto|vancouver|united kingdom|\buk\b|london|ireland|germany|berlin|france|paris|spain|barcelona|madrid|portugal|lisbon|italy|netherlands|amsterdam|belgium|poland|warsz|krak|wroc|gda|sweden|stockholm|norway|denmark|finland|estonia|hungary|bulgaria|cyprus|serbia|croatia|slovenia|slovakia|czech|austria|greece|ukraine|romania|bosnia|montenegro|europe|emea|latam|latin america|mexico|argentina|brazil|colombia|chile|india|bangalore|mumbai|delhi|israel|turkey|south africa|nigeria|egypt/i;
const WORLDWIDE = /anywhere|worldwide|global\b|\bapac\b|asia[- ]pacific|southeast asia/i;
const REMOTE_WORD = /remote|anywhere|telecommute|work from home|wfh/i;
const REMOTE_BOARDS = /^(jobicy|himalayas|weworkremotely|remoteok|workingnomads|remotive|nodesk|remote-com|deel)/;

const NON_DIGITAL = /industrial|textile|footwear|apparel|accessor|\bbags?\b|toys?|plush|lifestyle product|merchandis|prepress|packaging|wooden|injection|mou?ld|tooling|mechanical|electrical|electronic|civil|structur|hvac|acmv|piping|precast|semiconductor|\bic\b|\bsoc\b|\brtl\b|\bpcb\b|\bcad\b|architectur|\bbim\b|actuator|robotic|substation|analog|physical design|\bcpu\b|\bgpu\b|\bnpu\b|\bsram\b|rf design|process design|marine|offshore|fire protection|drafter|draftsman|marketing executive|tour planner|\bsales\b|luxury|retail product|graphic cum|tech pack|electronics|cooling|rubber|plastic|mep|m&e|automation|medical device|software design engineer|power electronics|\bsrc\b/i;
const DESIGN_ENGINEER = /design engineer/i;
const UI_SIGNAL = /\b(ux|ui|user experience|user interface|interaction|front-?end|web|digital|app|application|mobile|visual)\b/i;
const ATS_PORTALS = /^(ashby|greenhouse|lever|workable|smartrecruiters|himalayas|jobicy|remoteok|weworkremotely|workingnomads|remotive|deel|remote-com|recruitee|gem|hirehive)/;

const AGENCY = /lemon\.io|hire manila|adecco|talentsis|manpower|randstad|persol|michael page|robert half|search personnel|recruit|staffing|jobster|\bhays\b|kelly services|hr advisory|headhunt|talent trader|jet recruit|scientec|ethos search|asia search|private advertiser|elitez|intuit recruitment|kingfisher|argyll scott|ennoble|people profilers|hkm hr|wola|rrecruiter|jobs alley/i;
const JUNIOR = /\b(junior|jr\.?|intern|internship|graduate|trainee|entry[- ]level|fresh)\b/i;
const UI_TITLE = /\b(ux|ui|user experience|user interface|interaction|front-?end|web|digital|app|application|mobile|visual|software|design system|saas|fintech|platform|payments?)\b/i;
const LEAD = /\b(staff|principal|director|head of|vp|vice president|executive director|lead|manager|chief)\b/i;
const SENIOR = /\b(senior|sr\.?)\b/i;

export const REGION_LABELS = { ID: 'Indonesia', SG: 'Singapore', MY: 'Malaysia', AU: 'Australia', ASIA: 'Other Asia', PH: 'Philippines', WW: 'Worldwide remote', US: 'US / Canada', EU: 'Europe / UK', LATAM: 'LATAM', IN: 'India / other', UNK: 'Unclear' };

export function sourceLabel(portal, url = '') {
  const p = String(portal).replace(/-api$/, '');
  if (p === 'jobstreet') {
    if (/id\.jobstreet/.test(url)) return 'Jobstreet Indonesia';
    if (/sg\.jobstreet/.test(url)) return 'Jobstreet Singapore';
    if (/my\.jobstreet/.test(url)) return 'Jobstreet Malaysia';
    if (/seek\.com\.au/.test(url)) return 'SEEK Australia';
    return 'Jobstreet';
  }
  const map = { mycareersfuture: 'MyCareersFuture (SG gov)', techinasia: 'Tech in Asia', kalibrr: 'Kalibrr', jobicy: 'Jobicy', himalayas: 'Himalayas', weworkremotely: 'We Work Remotely', remoteok: 'RemoteOK', workingnomads: 'Working Nomads', remotive: 'Remotive', solidjobs: 'SolidJobs (Poland)', glints: 'Glints' };
  if (map[p]) return map[p];
  if (/^(ashby|greenhouse|lever|workable|smartrecruiters|phenom|successfactors|icims|deel|remote-com|hirehive|gem|recruitee|paylocity|jazzhr|zoho-recruit|factorial|mokahr|feishu-jobs)/.test(p)) return 'Company career sites';
  return p;
}


// Country detection for the Discover country filter. Order matters: the first match wins.
const COUNTRIES = [
  ['Singapore', /singapore|islandwide|\b(central|east|west|north|north-east) region\b/i],
  ['Malaysia', /malaysia|kuala lumpur|selangor|petaling|cheras|subang|puchong|penang|johor|bangsar|klang|shah alam|mont kiara|sungai besi|bukit mertajam|\bkl\b/i],
  ['Australia', /australia|sydney|melbourne|brisbane|perth|canberra|adelaide/i],
  ['New Zealand', /new zealand|auckland|wellington/i],
  ['Japan', /japan|tokyo|osaka|kyoto|yokohama/i],
  ['Hong Kong', /hong kong/i],
  ['South Korea', /korea|seoul/i],
  ['Taiwan', /taiwan|taipei/i],
  ['Thailand', /thailand|bangkok/i],
  ['Vietnam', /vietnam|ho chi minh|hanoi/i],
  ['Philippines', /philippines|manila|makati|metro manila|\bcebu\b/i],
  ['UAE', /\buae\b|dubai|abu dhabi|emirates/i],
  ['India', /india|bangalore|bengaluru|mumbai|delhi|hyderabad|pune|chennai/i],
  ['Israel', /israel|tel aviv/i],
  ['Turkey', /turkey|t[uü]rkiye|istanbul/i],
  ['United Kingdom', /united kingdom|\buk\b|london|manchester|england|scotland|edinburgh|bristol/i],
  ['Ireland', /ireland|dublin/i],
  ['Germany', /germany|deutschland|berlin|munich|m[uü]nchen|hamburg|frankfurt|cologne/i],
  ['France', /france|paris|lyon|toulouse/i],
  ['Spain', /spain|barcelona|madrid|valencia/i],
  ['Portugal', /portugal|lisbon|porto/i],
  ['Italy', /italy|milan|rome|turin/i],
  ['Netherlands', /netherlands|amsterdam|rotterdam|utrecht|eindhoven/i],
  ['Belgium', /belgium|brussels|antwerp/i],
  ['Switzerland', /switzerland|zurich|z[uü]rich|geneva|basel/i],
  ['Austria', /austria|vienna|wien/i],
  ['Poland', /poland|warsz|krak|wroc|gda[nń]sk|pozna|\bpl\b/i],
  ['Czechia', /czech|prague/i],
  ['Hungary', /hungary|budapest/i],
  ['Romania', /romania|bucharest/i],
  ['Bulgaria', /bulgaria|sofia/i],
  ['Serbia', /serbia|belgrade/i],
  ['Croatia', /croatia|zagreb/i],
  ['Slovenia', /slovenia|ljubljana/i],
  ['Slovakia', /slovakia|bratislava/i],
  ['Greece', /greece|athens/i],
  ['Cyprus', /cyprus|nicosia|limassol/i],
  ['Estonia', /estonia|tallinn/i],
  ['Sweden', /sweden|stockholm|gothenburg/i],
  ['Norway', /norway|oslo/i],
  ['Denmark', /denmark|copenhagen/i],
  ['Finland', /finland|helsinki/i],
  ['Ukraine', /ukraine|kyiv|kiev/i],
  ['Bosnia', /bosnia/i],
  ['Canada', /canada|toronto|vancouver|montreal|ottawa|calgary/i],
  ['United States', /united states|\busa\b|\bus\b|u\.s\.|new york|san francisco|seattle|austin|boston|chicago|los angeles|california|texas|north carolina|raleigh|atlanta|denver|miami|, ?(ca|ny|tx|wa|ma|nc|il|fl|co|ga)\b/i],
  ['Mexico', /mexico|m[eé]xico/i],
  ['Brazil', /brazil|brasil|s[aã]o paulo/i],
  ['Argentina', /argentina|buenos aires/i],
  ['Colombia', /colombia|bogot/i],
  ['Chile', /chile|santiago/i],
  ['South Africa', /south africa|cape town|johannesburg/i],
  ['Nigeria', /nigeria|lagos/i],
  ['Egypt', /egypt|cairo/i],
];
const COUNTRY_BY_PORTAL = { mycareersfuture: 'Singapore' };

export function countryOf(job, region) {
  const loc = job.location || '';
  const url = job.url || '';
  const portal = String(job.portal).replace(/-api$/, '');
  if (region === 'ID') return 'Indonesia';
  if (COUNTRY_BY_PORTAL[portal]) return COUNTRY_BY_PORTAL[portal];
  if (/sg\.jobstreet/.test(url)) return 'Singapore';
  if (/my\.jobstreet/.test(url)) return 'Malaysia';
  if (/seek\.com\.au/.test(url)) return 'Australia';
  for (const [name, re] of COUNTRIES) if (re.test(loc)) return name;
  if (WORLDWIDE.test(loc) || region === 'WW') return 'Worldwide remote';
  if (region === 'EU') return 'Europe (country not stated)';
  if (region === 'LATAM') return 'Latin America (country not stated)';
  return 'Not stated';
}

function regionOf(job) {
  const loc = job.location || '';
  const url = job.url || '';
  const portal = String(job.portal).replace(/-api$/, '');
  const remoteBoard = REMOTE_BOARDS.test(portal);
  const remote = REMOTE_WORD.test(loc) || remoteBoard || /\bremote\b/i.test(job.title);

  let region = 'UNK';
  if (portal === 'mycareersfuture') region = 'SG';
  else if (/id\.jobstreet|kalibrr|techinasia|glints/.test(url + portal) || ID_PLACES.test(loc)) region = 'ID';
  else if (/sg\.jobstreet/.test(url)) region = 'SG';
  else if (/my\.jobstreet/.test(url)) region = 'MY';
  else if (/seek\.com\.au/.test(url)) region = 'AU';
  else if (WORLDWIDE.test(loc)) region = 'WW';
  else if (SG_PLACES.test(loc)) region = 'SG';
  else if (MY_PLACES.test(loc)) region = 'MY';
  else if (AU_PLACES.test(loc)) region = 'AU';
  else if (OTHER_SPONSOR.test(loc)) region = 'ASIA';
  else if (PH.test(loc)) region = 'PH';
  else if (/canada|united states|\busa\b|\bus\b|new york|san francisco|seattle|austin|boston|chicago|california|texas|raleigh|north carolina|, ?(ca|ny|tx|wa|ma)\b/i.test(loc)) region = 'US';
  else if (/latam|latin america|mexico|argentina|brazil|colombia|chile/i.test(loc)) region = 'LATAM';
  else if (/india|bangalore|mumbai|delhi|israel|turkey|south africa|nigeria|egypt/i.test(loc)) region = 'IN';
  else if (RESTRICTED.test(loc)) region = 'EU';
  else if (remoteBoard && !loc) region = 'UNK';

  // "Remote from Hungary" style boards: a country on a remote board means that country only.
  if (remoteBoard && region === 'WW' && !WORLDWIDE.test(loc)) region = 'UNK';

  const access = { ID: 'local', WW: 'remote-open', SG: 'sponsor', MY: 'sponsor', AU: 'sponsor', ASIA: 'sponsor', PH: 'restricted', US: 'restricted', EU: 'restricted', LATAM: 'restricted', IN: 'restricted', UNK: 'unclear' }[region];
  const mode = /\bhybrid\b/i.test(loc + job.title) ? 'hybrid' : remote ? 'remote' : /on-?site/i.test(loc + job.title) ? 'onsite' : 'unspecified';
  return { region, access, remote, mode };
}

export function parseSalary(raw) {
  const m = /^([\d.,]+)\s*-\s*([\d.,]+)\s+([A-Z]{3})$/.exec(raw || '');
  if (!m) return null;
  const min = Number(m[1].replace(/[.,]/g, ''));
  const max = Number(m[2].replace(/[.,]/g, ''));
  return { raw, min, max, cur: m[3] };
}

export function toIdrPerMonth(sal, rates) {
  if (!sal) return null;
  const rate = rates[sal.cur];
  if (!rate) return null;
  const yearly = sal.cur === 'IDR' ? sal.max >= 120_000_000 : sal.max >= 20000;
  const div = yearly ? 12 : 1;
  return { min: Math.round((sal.min * rate) / div), max: Math.round((sal.max * rate) / div), yearly };
}

export function levelOf(title) {
  if (JUNIOR.test(title)) return 'junior';
  if (LEAD.test(title)) return /\b(staff|principal|director|head of|vp|vice president|executive director|chief)\b/i.test(title) ? 'staff' : 'lead';
  if (SENIOR.test(title)) return 'senior';
  return 'mid';
}

function isDigitalDesign(job, portal) {
  const t = job.title;
  if (NON_DIGITAL.test(t)) return { ok: false, why: 'Looks like physical, hardware or engineering work' };
  if (DESIGN_ENGINEER.test(t) && !UI_SIGNAL.test(t) && !ATS_PORTALS.test(portal)) return { ok: false, why: '"Design Engineer" from a local board is usually hardware or construction' };
  return { ok: true };
}

export function classify(job, { rates, minIdr = 10_000_000, now = Date.now() }) {
  const portal = String(job.portal).replace(/-api$/, '');
  const geo = regionOf(job);
  const country = countryOf(job, geo.region);
  const level = levelOf(job.title);
  const dig = isDigitalDesign(job, portal);
  const ambiguous = dig.ok && geo.region === 'ID' && !UI_TITLE.test(job.title);
  const agency = AGENCY.test(job.company || '');
  const posted = job.posted_at ? Date.parse(job.posted_at) : NaN;
  const daysAgo = Number.isFinite(posted) ? Math.max(0, Math.round((now - posted) / 86400000)) : null;
  const sal = parseSalary(job.salaryRaw);
  const idr = toIdrPerMonth(sal, rates);

  const reasons = [];
  let score = 0;
  if (dig.ok) { score += 35; reasons.push({ t: '+35', m: 'Title is a digital design role' }); } else { reasons.push({ t: '0', m: dig.why }); }

  if (geo.access === 'local') { score += 30; reasons.push({ t: '+30', m: 'In Indonesia, no visa needed' }); }
  else if (geo.access === 'remote-open') { score += 30; reasons.push({ t: '+30', m: 'Remote and open to anywhere' }); }
  else if (geo.access === 'sponsor') { score += 10; reasons.push({ t: '+10', m: 'Overseas, needs visa sponsorship' }); }
  else if (geo.access === 'unclear') { score += 10; reasons.push({ t: '+10', m: 'Location is unclear, check the posting' }); }
  else reasons.push({ t: '0', m: 'Restricted to residents of ' + (REGION_LABELS[geo.region] || 'another region') });

  if (level === 'mid' || level === 'senior') { score += 20; reasons.push({ t: '+20', m: level === 'senior' ? 'Senior level fits 5+ years' : 'Mid level fits' }); }
  else if (level === 'lead') { score += 10; reasons.push({ t: '+10', m: 'Lead or manager level is a stretch' }); }
  else if (level === 'staff') { score += 4; reasons.push({ t: '+4', m: 'Staff, Principal or Head level is a big stretch' }); }
  else { score += 5; reasons.push({ t: '+5', m: 'Junior level, likely below your pay floor' }); }

  if (ambiguous) { score -= 15; reasons.push({ t: '-15', m: 'Title says only "Product Designer": could be physical product design, read the posting' }); }
  if (agency) { score -= 10; reasons.push({ t: '-10', m: 'Posted by a recruiter or agency, or the employer is hidden' }); }

  if (daysAgo === null) { score += 3; reasons.push({ t: '+3', m: 'No posting date' }); }
  else if (daysAgo <= 7) { score += 10; reasons.push({ t: '+10', m: 'Posted in the last week' }); }
  else if (daysAgo <= 21) { score += 7; reasons.push({ t: '+7', m: 'Posted in the last 3 weeks' }); }
  else if (daysAgo <= 45) { score += 3; reasons.push({ t: '+3', m: 'Posted in the last 45 days' }); }
  else reasons.push({ t: '0', m: 'Older than 45 days, may be closed' });

  let belowMin = false;
  if (idr) {
    if (idr.max >= minIdr) { score += 5; reasons.push({ t: '+5', m: `Pay is above your floor of Rp${minIdr / 1e6}jt` }); }
    else { belowMin = true; score -= 15; reasons.push({ t: '-15', m: `Pay is below your floor of Rp${minIdr / 1e6}jt` }); }
  }
  score = Math.max(0, Math.min(100, score));

  let bucket = 'weak';
  if (!dig.ok) bucket = 'off';
  else if (geo.access === 'restricted') bucket = 'blocked';
  else if (score >= 70) bucket = 'strong';
  else if (score >= 45) bucket = 'possible';

  const accessLabel = { local: 'Indonesia', 'remote-open': 'Remote, anywhere', sponsor: 'Needs visa', restricted: 'Not open to you', unclear: 'Location unclear' }[geo.access];
  return { ...geo, country, level, ambiguous, agency, digital: dig.ok, offReason: dig.ok ? null : dig.why, daysAgo, salary: sal, idr, belowMin, score, bucket, reasons, accessLabel, regionLabel: REGION_LABELS[geo.region] };
}
