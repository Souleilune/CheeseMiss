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
  const q =
    category === 'all'
      ? 'Philippines corruption DPWH flood control politician "ghost project"'
      : base[category as keyof typeof base] || base['corrupt-politicians'];
  return userQuery ? `${q} ${userQuery}` : q;
}

// Normalize category (avoid writing invalid "all" into items)
function normalizeCategoryKey(cat: string): NewsArticle['category'] {
  const allowed = new Set<NewsArticle['category']>([
    'flood-control',
    'dpwh',
    'corrupt-politicians',
    'nepo-babies',
  ]);
  return (allowed.has(cat as any) ? (cat as any) : 'corrupt-politicians') as NewsArticle['category'];
}

// Gemini prompt — PH-only, mix recent + older references
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
    const date = get('DATE') || '';

    if (!title) continue;
    if (!url) {
      const urlMatch = block.match(/https?:\/\/[^\s)]+/);
      if (urlMatch) url = urlMatch[0];
    }

    // Normalize date safely
    let publishedAt: string;
    try {
      const dateObj = new Date(date);
      if (isNaN(dateObj.getTime())) throw new Error('Invalid date');
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
      id: `gemini_${Buffer.from((url || title).slice(0, 80)).toString('base64')}`,
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

// Gemini search (parsing + PH filter + date window)
async function searchWithGemini(
  category: string,
  query?: string | null,
  from?: string | null,
  to?: string | null
): Promise<NewsArticle[]> {
  const apiKey = process.env.GEMINI_API_KEY;
  const configuredUrl = process.env.GEMINI_API_URL; // optional full :generateContent path
  if (!apiKey) throw new Error('Gemini API key missing');

  const url = `${configuredUrl || getGeminiEndpoint()}?key=${apiKey}`;
  const prompt = getGeminiSearchPrompt(
    category,
    query || undefined,
    from || undefined,
    to || undefined
  );
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

  const data = (await response.json().catch(() => ({}))) as any;
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
  let items = parseGeminiResponse(text, category);

  // Respect date window
  items = items.filter((a) => withinWindow(a.publishedAt, from, to));

  // If nothing returned, throw to trigger web/NewsAPI fallback
  if (items.length === 0) {
    throw new Error('Gemini returned no items');
  }

  return items.slice(0, 15);
}

// WEB SEARCH PROVIDERS

// 1) Tavily
async function webSearchTavily(
  category: string,
  userQuery?: string | null,
  from?: string | null,
  to?: string | null,
  pageSize: number = 20
): Promise<NewsArticle[]> {
  const key = process.env.TAVILY_API_KEY;
  if (!key) throw new Error('Tavily API not configured');

  // Valid values: 'day' | 'week' | 'month' | 'year'
  let time_range: 'day' | 'week' | 'month' | 'year' | undefined = undefined;
  if (from || to) {
    const start = from ? new Date(from).getTime() : Date.now() - 365 * 24 * 60 * 60 * 1000;
    const end = to ? new Date(to).getTime() : Date.now();
    const spanDays = Math.max(1, Math.round((end - start) / (24 * 60 * 60 * 1000)));
    if (spanDays <= 7) time_range = 'week';
    else if (spanDays <= 31) time_range = 'month';
    else time_range = 'year';
  }

  const query = buildCategoryQuery(category, userQuery);

  const payload: Record<string, unknown> = {
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

  const data = (await res.json()) as { results?: Array<Record<string, unknown>> };

  const mapped: NewsArticle[] = (data.results || []).map(
    (r: Record<string, unknown>, i: number): NewsArticle => {
        const publishedAt = (r.published_date as string)
        ? new Date(r.published_date as string).toISOString()
        : new Date().toISOString();
        const sourceName = guessSourceName(r.url as string, r.source as string);
        return {
        id: `tavily_${Date.now()}_${i}`,
        title: r.title as string,
        description: (r.content as string) || (r.snippet as string) || 'No description.',
        url: r.url as string,
        urlToImage: undefined,
        publishedAt,
        source: { name: sourceName },
        category: normalizeCategoryKey(category),
        content: (r.snippet as string) || (r.content as string),
        };
    }
    );

    const items = mapped
    .filter((a: NewsArticle) => isLocalOutlet(a.source.name, a.url))
    .filter((a: NewsArticle) => withinWindow(a.publishedAt, from, to));

    return dedupeArticles(items).slice(0, pageSize);
}

// 2) Serper.dev (Google News)
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

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Serper responded with ${res.status}${errText ? `: ${errText}` : ''}`);
  }
  const data = await res.json();

  const mapped: NewsArticle[] = (data?.news || []).map(
    (r: Record<string, unknown>, i: number): NewsArticle => {
        const publishedAt = (r.date as string)
        ? new Date(r.date as string).toISOString()
        : new Date().toISOString();
        const sourceName = guessSourceName(r.link as string, r.source as string);

        return {
        id: `serper_${Date.now()}_${i}`,
        title: r.title as string,
        description: (r.snippet as string) || 'No description.',
        url: r.link as string,
        urlToImage: (r as any).imageUrl as string,
        publishedAt,
        source: { name: sourceName },
        category: normalizeCategoryKey(category),
        content: r.snippet as string,
        };
    }
    );

    const items = mapped
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
  const hasSerper = !!process.env.SERPER_API_KEY;

  const pushByName = (name: string) => {
    if (name === 'tavily' && hasTavily) {
      tryOrder.push(() => webSearchTavily(category, query, from, to, pageSize));
    }
    if (name === 'serper' && hasSerper) {
      tryOrder.push(() => webSearchSerper(category, query, from, to, pageSize));
    }
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
  return response.json() as Promise<{ articles?: Array<Record<string, unknown>> }>;
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
    .filter((article: Record<string, unknown>) => {
      const url = (article.url as string) || '';
      const host = getHostname(url);
      if (EXCLUDE_DOMAINS.includes(host)) return false;
      return isLocalOutlet((article.source as Record<string, unknown>)?.name as string, url);
    })
    .filter((article: Record<string, unknown>) =>
      withinWindow(article.publishedAt as string, from, to)
    )
    .map((article: Record<string, unknown>, index: number) => ({
      id: `newsapi_${Date.now()}_${index}`,
      title: article.title as string,
      description: article.description as string,
      url: article.url as string,
      urlToImage: article.urlToImage as string,
      publishedAt: article.publishedAt as string,
      source: {
        name:
          ((article.source as Record<string, unknown>)?.name as string) ||
          guessSourceName(article.url as string),
      },
      category: normalizeCategoryKey(category),
      content: article.content as string,
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

    // Return error (no mock fallback)
    return NextResponse.json(
      {
        status: 'error',
        totalResults: 0,
        articles: [],
        error:
          (error as Error)?.message ||
          'Service unavailable - upstream providers failed',
      },
      { status: 502 }
    );
  }
}

function getGeminiEndpoint() {
  const base = process.env.GEMINI_API_BASE || 'https://generativelanguage.googleapis.com';
  const version = process.env.GEMINI_API_VERSION || 'v1beta';
  const model = process.env.GEMINI_MODEL || 'gemini-1.5-flash'; // e.g. gemini-pro, gemini-1.5-flash, gemini-1.5-flash-8b
  return `${base}/${version}/models/${model}:generateContent`;
}