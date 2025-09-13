import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'node:crypto';

// Route/runtime config
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

// Types
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
  providerTrace?: string[];
}

// Curated PH outlets/domains
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
] as const;

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
] as const;

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
] as const;

// Small in-memory sticky cache (60s) to avoid blanking UI on transient 0 results
type CacheKey = string;
const CACHE_TTL_MS = 60_000;
const MAX_CACHE_ENTRIES = 100;
const memoryCache = new Map<
  CacheKey,
  { ts: number; articles: NewsArticle[]; providerTrace: string[] }
>();

function makeKey(params: {
  category: string;
  query: string | null;
  from: string | null;
  to: string | null;
  page: number;
  pageSize: number;
}): string {
  return JSON.stringify(params);
}

function getCached(key: CacheKey) {
  const entry = memoryCache.get(key);
  if (entry && Date.now() - entry.ts < CACHE_TTL_MS) return entry;
  return null;
}

function setCached(key: CacheKey, articles: NewsArticle[], providerTrace: string[]) {
  memoryCache.set(key, { ts: Date.now(), articles, providerTrace });
  if (memoryCache.size > MAX_CACHE_ENTRIES) {
    let oldestKey: string | null = null;
    let oldestTs = Infinity;
    for (const [k, v] of memoryCache) {
      if (v.ts < oldestTs) {
        oldestTs = v.ts;
        oldestKey = k;
      }
    }
    if (oldestKey) memoryCache.delete(oldestKey);
  }
}

// Utilities
const withinWindow = (iso: string, from?: string | null, to?: string | null) => {
  if (!from && !to) return true;
  
  const articleTime = new Date(iso).getTime();
  
  // Handle invalid dates
  if (isNaN(articleTime)) {
    console.warn('Invalid date in article:', iso);
    return true; // Include articles with invalid dates rather than exclude them
  }
  
  if (from) {
    const fromTime = new Date(from).getTime();
    if (isNaN(fromTime)) {
      console.warn('Invalid from date:', from);
    } else if (articleTime < fromTime) {
      return false;
    }
  }
  
  if (to) {
    const toTime = new Date(to).getTime();
    if (isNaN(toTime)) {
      console.warn('Invalid to date:', to);
    } else if (articleTime > toTime) {
      return false;
    }
  }
  
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

const normalizeTitle = (t?: string) => (t || '').toLowerCase().replace(/\s+/g, ' ').trim();

const isLocalOutlet = (sourceName?: string, url?: string) => {
  const host = getHostname(url);
  if (PH_DOMAINS.includes(host as (typeof PH_DOMAINS)[number])) return true;
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
    if (EXCLUDE_DOMAINS.includes(host as (typeof EXCLUDE_DOMAINS)[number])) continue;
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

// Category typing/guard
const CATEGORY_VALUES = [
  'flood-control',
  'dpwh',
  'corrupt-politicians',
  'nepo-babies',
] as const;
type CategoryKey = typeof CATEGORY_VALUES[number];
function isCategory(val: string): val is CategoryKey {
  return (CATEGORY_VALUES as readonly string[]).includes(val);
}
function normalizeCategoryKey(cat: string): NewsArticle['category'] {
  return isCategory(cat) ? cat : 'corrupt-politicians';
}

// Stable IDs from URL/title
function stableId(prefix: string, url?: string, fallbackKey?: string) {
  const key = url || fallbackKey || Math.random().toString(36);
  const hash = createHash('sha1').update(key).digest('hex').slice(0, 16);
  return `${prefix}_${hash}`;
}

// Param parsing/validation
function parseParams(req: NextRequest) {
  const sp = new URL(req.url).searchParams;
  const rawCategory = sp.get('category') || 'all';
  const category = (['all', ...CATEGORY_VALUES] as readonly string[]).includes(rawCategory)
    ? (rawCategory as 'all' | NewsArticle['category'])
    : 'all';

  const q = sp.get('q');

  const from = sp.get('from');
  const to = sp.get('to');
  const isIso = (v: string | null) => !v || !Number.isNaN(new Date(v).getTime());
  const fromIso = isIso(from) ? from : null;
  const toIso = isIso(to) ? to : null;

  let page = Number(sp.get('page') || '1');
  if (!Number.isFinite(page) || page < 1) page = 1;

  let pageSize = Number(sp.get('pageSize') || '20');
  if (!Number.isFinite(pageSize)) pageSize = 20;
  pageSize = Math.min(50, Math.max(1, pageSize)); // clamp 1–50

  return { category, query: q, from: fromIso, to: toIso, page, pageSize };
}

// Helper: timed JSON fetch
async function fetchJsonWithTimeout<T>(url: string, init: RequestInit, timeoutMs: number): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      ...init,
      signal: controller.signal,
      cache: 'no-store',
      next: { revalidate: 0 },
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`${res.status} ${res.statusText}${errText ? `: ${errText}` : ''}`);
    }
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

// Build query by category
function buildCategoryQuery(category: string, userQuery?: string | null) {
  const base: Record<CategoryKey, string> = {
    'flood-control':
      'Philippines ("flood control" OR dike OR embankment) (ghost project OR corruption OR scam OR kickback OR overprice OR audit) DPWH',
    dpwh:
      'Philippines DPWH (corruption OR arrested OR investigation OR "unexplained wealth" OR "ghost project" OR kickback OR overprice OR audit)',
    'corrupt-politicians':
      'Philippines (politician OR senator OR congressman OR governor OR mayor) (corruption OR plunder OR malversation OR "Swiss bank" OR "hidden assets" OR kickback OR audit OR Ombudsman OR Sandiganbayan)',
    'nepo-babies':
      'Philippines (political dynasty OR "nepo baby" OR "politician son" OR "politician daughter") (Instagram OR TikTok OR luxury OR Lamborghini OR penthouse OR "shopping spree")',
  };
  const q =
    category === 'all'
      ? 'Philippines corruption DPWH flood control politician "ghost project"'
      : base[(category as CategoryKey) in base ? (category as CategoryKey) : 'corrupt-politicians'];
  return userQuery ? `${q} ${userQuery}` : q;
}

// Gemini prompt (includes the names in nepo-babies block)
function getGeminiSearchPrompt(
  category: string,
  query?: string,
  from?: string | null,
  to?: string | null
): string {
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
- Include the following public figures as search hints ONLY IF there is coverage by reputable Filipino outlets (skip if no credible reporting; avoid gossip/defamation):
  - Claudine Co
  - Gela Marasigan
  - Gela Alonte
  - Vern Enciso
  - Verniece Enciso
  - Jammy Cruz
  - Jasmine Chan
  - Christine Lim
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

// Parse Gemini text to articles
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
    const date = get('DATE') || '';

    if (!title) continue;
    if (!url) {
      const urlMatch = block.match(/https?:\/\/[^\s)]+/);
      if (urlMatch) url = urlMatch[0];
    }

    let publishedAt: string;
    try {
      const dateObj = new Date(date);
      if (Number.isNaN(dateObj.getTime())) throw new Error('Invalid date');
      publishedAt = dateObj.toISOString();
    } catch {
      const dMatch = block.match(/\b(20\d{2})[-/](\d{1,2})[-/](\d{1,2})\b/);
      if (dMatch) {
        const y = Number(dMatch[1]);
        const m = Number(dMatch[2]);
        const d = Number(dMatch[3]);
        try {
          publishedAt = new Date(Date.UTC(y, m - 1, d)).toISOString();
        } catch {
          publishedAt = new Date().toISOString();
        }
      } else {
        publishedAt = new Date().toISOString();
      }
    }

    const description = get('DESCRIPTION') || 'No description provided.';

    const item: NewsArticle = {
      id: stableId('gemini', url, title),
      title,
      description,
      url,
      urlToImage: undefined,
      publishedAt,
      source: { name: sourceName || guessSourceName(url) },
      category: normalizeCategoryKey(category),
    };

    if (!isLocalOutlet(item.source.name, item.url)) continue;
    items.push(item);
  }

  return dedupeArticles(items);
}

// Gemini types
type GeminiPart = { text?: string };
type GeminiContent = { parts?: GeminiPart[] };
type GeminiCandidate = { content?: GeminiContent };
type GeminiResponse = { candidates?: GeminiCandidate[] };

// Fetch Gemini
async function searchWithGemini(
  category: string,
  query?: string | null,
  from?: string | null,
  to?: string | null
): Promise<NewsArticle[]> {
  const apiKey = process.env.GEMINI_API_KEY;
  const configuredUrl = process.env.GEMINI_API_URL; // optional full path to :generateContent
  if (!apiKey) throw new Error('Gemini API key missing');

  const url = `${configuredUrl || getGeminiEndpoint()}?key=${apiKey}`;
  const prompt = getGeminiSearchPrompt(category, query || undefined, from || undefined, to || undefined);
  const data = await fetchJsonWithTimeout<GeminiResponse>(
    url,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
    },
    8000
  );

  const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  let items = parseGeminiResponse(text, category);
  items = items.filter((a) => withinWindow(a.publishedAt, from, to));
  return items.slice(0, 15);
}

// Tavily types/payload
type TavilyResult = {
  title?: string;
  url?: string;
  source?: string;
  content?: string;
  snippet?: string;
  published_date?: string;
};
type TavilyResponse = { results?: TavilyResult[] };
type TavilyPayload = {
  api_key: string;
  query: string;
  search_depth: 'basic' | 'advanced';
  include_domains?: readonly string[];
  exclude_domains?: readonly string[];
  max_results: number;
  include_answer: boolean;
  include_raw_content: boolean;
  include_images: boolean;
  language?: string;
  time_range?: 'day' | 'week' | 'month' | 'year';
};

// Tavily (with widen retry)
async function webSearchTavily(
  category: string,
  userQuery?: string | null,
  from?: string | null,
  to?: string | null,
  pageSize: number = 20
): Promise<NewsArticle[]> {
  const key = process.env.TAVILY_API_KEY;
  if (!key) throw new Error('Tavily API not configured');

  let time_range: TavilyPayload['time_range'] | undefined = undefined;
  let daysFromToday = 0; // Moved outside if block to fix scope issue
  
  if (from || to) {
    const start = from ? new Date(from).getTime() : Date.now() - 365 * 24 * 60 * 60 * 1000;
    const end = to ? new Date(to).getTime() : Date.now();
    const spanDays = Math.max(1, Math.round((end - start) / (24 * 60 * 60 * 1000)));
    
    // Calculate how far back the start date is from today
    daysFromToday = Math.floor((Date.now() - start) / (24 * 60 * 60 * 1000));
    
    // For very old dates (more than 365 days), don't use time_range restriction
    if (daysFromToday > 365) {
      time_range = undefined; // Remove time restriction for old dates
    } else if (spanDays <= 7) {
      time_range = 'week';
    } else if (spanDays <= 31) {
      time_range = 'month';
    } else {
      time_range = 'year';
    }
  }

  const query = buildCategoryQuery(category, userQuery);
  const basePayload: TavilyPayload = {
    api_key: key,
    query,
    search_depth: 'advanced',
    include_domains: PH_DOMAINS,
    exclude_domains: EXCLUDE_DOMAINS,
    max_results: Math.min(10, Math.max(3, pageSize)),
    include_answer: false,
    include_raw_content: false,
    include_images: false,
    language: 'en',
    time_range, // Will be undefined for very old dates
  };

  const run = async (payload: TavilyPayload) =>
    fetchJsonWithTimeout<TavilyResponse>('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }, 8000);

  // Pass 1: with include_domains
  let data = await run(basePayload);

  let mapped: NewsArticle[] = (data.results || []).map((r, i): NewsArticle => {
    const publishedAt = r.published_date ? new Date(r.published_date).toISOString() : new Date().toISOString();
    const sourceName = guessSourceName(r.url, r.source);
    return {
      id: stableId('tavily', r.url, r.title),
      title: r.title || '',
      description: r.content || r.snippet || 'No description.',
      url: r.url,
      urlToImage: undefined,
      publishedAt,
      source: { name: sourceName },
      category: normalizeCategoryKey(category),
      content: r.snippet || r.content || '',
    };
  });

  let items = mapped
    .filter((a) => isLocalOutlet(a.source.name, a.url))
    .filter((a) => withinWindow(a.publishedAt, from, to));

  // Pass 2: widen if empty - enhanced for old dates
  if (!items.length) {
    const widened: TavilyPayload = { ...basePayload };
    delete widened.include_domains;
    // For old dates, also remove time_range completely to maximize results
    if (daysFromToday > 365) {
      delete widened.time_range;
    }
    
    data = await run(widened);
    mapped = (data.results || []).map((r, i): NewsArticle => {
      const publishedAt = r.published_date ? new Date(r.published_date).toISOString() : new Date().toISOString();
      const sourceName = guessSourceName(r.url, r.source);
      return {
        id: stableId('tavily', r.url, r.title),
        title: r.title || '',
        description: r.content || r.snippet || 'No description.',
        url: r.url,
        urlToImage: undefined,
        publishedAt,
        source: { name: sourceName },
        category: normalizeCategoryKey(category),
        content: r.snippet || r.content || '',
      };
    });

    items = mapped
      .filter((a) => isLocalOutlet(a.source.name, a.url))
      .filter((a) => withinWindow(a.publishedAt, from, to));
  }

  return dedupeArticles(items).slice(0, pageSize);
}


// Serper types
type SerperNewsItem = {
  title?: string;
  snippet?: string;
  link?: string;
  source?: string;
  date?: string;
  imageUrl?: string;
};
type SerperNewsResponse = { news?: SerperNewsItem[] };

// Serper (Google News)
async function webSearchSerper(
  category: string,
  userQuery?: string | null,
  from?: string | null,
  to?: string | null,
  pageSize: number = 20
): Promise<NewsArticle[]> {
  const key = process.env.SERPER_API_KEY;
  if (!key) throw new Error('Serper API not configured');

  const endpoint = 'https://google.serper.dev/news';
  const siteFilter = PH_DOMAINS.map((d) => `site:${d}`).join(' OR ');
  const q = `${buildCategoryQuery(category, userQuery)} ${siteFilter}`;

  const data = await fetchJsonWithTimeout<SerperNewsResponse>(
    endpoint,
    {
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
    },
    8000
  );

  const mapped: NewsArticle[] = (data.news || []).map((r, i): NewsArticle => {
    const publishedAt = r.date ? new Date(r.date).toISOString() : new Date().toISOString();
    const sourceName = guessSourceName(r.link, r.source);
    return {
      id: stableId('serper', r.link, r.title),
      title: r.title || '',
      description: r.snippet || 'No description.',
      url: r.link,
      urlToImage: r.imageUrl,
      publishedAt,
      source: { name: sourceName },
      category: normalizeCategoryKey(category),
      content: r.snippet || '',
    };
  });

  const items = mapped
    .filter((a) => isLocalOutlet(a.source.name, a.url))
    .filter((a) => withinWindow(a.publishedAt, from, to));

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
  const hasSerper = !!process.env.SERPER_API_KEY;

  const pushByName = (name: string) => {
    if (name === 'tavily' && hasTavily) tryOrder.push(() => webSearchTavily(category, query, from, to, pageSize));
    if (name === 'serper' && hasSerper) tryOrder.push(() => webSearchSerper(category, query, from, to, pageSize));
  };

  if (preferred) pushByName(preferred);
  if (tryOrder.length === 0) {
    if (hasTavily) tryOrder.push(() => webSearchTavily(category, query, from, to, pageSize));
    if (hasSerper) tryOrder.push(() => webSearchSerper(category, query, from, to, pageSize));
  }

  let collected: NewsArticle[] = [];
  let firstError: unknown = null;

  for (const fn of tryOrder) {
    try {
      const res = await fn();
      collected = dedupeArticles([...collected, ...res]);
      if (collected.length) break;
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

// NewsAPI fallback
async function fetchNewsApiBatch(params: URLSearchParams) {
  return fetchJsonWithTimeout<{ articles?: Array<Record<string, unknown>> }>(
    `https://newsapi.org/v2/everything?${params.toString()}`,
    { method: 'GET' },
    8000
  );
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
  if (from) commonParams.from = from;
  if (to) commonParams.to = to;

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
    } catch {
      // ignore
    }
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
    .filter((article) => {
      const url = (article.url as string) || '';
      const host = getHostname(url);
      if (EXCLUDE_DOMAINS.includes(host as (typeof EXCLUDE_DOMAINS)[number])) return false;
      return isLocalOutlet((article.source as Record<string, unknown>)?.name as string, url);
    })
    .filter((article) =>
      withinWindow(article.publishedAt as string, from, to)
    )
    .map((article): NewsArticle => ({
      id: stableId('newsapi', article.url as string, article.title as string),
      title: (article.title as string) || '',
      description: (article.description as string) || '',
      url: article.url as string,
      urlToImage: (article.urlToImage as string) || undefined,
      publishedAt: (article.publishedAt as string) || new Date().toISOString(),
      source: {
        name:
          ((article.source as Record<string, unknown>)?.name as string) ||
          guessSourceName(article.url as string),
      },
      category: normalizeCategoryKey(category),
      content: (article.content as string) || '',
    }));

  items = dedupeArticles(items);
  return items.slice(0, pageSize);
}

// GET handler
export async function GET(request: NextRequest) {
  try {
    const { category, query, from, to, page, pageSize } = parseParams(request);
    const key = makeKey({ category, query, from, to, page, pageSize });
    const cached = getCached(key);
    const trace: string[] = [];

    let articles: NewsArticle[] = [];

    // 1) Gemini (optional)
    const useGeminiSearch = process.env.USE_GEMINI_SEARCH === 'true';
    if (useGeminiSearch) {
      try {
        const geminiItems = await searchWithGemini(category, query, from, to);
        if (geminiItems.length) {
          articles = geminiItems;
          trace.push(`gemini:${articles.length}`);
        }
      } catch (err) {
        console.warn('[Gemini] error:', err);
      }
    }

    // 2) Web search
    if (!articles.length) {
      try {
        const webItems = await searchWithWeb(category, query, from, to, pageSize);
        if (webItems.length) {
          articles = webItems;
          trace.push(`web:${articles.length}`);
        }
      } catch (err) {
        console.warn('[Web] error:', err);
      }
    }

    // 3) NewsAPI fallback
    if (!articles.length) {
      try {
        const newsApiItems = await fallbackNewsAPISearch(category, query, from, to, page, pageSize);
        if (newsApiItems.length) {
          articles = newsApiItems;
          trace.push(`newsapi:${articles.length}`);
        }
      } catch (err) {
        console.warn('[NewsAPI] error:', err);
      }
    }

    // 4) Sticky cache fallback
    if (!articles.length && cached) {
      articles = cached.articles;
      trace.push('cache:hit');
    }

    if (articles.length) {
      setCached(key, articles, trace);
    }

    const payload: NewsResponse = {
      status: 'ok',
      totalResults: articles.length,
      articles,
      providerTrace: articles.length ? trace : cached?.providerTrace || trace,
    };

    return NextResponse.json(payload, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
        Pragma: 'no-cache',
      },
    });
  } catch (error) {
    console.error('Error in corruption news API:', error);
    return NextResponse.json(
      {
        status: 'error',
        totalResults: 0,
        articles: [],
        error: (error as Error)?.message || 'Service unavailable - upstream providers failed',
      },
      {
        status: 502,
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
          Pragma: 'no-cache',
        },
      }
    );
  }
}

// Gemini endpoint builder
function getGeminiEndpoint() {
  const base = process.env.GEMINI_API_BASE || 'https://generativelanguage.googleapis.com';
  const version = process.env.GEMINI_API_VERSION || 'v1beta';
  const model = process.env.GEMINI_MODEL || 'gemini-1.5-flash'; // e.g. gemini-pro, gemini-1.5-flash
  return `${base}/${version}/models/${model}:generateContent`;
}