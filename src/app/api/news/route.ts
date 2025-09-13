import { NextRequest, NextResponse } from 'next/server';

export interface NewsArticle {
  id?: string;
  title: string;
  description: string;
  url?: string;
  urlToImage?: string;
  publishedAt: string;
  source: {
    name: string;
    url?: string;
  };
  category: 'flood-control' | 'dpwh' | 'corrupt-politicians' | 'nepo-babies';
  content?: string;
  language?: string;
  country?: string;
}

export interface NewsResponse {
  status: string;
  totalResults: number;
  articles: NewsArticle[];
  fallback?: boolean;
  error?: string;
}

// Curated list of local Filipino outlets and domains
const PH_OUTLETS = [
  'ABS-CBN News',
  'GMA News',
  'CNN Philippines',
  'Philippine Daily Inquirer',
  'Rappler',
  'Manila Bulletin',
  'Philippine Star',
  'The Manila Times',
  'BusinessWorld Philippines',
  'SunStar',
  'Daily Tribune',
  'Manila Standard',
  'One News PH',
  'Philippine News Agency (PNA)',
];

const PH_DOMAINS = [
  'news.abs-cbn.com',
  'gmanetwork.com',
  'cnnphilippines.com',
  'inquirer.net',
  'rappler.com',
  'mb.com.ph',
  'philstar.com',
  'manilatimes.net',
  'businessworldonline.com',
  'sunstar.com.ph',
  'tribune.net.ph',
  'manilastandard.net',
  'onenews.ph',
  'pna.gov.ph',
];

const DOMAIN_TO_OUTLET: Record<string, string> = {
  'news.abs-cbn.com': 'ABS-CBN News',
  'gmanetwork.com': 'GMA News',
  'cnnphilippines.com': 'CNN Philippines',
  'inquirer.net': 'Philippine Daily Inquirer',
  'rappler.com': 'Rappler',
  'mb.com.ph': 'Manila Bulletin',
  'philstar.com': 'Philippine Star',
  'manilatimes.net': 'The Manila Times',
  'businessworldonline.com': 'BusinessWorld Philippines',
  'sunstar.com.ph': 'SunStar',
  'tribune.net.ph': 'Daily Tribune',
  'manilastandard.net': 'Manila Standard',
  'onenews.ph': 'One News PH',
  'pna.gov.ph': 'Philippine News Agency (PNA)',
};

const EXCLUDE_DOMAINS = [
  'news.google.com',
  'news.yahoo.com',
  'yahoo.com',
  'msn.com',
  'pressreader.com',
  'facebook.com',
  'twitter.com',
  'x.com',
  'reddit.com',
  'youtube.com',
];

// Utils
const withinWindow = (iso: string, from?: string | null, to?: string | null) => {
  if (!from && !to) return true;
  const t = new Date(iso).getTime();
  if (from && t < new Date(from).getTime()) return false;
  if (to && t > new Date(to).getTime()) return false;
  return true;
};

const getHostname = (u?: string) => {
  if (!u) return '';
  try {
    return new URL(u).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
};

const guessSourceName = (url?: string, fallback?: string) => {
  const host = getHostname(url);
  return DOMAIN_TO_OUTLET[host] || fallback || host || 'Unknown';
};

const normalizeTitle = (t?: string) =>
  (t || '').toLowerCase().replace(/\s+/g, ' ').trim();

const isLocalOutlet = (sourceName?: string, url?: string) => {
  const host = getHostname(url);
  if (PH_DOMAINS.includes(host)) return true;
  const src = (sourceName || '').toLowerCase();
  return (
    PH_OUTLETS.some((o) => o.toLowerCase() === src) ||
    src.includes('philippine') ||
    src.includes('philippines') ||
    src.includes('abs-cbn') ||
    src.includes('gma') ||
    src.includes('rappler') ||
    src.includes('inquirer') ||
    src.includes('philstar') ||
    src.includes('manila') ||
    src.includes('cnn philippines') ||
    src.includes('sunstar') ||
    src.includes('businessworld')
  );
};

const dedupeArticles = (items: NewsArticle[]) => {
  const byUrl = new Map<string, NewsArticle>();
  const byTitle = new Map<string, NewsArticle>();

  for (const a of items) {
    const keyUrl = (a.url || '').split('?')[0];
    const keyTitle = normalizeTitle(a.title);
    const host = getHostname(a.url);

    if (EXCLUDE_DOMAINS.includes(host)) continue;

    if (keyUrl && !byUrl.has(keyUrl)) {
      byUrl.set(keyUrl, a);
    } else if (keyTitle && !byTitle.has(keyTitle)) {
      byTitle.set(keyTitle, a);
    }
  }

  const merged = Array.from(byUrl.values());
  for (const [t, art] of byTitle) {
    if (!merged.find((m) => normalizeTitle(m.title) === t)) {
      merged.push(art);
    }
  }
  return merged;
};

// Enhanced mock data (same as before)
const mockNews: NewsArticle[] = [
  {
    id: '1',
    title:
      'DPWH Flood Control Project sa Pampanga: ₱8.5B Budget, Walang Natayong Infrastructure',
    description:
      'Ang malaking flood control project sa Pampanga na may budget na ₱8.5 billion ay naging ghost project. Contractors nakakuha ng pera pero walang actual construction na nangyari.',
    urlToImage:
      'https://images.unsplash.com/photo-1547036967-23d11aacaee0?w=800&h=500&fit=crop',
    publishedAt: new Date().toISOString(),
    source: { name: 'Philippine Daily Inquirer' },
    category: 'flood-control',
    url: 'https://inquirer.net/ghost-project-pampanga',
  },
  {
    id: '2',
    title:
      'DPWH Undersecretary na may ₱2.3B sa Swiss Bank, Naaresto na sa NAIA',
    description:
      'Si Undersecretary Roberto Santos ng DPWH ay naaresto sa airport habang paalis ng bansa. May nakitang ₱2.3 billion sa Swiss bank account na hindi niya ma-explain.',
    urlToImage:
      'https://images.unsplash.com/photo-1594736797933-d0ea5d3a0db4?w=800&h=500&fit=crop',
    publishedAt: new Date(Date.now() - 3600000).toISOString(),
    source: { name: 'Rappler' },
    category: 'dpwh',
    url: 'https://rappler.com/dpwh-undersecretary-arrest',
  },
  {
    id: '3',
    title:
      "Senator Villanueva's Son: ₱45M Lamborghini Collection, Pina-post sa Instagram",
    description:
      'Ang 22-year-old na anak ni Senator Villanueva ay nag-post sa Instagram ng kanyang Lamborghini collection na nagkakahalaga ng ₱45 million. Walang declared income ang bata.',
    urlToImage:
      'https://images.unsplash.com/photo-1544636331-e26879cd4d9b?w=800&h=500&fit=crop',
    publishedAt: new Date(Date.now() - 7200000).toISOString(),
    source: { name: 'ABS-CBN News' },
    category: 'nepo-babies',
    url: 'https://abs-cbn.com/senator-son-lamborghini',
  },
  {
    id: '4',
    title:
      'Governor Santos ng Bataan: May ₱12B Ghost Flood Control Projects, Under Investigation',
    description:
      'Nalaman na ang 15 flood control projects sa Bataan na may combined budget na ₱12 billion ay lahat ghost projects. Walang actual infrastructure na natayo.',
    urlToImage:
      'https://images.unsplash.com/photo-1581578731548-c64695cc6952?w=800&h=500&fit=crop',
    publishedAt: new Date(Date.now() - 10800000).toISOString(),
    source: { name: 'Manila Bulletin' },
    category: 'corrupt-politicians',
    url: 'https://mb.com.ph/bataan-ghost-projects',
  },
  {
    id: '5',
    title:
      "Mayor Rodriguez's Daughter: Nag-shopping sa Paris ₱8M, Naka-post sa TikTok",
    description:
      'Ang 19-year-old na anak ni Mayor Rodriguez ng Quezon City ay nag-viral sa TikTok dahil sa ₱8 million shopping spree sa Paris. Ang mayor ay may minimum wage lang na sahod.',
    urlToImage:
      'https://images.unsplash.com/photo-1529107386315-e1a2ed48a620?w=800&h=500&fit=crop',
    publishedAt: new Date(Date.now() - 14400000).toISOString(),
    source: { name: 'GMA News' },
    category: 'nepo-babies',
    url: 'https://gmanetwork.com/mayor-daughter-shopping',
  },
  {
    id: '6',
    title:
      'Cagayan Flood Control Scam: ₱25B Budget, 80% Ghost Projects Discovered',
    description:
      'Sa Cagayan province, natuklasan na 80% ng flood control projects na may total budget na ₱25 billion ay ghost projects. Contractors ay kumita ng malaki sa walang ginawang trabaho.',
    urlToImage:
      'https://images.unsplash.com/photo-1574263867128-a3d5c1b1deac?w=800&h=500&fit=crop',
    publishedAt: new Date(Date.now() - 18000000).toISOString(),
    source: { name: 'CNN Philippines' },
    category: 'flood-control',
    url: 'https://cnnphilippines.com/cagayan-flood-scam',
  },
  {
    id: '7',
    title:
      'DPWH Engineer na Nag-amass ng ₱500M Properties, Nahuli sa Lifestyle Check',
    description:
      'Isang DPWH engineer na may sahod na ₱45,000 monthly ay nahuli na may ₱500 million worth ng properties sa Makati, BGC, at Alabang.',
    urlToImage:
      'https://images.unsplash.com/photo-1450101499163-c8848c66ca85?w=800&h=500&fit=crop',
    publishedAt: new Date(Date.now() - 21600000).toISOString(),
    source: { name: 'BusinessWorld Philippines' },
    category: 'dpwh',
    url: 'https://businessworld.com.ph/dpwh-engineer-wealth',
  },
  {
    id: '8',
    title:
      "Congressman Martinez's Son: Bumili ng ₱85M Penthouse, Nag-house tour sa YouTube",
    description:
      'Ang 25-year-old na anak ni Congressman Martinez ay nag-upload ng house tour ng kanyang ₱85 million penthouse sa Bonifacio Global City. Walang legitimate business ang bata.',
    urlToImage:
      'https://images.unsplash.com/photo-1523050854058-8df90110c9f1?w=800&h=500&fit=crop',
    publishedAt: new Date(Date.now() - 25200000).toISOString(),
    source: { name: 'Philippine Star' },
    category: 'nepo-babies',
    url: 'https://philstar.com/congressman-son-penthouse',
  },
];

// Category -> keyword query
function buildCategoryQuery(category: string, userQuery?: string | null) {
  const base: Record<string, string> = {
    'flood-control':
      'Philippines ("flood control" OR dike OR embankment) (ghost project OR corruption OR scam OR kickback OR overprice OR audit) DPWH',
    dpwh:
      'Philippines DPWH (corruption OR arrested OR investigation OR "unexplained wealth" OR "ghost project" OR kickback OR overprice OR audit)',
    'corrupt-politicians':
      'Philippines (politician OR senator OR congressman OR governor OR mayor) (corruption OR plunder OR malversation OR "Swiss bank" OR "hidden assets" OR kickback OR audit OR Ombudsman OR Sandiganbayan)',
    'nepo-babies':
      'Philippines (political dynasty OR "nepo baby" OR "politician son" OR "politician daughter") (Instagram OR TikTok OR luxury OR Lamborghini OR penthouse OR "shopping spree")',
  };
  const q = category === 'all' ? 'Philippines corruption DPWH flood control politician "ghost project"' : base[category as keyof typeof base] || base['corrupt-politicians'];
  return userQuery ? `${q} ${userQuery}` : q;
}

// Gemini prompt — PH-only, mix recent + older references
function getGeminiSearchPrompt(category: string, query?: string, from?: string | null, to?: string | null): string {
  const outlets = PH_OUTLETS.join(', ');
  const domains = PH_DOMAINS.join(', ');
  const exclude = EXCLUDE_DOMAINS.join(', ');

  const timeScope =
    from && to
      ? `Time window: between ${from} and ${to}.`
      : `Time window: prioritize the last 6–12 months, and ALSO include older, relevant Philippine articles (up to ~10 years). Include the year for older items.`;

  const commonRules = `
Strict locality:
- Only Philippine local outlets (NO foreign wires/aggregators).
- Prefer outlets: ${outlets}.
- Prefer domains: ${domains}.
- Exclude aggregators (e.g., ${exclude}). Use the canonical local outlet URL.

${timeScope}

Required per item:
- Headline, source outlet, canonical URL, date (yyyy-mm-dd),
- 2–3 sentence description with names and ₱ amounts,
- Bullet key details, and OLDER_REFERENCE: yes/no.`;

  const map: Record<string, string> = {
    'flood-control': `Task: Flood control corruption in the Philippines.
Focus:
- Ghost flood-control projects (> ₱1B), unbuilt/substandard dikes/embankments.
- DPWH flood-control officials and contractors named.
- Hotspots: Metro Manila, Pampanga, Cagayan, Bicol, Mindanao.
- COA audits; Ombudsman/Sandiganbayan cases.
${commonRules}`,

    dpwh: `Task: DPWH corruption in the Philippines.
Focus:
- Unexplained wealth, ghost roads/bridges/buildings, contractor kickbacks.
- COA findings; Ombudsman cases; court proceedings.
${commonRules}`,

    'corrupt-politicians': `Task: Corrupt Filipino politicians.
Focus:
- Wealth beyond salaries, Swiss/offshore accounts, ghost employees/projects.
- Ombudsman/COA/Sandiganbayan cases; lifestyle checks; SALN gaps.
${commonRules}`,

    'nepo-babies': `Task: Political dynasties & nepotism in the Philippines.
Focus:
- Children/relatives flaunting wealth; luxury cars/shopping/vacations vs parent’s salary.
- Dynasties with multiple offices.
${commonRules}`,
  };

  let prompt = map[category as keyof typeof map] || map['corrupt-politicians'];
  if (query) {
    prompt += `

Additional Filipino keywords to include: ${query}`;
  }

  prompt += `

Output:
Provide 8–15 items (mix recent + at least 3 older references if available).
Use EXACTLY this format per item:

TITLE: ...
SOURCE: ...
URL: ...
DATE: yyyy-mm-dd
DESCRIPTION: ...
CATEGORY: ${category}
KEY_DETAILS:
- ...
- ...
- ...
OLDER_REFERENCE: yes/no`;

  return prompt;
}

// Parse Gemini structured text into NewsArticle[]
function parseGeminiResponse(text: string, category: string): NewsArticle[] {
  if (!text) return [];
  const blocks = text
    .split(/\n{2,}(?=TITLE\s*:)/i)
    .map((b) => b.trim())
    .filter(Boolean);

  const items: NewsArticle[] = [];

  for (const block of blocks) {
    const get = (label: string) =>
      (block.match(new RegExp(`${label}\\s*:\\s*(.+)`, 'i')) || [])[1]?.trim();

    const title = get('TITLE');
    const sourceName = get('SOURCE');
    let url = get('URL');
    let date = get('DATE') || '';

    if (!title) continue;
    if (!url) {
      const urlMatch = block.match(/https?:\/\/[^\s)]+/);
      if (urlMatch) url = urlMatch[0];
    }

    // Normalize date - Fixed: Check if date is valid before calling toISOString()
    let publishedAt: string;
    try {
      const dateObj = new Date(date);
      // Check if the date is valid before calling toISOString()
      if (isNaN(dateObj.getTime())) {
        throw new Error('Invalid date');
      }
      publishedAt = dateObj.toISOString();
    } catch (error) {
      // Try to extract date using regex pattern
      const dMatch = block.match(/\b(20\d{2})[-/](\d{1,2})[-/](\d{1,2})\b/);
      if (dMatch) {
        const y = Number(dMatch[1]);
        const m = Number(dMatch[2]);
        const d = Number(dMatch[3]);
        try {
          publishedAt = new Date(Date.UTC(y, m - 1, d)).toISOString();
        } catch (regexDateError) {
          // If even the regex extracted date fails, use current date
          publishedAt = new Date().toISOString();
        }
      } else {
        // Fallback to current date if no valid date found
        publishedAt = new Date().toISOString();
      }
    }

    const description = get('DESCRIPTION') || 'No description provided.';

    const item: NewsArticle = {
      id: `gemini_${Buffer.from((url || title).slice(0, 80)).toString('base64')}`,
      title,
      description,
      url,
      urlToImage: undefined,
      publishedAt,
      source: { name: sourceName || guessSourceName(url) },
      category: category as any,
    };

    if (!isLocalOutlet(item.source.name, item.url)) continue;
    items.push(item);
  }

  return dedupeArticles(items);
}

// Gemini search (parsing + PH filter + date window)
async function searchWithGemini(
  category: string,
  query?: string | null,
  from?: string | null,
  to?: string | null
): Promise<NewsArticle[]> {
  const apiKey = process.env.GEMINI_API_KEY;
  const configuredUrl = process.env.GEMINI_API_URL; // optional: full path to :generateContent
  if (!apiKey) throw new Error('Gemini API key missing');

  const url = `${configuredUrl || getGeminiEndpoint()}?key=${apiKey}`;
  const prompt = getGeminiSearchPrompt(category, query || undefined, from || undefined, to || undefined);
  const requestBody = { contents: [{ parts: [{ text: prompt }] }] };

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new Error(`Gemini API responded with ${response.status}${errText ? `: ${errText}` : ''}`);
  }

  const data = await response.json().catch(() => ({} as any));
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
  let items = parseGeminiResponse(text, category);

  // Respect date window
  items = items.filter((a) => withinWindow(a.publishedAt, from, to));

  if (items.length === 0) {
    // Curated mock fallback, window-filtered
    const fallback = mockNews
      .filter((a) => category === 'all' || a.category === category)
      .filter((a) => withinWindow(a.publishedAt, from, to));
    return fallback;
  }

  return items.slice(0, 15);
}

// WEB SEARCH PROVIDERS

// 1) Tavily (recommended: supports include_domains)
async function webSearchTavily(
  category: string,
  userQuery?: string | null,
  from?: string | null,
  to?: string | null,
  pageSize: number = 20
): Promise<NewsArticle[]> {
  const key = process.env.TAVILY_API_KEY;
  if (!key) throw new Error('Tavily API not configured');

  // Valid values only: 'day' | 'week' | 'month' | 'year'
  let time_range: 'day' | 'week' | 'month' | 'year' | undefined = undefined;
  if (from || to) {
    const start = from ? new Date(from).getTime() : Date.now() - 365 * 24 * 60 * 60 * 1000;
    const end = to ? new Date(to).getTime() : Date.now();
    const spanDays = Math.max(1, Math.round((end - start) / (24 * 60 * 60 * 1000)));
    if (spanDays <= 7) time_range = 'week';
    else if (spanDays <= 31) time_range = 'month';
    else time_range = 'year'; // use 'year' for anything longer; avoid 'all' (unsupported)
  }

  const query = buildCategoryQuery(category, userQuery);

  const payload: any = {
    api_key: key,
    query,
    search_depth: 'advanced',
    include_domains: PH_DOMAINS,        // array of PH domains
    exclude_domains: EXCLUDE_DOMAINS,   // exclude aggregators
    max_results: Math.min(10, Math.max(3, pageSize)), // Tavily caps at 10
    include_answer: false,
    include_raw_content: false,
    include_images: false,
    language: 'en',
  };
  if (time_range) payload.time_range = time_range;

  const res = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Tavily responded with ${res.status}${errText ? `: ${errText}` : ''}`);
  }

  const data = await res.json();

  const items: NewsArticle[] = (data.results || [])
    .map((r: any, i: number) => {
      const publishedAt = r.published_date ? new Date(r.published_date).toISOString() : new Date().toISOString();
      const sourceName = guessSourceName(r.url, r.source);
      return {
        id: `tavily_${Date.now()}_${i}`,
        title: r.title,
        description: r.content || r.snippet || 'No description.',
        url: r.url,
        urlToImage: undefined,
        publishedAt,
        source: { name: sourceName },
        category: category as any,
        content: r.snippet || r.content,
      };
    })
    .filter((a: NewsArticle) => isLocalOutlet(a.source.name, a.url))
    .filter((a: NewsArticle) => withinWindow(a.publishedAt, from, to));

  return dedupeArticles(items).slice(0, pageSize);
}

// 2) Brave Search (good published timestamp in many results)
async function webSearchBrave(
  category: string,
  userQuery?: string | null,
  from?: string | null,
  to?: string | null,
  pageSize: number = 20
): Promise<NewsArticle[]> {
  const key = process.env.BRAVE_SEARCH_API_KEY;
  if (!key) throw new Error('Brave Search API not configured');

  // Build a site-restricted query
  const siteFilter = PH_DOMAINS.map((d) => `site:${d}`).join(' OR ');
  const query = `${buildCategoryQuery(category, userQuery)} (${siteFilter})`;

  const url = new URL('https://api.search.brave.com/res/v1/web/search');
  url.searchParams.set('q', query);
  url.searchParams.set('count', String(Math.min(20, Math.max(10, pageSize))));
  url.searchParams.set('country', 'ph');
  url.searchParams.set('search_lang', 'en');
  url.searchParams.set('safesearch', 'moderate');
  url.searchParams.set('freshness', from || to ? 'relevance' : 'new'); // hint only

  const res = await fetch(url.toString(), {
    headers: { 'X-Subscription-Token': key },
  });
  if (!res.ok) throw new Error(`Brave responded with ${res.status}`);
  const data = await res.json();

  const results = data?.web?.results || [];

  const items: NewsArticle[] = results
    .map((r: any, i: number) => {
      const published =
        r.published || r.age?.published || r.page_age || null;
      const publishedAt = published ? new Date(published).toISOString() : new Date().toISOString();
      const host = getHostname(r.url);
      const sourceName = guessSourceName(r.url, r.meta_url?.display || r.profile?.name);

      return {
        id: `brave_${Date.now()}_${i}`,
        title: r.title,
        description: r.description || r.snippet || 'No description.',
        url: r.url,
        urlToImage: undefined,
        publishedAt,
        source: { name: sourceName },
        category: category as any,
        content: r.snippet || r.description,
      };
    })
    .filter((a: NewsArticle) => isLocalOutlet(a.source.name, a.url))
    .filter((a: NewsArticle) => withinWindow(a.publishedAt, from, to));

  return dedupeArticles(items).slice(0, pageSize);
}

// 3) Serper.dev (Google) news results
async function webSearchSerper(
  category: string,
  userQuery?: string | null,
  from?: string | null,
  to?: string | null,
  pageSize: number = 20
): Promise<NewsArticle[]> {
  const key = process.env.SERPER_API_KEY;
  if (!key) throw new Error('Serper API not configured');

  // You can use /news endpoint for news-specific results
  const endpoint = 'https://google.serper.dev/news';
  const siteFilter = PH_DOMAINS.map((d) => `site:${d}`).join(' OR ');
  const q = `${buildCategoryQuery(category, userQuery)} ${siteFilter}`;

  // Serper supports gl (location) and hl (language). tbs for custom date ranges is not guaranteed; we filter afterward.
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'X-API-KEY': key,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      q,
      gl: 'ph',
      hl: 'en',
      num: Math.min(20, Math.max(10, pageSize)),
      autocorrect: true,
    }),
  });

  if (!res.ok) throw new Error(`Serper responded with ${res.status}`);
  const data = await res.json();

  const items: NewsArticle[] = (data?.news || [])
    .map((r: any, i: number) => {
      const publishedAt = r.date ? new Date(r.date).toISOString() : new Date().toISOString();
      const host = getHostname(r.link);
      const sourceName = guessSourceName(r.link, r.source);

      return {
        id: `serper_${Date.now()}_${i}`,
        title: r.title,
        description: r.snippet || 'No description.',
        url: r.link,
        urlToImage: r.imageUrl,
        publishedAt,
        source: { name: sourceName },
        category: category as any,
        content: r.snippet,
      };
    })
    .filter((a: NewsArticle) => isLocalOutlet(a.source.name, a.url))
    .filter((a: NewsArticle) => withinWindow(a.publishedAt, from, to));

  return dedupeArticles(items).slice(0, pageSize);
}

// Orchestrator: try web providers in order
async function searchWithWeb(
  category: string,
  query?: string | null,
  from?: string | null,
  to?: string | null,
  pageSize: number = 20
): Promise<NewsArticle[]> {
  const preferred = (process.env.WEB_SEARCH_PROVIDER || '').toLowerCase();

  const tryOrder: Array<() => Promise<NewsArticle[]>> = [];

  const hasTavily = !!process.env.TAVILY_API_KEY;
  const hasBrave = !!process.env.BRAVE_SEARCH_API_KEY;
  const hasSerper = !!process.env.SERPER_API_KEY;

  const pushByName = (name: string) => {
    if (name === 'tavily' && hasTavily) {
      tryOrder.push(() => webSearchTavily(category, query, from, to, pageSize));
    }
    if (name === 'brave' && hasBrave) {
      tryOrder.push(() => webSearchBrave(category, query, from, to, pageSize));
    }
    if (name === 'serper' && hasSerper) {
      tryOrder.push(() => webSearchSerper(category, query, from, to, pageSize));
    }
  };

  if (preferred) pushByName(preferred);

  if (tryOrder.length === 0) {
    // Auto-detect
    if (hasTavily) tryOrder.push(() => webSearchTavily(category, query, from, to, pageSize));
    if (hasBrave) tryOrder.push(() => webSearchBrave(category, query, from, to, pageSize));
    if (hasSerper) tryOrder.push(() => webSearchSerper(category, query, from, to, pageSize));
  }

  let collected: NewsArticle[] = [];
  let firstError: any = null;

  for (const fn of tryOrder) {
    try {
      const res = await fn();
      collected = dedupeArticles([...collected, ...res]);
      if (collected.length) break; // Stop on first provider that yields items
    } catch (e) {
      if (!firstError) firstError = e;
    }
  }

  if (!collected.length) {
    if (firstError) throw firstError;
    throw new Error('No web search provider available or returned results.');
  }

  return collected;
}

// NewsAPI (kept as a fallback)
async function fetchNewsApiBatch(params: URLSearchParams) {
  const response = await fetch(
    `https://newsapi.org/v2/everything?${params.toString()}`
  );
  if (!response.ok) throw new Error(`NewsAPI responded with ${response.status}`);
  return response.json();
}

async function fallbackNewsAPISearch(
  category: string,
  query?: string | null,
  from?: string | null,
  to?: string | null,
  page: number = 1,
  pageSize: number = 20
): Promise<NewsArticle[]> {
  const apiKey = process.env.NEWS_API_KEY;
  if (!apiKey) throw new Error('NewsAPI not configured');

  const searchQuery = buildCategoryQuery(category, query);

  const commonParams: Record<string, string> = {
    apiKey,
    q: searchQuery,
    sortBy: from || to ? 'relevancy' : 'publishedAt',
    page: String(page),
    pageSize: String(pageSize),
    searchIn: 'title,description,content',
  };
  if (from) commonParams.from = from!;
  if (to) commonParams.to = to!;

  const withDomains = new URLSearchParams({
    ...commonParams,
    language: 'en',
    domains: PH_DOMAINS.join(','),
    excludeDomains: EXCLUDE_DOMAINS.join(','),
  });

  let data = await fetchNewsApiBatch(withDomains);

  if (!data.articles?.length || data.articles.length < Math.ceil(pageSize / 2)) {
    const withDomainsTL = new URLSearchParams({
      ...commonParams,
      language: 'tl',
      domains: PH_DOMAINS.join(','),
      excludeDomains: EXCLUDE_DOMAINS.join(','),
    });
    try {
      const tlData = await fetchNewsApiBatch(withDomainsTL);
      data.articles = [...(data.articles || []), ...(tlData.articles || [])];
    } catch {}
  }

  if (!data.articles?.length) {
    const withoutDomains = new URLSearchParams({
      ...commonParams,
      language: 'en',
      excludeDomains: EXCLUDE_DOMAINS.join(','),
    });
    data = await fetchNewsApiBatch(withoutDomains);
  }

  let items: NewsArticle[] = (data.articles || [])
    .filter((article: any) => {
      const url = article.url || '';
      const host = getHostname(url);
      if (EXCLUDE_DOMAINS.includes(host)) return false;
      return isLocalOutlet(article.source?.name, url);
    })
    .filter((article: any) => withinWindow(article.publishedAt, from, to))
    .map((article: any, index: number) => ({
      id: `newsapi_${Date.now()}_${index}`,
      title: article.title,
      description: article.description,
      url: article.url,
      urlToImage: article.urlToImage,
      publishedAt: article.publishedAt,
      source: { name: article.source?.name || guessSourceName(article.url) },
      category: category as any,
      content: article.content,
    }));

  items = dedupeArticles(items);
  return items.slice(0, pageSize);
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const category = (searchParams.get('category') || 'all') as
      | 'all'
      | NewsArticle['category'];
    const query = searchParams.get('q');

    const from = searchParams.get('from');
    const to = searchParams.get('to');
    const page = Number(searchParams.get('page') || '1');
    const pageSize = Number(searchParams.get('pageSize') || '20');

    console.log('Searching for Filipino corruption news:', {
      category,
      query,
      from,
      to,
      page,
      pageSize,
    });

    const useGeminiSearch = process.env.USE_GEMINI_SEARCH === 'true';
    const useMockData = process.env.USE_MOCK_DATA === 'true';

    if (useMockData) {
      const filteredArticles = (category === 'all'
        ? mockNews
        : mockNews.filter((a) => a.category === category)
      ).filter((a) => withinWindow(a.publishedAt, from, to));

      return NextResponse.json({
        status: 'ok',
        totalResults: filteredArticles.length,
        articles: filteredArticles,
        fallback: true,
      });
    }

    let articles: NewsArticle[] = [];

    if (useGeminiSearch) {
      try {
        articles = await searchWithGemini(category, query, from, to);
      } catch (geminiError) {
        console.error('Gemini search failed:', geminiError);
        try {
          // Web search layer
          articles = await searchWithWeb(category, query, from, to, pageSize);
        } catch (webError) {
          console.error('Web search failed:', webError);
          // NewsAPI fallback
          articles = await fallbackNewsAPISearch(
            category,
            query,
            from,
            to,
            page,
            pageSize
          );
        }
      }
    } else {
      // Prefer web search first if available, then NewsAPI
      try {
        articles = await searchWithWeb(category, query, from, to, pageSize);
      } catch (webError) {
        console.error('Web search failed:', webError);
        articles = await fallbackNewsAPISearch(
          category,
          query,
          from,
          to,
          page,
          pageSize
        );
      }
    }

    return NextResponse.json({
      status: 'ok',
      totalResults: articles.length,
      articles,
    });
  } catch (error) {
    console.error('Error in corruption news API:', error);

    const url = new URL(request.url);
    const category = (url.searchParams.get('category') || 'all') as
      | 'all'
      | NewsArticle['category'];
    const from = url.searchParams.get('from');
    const to = url.searchParams.get('to');

    const filteredArticles = (category === 'all'
      ? mockNews
      : mockNews.filter((a) => a.category === category)
    ).filter((a) => withinWindow(a.publishedAt, from, to));

    return NextResponse.json({
      status: 'ok',
      totalResults: filteredArticles.length,
      articles: filteredArticles,
      fallback: true,
      error: 'Service unavailable - using curated corruption news data',
    });
  }
}

function getGeminiEndpoint() {
  const base = process.env.GEMINI_API_BASE || 'https://generativelanguage.googleapis.com';
  const version = process.env.GEMINI_API_VERSION || 'v1beta';
  const model = process.env.GEMINI_MODEL || 'gemini-1.5-flash'; // e.g. gemini-pro, gemini-1.5-flash, gemini-1.5-flash-8b
  return `${base}/${version}/models/${model}:generateContent`;
}