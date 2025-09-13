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

// Philippine RSS Feeds - All FREE!
const PH_RSS_FEEDS = [
  // Tier 1: High Priority Sources
  {
    url: 'https://www.rappler.com/rss/',
    source: 'Rappler',
    priority: 1,
    categories: ['corrupt-politicians', 'nepo-babies', 'dpwh', 'flood-control'] // All categories
  },
  {
    url: 'https://newsinfo.inquirer.net/rss.xml',
    source: 'Philippine Daily Inquirer',
    priority: 1,
    categories: ['dpwh', 'corrupt-politicians', 'nepo-babies', 'flood-control'] // All categories
  },
  {
    url: 'https://www.gmanetwork.com/news/rss/',
    source: 'GMA News',
    priority: 1,
    categories: ['nepo-babies', 'dpwh', 'corrupt-politicians', 'flood-control'] // All categories
  },

  // Tier 2: Major Sources
  {
    url: 'https://www.philstar.com/rss/headlines',
    source: 'Philippine Star',
    priority: 2,
    categories: ['flood-control', 'nepo-babies', 'dpwh', 'corrupt-politicians'] // All categories
  },
  {
    url: 'https://mb.com.ph/feed/',
    source: 'Manila Bulletin',
    priority: 2,
    categories: ['corrupt-politicians', 'flood-control', 'dpwh', 'nepo-babies'] // All categories
  },
  {
    url: 'https://www.manilatimes.net/feed/',
    source: 'The Manila Times',
    priority: 2,
    categories: ['corrupt-politicians', 'dpwh', 'nepo-babies', 'flood-control'] // All categories
  },
  
  // Tier 3: Additional Sources
  {
    url: 'https://tribune.net.ph/feed/',
    source: 'Daily Tribune',
    priority: 3,
    categories: ['dpwh', 'flood-control', 'corrupt-politicians', 'nepo-babies'] // All categories
  },
  {
    url: 'https://manilastandard.net/rss.xml',
    source: 'Manila Standard',
    priority: 3,
    categories: ['corrupt-politicians', 'dpwh', 'nepo-babies', 'flood-control'] // All categories
  },
  {
    url: 'https://www.sunstar.com.ph/rss',
    source: 'SunStar',
    priority: 3,
    categories: ['corrupt-politicians', 'flood-control', 'dpwh', 'nepo-babies'] // All categories
  },
  {
    url: 'https://businessworldonline.com/feed/',
    source: 'BusinessWorld Philippines',
    priority: 3,
    categories: ['corrupt-politicians', 'dpwh', 'nepo-babies', 'flood-control'] // All categories
  },

  // Tier 4: Regional/Specialized Sources
  {
    url: 'https://www.pna.gov.ph/rss.xml',
    source: 'Philippine News Agency (PNA)',
    priority: 4,
    categories: ['corrupt-politicians', 'dpwh', 'flood-control', 'nepo-babies'] // All categories
  },
  {
    url: 'https://onenews.ph/feed',
    source: 'One News PH',
    priority: 4,
    categories: ['corrupt-politicians', 'nepo-babies', 'dpwh', 'flood-control'] // All categories
  },
  {
    url: 'https://interaksyon.philstar.com/feed/',
    source: 'Interaksyon',
    priority: 4,
    categories: ['corrupt-politicians', 'nepo-babies', 'dpwh', 'flood-control'] // All categories
  },
  {
    url: 'https://www.cnnphilippines.com/rss/news.xml',
    source: 'CNN Philippines',
    priority: 2,
    categories: ['corrupt-politicians', 'dpwh', 'nepo-babies', 'flood-control'] // All categories
  },
  {
    url: 'https://news.abs-cbn.com/rss',
    source: 'ABS-CBN News',
    priority: 2,
    categories: ['corrupt-politicians', 'nepo-babies', 'dpwh', 'flood-control'] // All categories
  }
];

const ADDITIONAL_OPINION_FEEDS = [
  // PhilStar Opinion/Editorial sections
  {
    url: 'https://www.philstar.com/rss/opinion',
    source: 'Philippine Star Opinion',
    priority: 2,
    categories: ['corrupt-politicians', 'nepo-babies', 'dpwh', 'flood-control']
  },
  {
    url: 'https://www.philstar.com/rss/editorials',
    source: 'Philippine Star Editorial',
    priority: 2,
    categories: ['corrupt-politicians', 'nepo-babies', 'dpwh', 'flood-control']
  },
  
  // Other Opinion sections
  {
    url: 'https://www.rappler.com/rss/thought-leaders/',
    source: 'Rappler Thought Leaders',
    priority: 2,
    categories: ['corrupt-politicians', 'nepo-babies', 'dpwh', 'flood-control']
  },
  {
    url: 'https://newsinfo.inquirer.net/category/opinion/rss',
    source: 'Inquirer Opinion',
    priority: 2,
    categories: ['corrupt-politicians', 'nepo-babies', 'dpwh', 'flood-control']
  },
  {
    url: 'https://mb.com.ph/category/opinion/feed/',
    source: 'Manila Bulletin Opinion',
    priority: 2,
    categories: ['corrupt-politicians', 'nepo-babies', 'dpwh', 'flood-control']
  },
  
  // Alternative PhilStar feeds
  {
    url: 'https://www.philstar.com/feed/',
    source: 'Philippine Star All',
    priority: 3,
    categories: ['corrupt-politicians', 'nepo-babies', 'dpwh', 'flood-control']
  },
  {
    url: 'https://www.philstar.com/rss/news',
    source: 'Philippine Star News',
    priority: 2,
    categories: ['corrupt-politicians', 'nepo-babies', 'dpwh', 'flood-control']
  }
];

// Corruption detection keywords by category
const UPDATED_CORRUPTION_KEYWORDS = {
  'corrupt-politicians': [
    'corrupt', 'corruption', 'plunder', 'malversation', 'kickback', 'bribery',
    'ghost employee', 'anomalous', 'ombudsman', 'sandiganbayan', 'swiss bank',
    'unexplained wealth', 'lifestyle check', 'saln', 'pork barrel', 'pdaf',
    'graft', 'impeachment', 'plunder case', 'arrested mayor', 'arrested governor',
    'anti-graft', 'comelec', 'pcgg', 'marcos wealth', 'hidden assets'
  ],
  'dpwh': [
    'dpwh', 'ghost project', 'overpriced', 'infrastructure scam', 'road project',
    'bridge anomaly', 'kickback', 'contractor', 'bid rigging', 'coa audit',
    'public works', 'highway corruption', 'construction fraud', 'fake invoice',
    'substandard materials', 'build build build', 'infrastructure corruption',
    'procurement anomaly', 'contract irregularity', 'project overrun'
  ],
  'flood-control': [
    'flood control', 'dike', 'embankment', 'drainage', 'ghost project',
    'substandard', 'flood mitigation', 'pumping station', 'river dredging',
    'flood management', 'waterway', 'flood infrastructure', 'dam project',
    'retaining wall', 'spillway', 'watershed', 'flood prone', 'sea wall',
    'storm surge', 'flood prevention'
  ],
  'nepo-babies': [
    // ENHANCED: Use the expanded keywords list
    'political dynasty', 'nepo baby', 'nepo babies', 'politician son', 'politician daughter',
    'luxury car', 'expensive', 'lamborghini', 'ferrari', 'penthouse',
    'shopping spree', 'instagram', 'tiktok', 'lavish lifestyle', 'family wealth',
    
    // Specific names
    'claudine co', 'gela marasigan', 'gela alonte', 'vern enciso', 'verniece enciso',
    'jammy cruz', 'jasmine chan', 'christine lim',
    
    // CRITICAL: Opinion/Editorial specific terms for the missing article
    'canceled nepo babies', 'cancel nepo babies', 'nepo baby culture',
    'political family', 'dynasty politics', 'inherited power', 'family politics',
    'privileged youth', 'political heir', 'born into politics', 'political bloodline',
    
    // Social media luxury indicators
    'designer', 'brand new', 'luxury lifestyle', 'expensive taste', 'wealthy family',
    'private school', 'exclusive', 'high-end', 'premium', 'lavish', 'extravagant',
    
    // Additional terms that might appear in opinion pieces
    'politician family', 'mayor son', 'governor daughter', 'congressman son', 'senator daughter',
    'luxury watch', 'designer bag', 'private jet', 'yacht', 'mansion',
    'exclusive school', 'abroad vacation', 'expensive jewelry', 'brand new car',
    'lavish wedding', 'luxury hotel', 'five star', 'first class flight'
  ]
};

const ENHANCED_NEPO_KEYWORDS = [
  // Original keywords
  'political dynasty', 'nepo baby', 'nepo babies', 'politician son', 'politician daughter',
  'luxury car', 'expensive', 'lamborghini', 'ferrari', 'penthouse',
  'shopping spree', 'instagram', 'tiktok', 'lavish lifestyle', 'family wealth',
  
  // Specific names
  'claudine co', 'gela marasigan', 'gela alonte', 'vern enciso', 'verniece enciso',
  'jammy cruz', 'jasmine chan', 'christine lim',
  
  // Opinion/Editorial specific terms
  'canceled nepo babies', 'cancel nepo babies', 'nepo baby culture',
  'political family', 'dynasty politics', 'inherited power', 'family politics',
  'privileged youth', 'political heir', 'born into politics', 'political bloodline',
  
  // Social media luxury indicators
  'designer', 'brand new', 'luxury lifestyle', 'expensive taste', 'wealthy family',
  'private school', 'exclusive', 'high-end', 'premium', 'lavish', 'extravagant'
];

// Cache configuration
type CacheKey = string;
const CACHE_TTL_MS = 300_000; // 5 minutes for RSS feeds
const MAX_CACHE_ENTRIES = 200;
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
    const oldestKey = Array.from(memoryCache.entries())
      .sort(([,a], [,b]) => a.ts - b.ts)[0][0];
    memoryCache.delete(oldestKey);
  }
}

// Utility functions
const withinWindow = (iso: string, from?: string | null, to?: string | null) => {
  if (!from && !to) return true;
  
  const articleTime = new Date(iso).getTime();
  if (isNaN(articleTime)) return true;
  
  if (from) {
    const fromTime = new Date(from).getTime();
    if (!isNaN(fromTime) && articleTime < fromTime) return false;
  }
  
  if (to) {
    const toTime = new Date(to).getTime();
    if (!isNaN(toTime) && articleTime > toTime) return false;
  }
  
  return true;
};

function stableId(prefix: string, url?: string, fallbackKey?: string) {
  const key = url || fallbackKey || Math.random().toString(36);
  const hash = createHash('sha1').update(key).digest('hex').slice(0, 16);
  return `${prefix}_${hash}`;
}

function dedupeArticles(items: NewsArticle[]) {
  const seen = new Set<string>();
  const unique: NewsArticle[] = [];
  
  for (const item of items) {
    const key = `${item.title.toLowerCase().trim()}_${item.source.name}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(item);
    }
  }
  
  return unique;
}

// FIXED: RSS Parser Function (ES2017 compatible regex)
async function parseRSSFeed(
  feedUrl: string, 
  sourceName: string, 
  targetCategory?: string
): Promise<NewsArticle[]> {
  try {
    console.log(`[RSS] Fetching ${sourceName}...`);
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000); // Increased timeout
    
    const response = await fetch(feedUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; NewsAggregator/1.0)',
        'Accept': 'application/rss+xml, application/xml, text/xml, application/atom+xml'
      },
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const xmlText = await response.text();
    const itemRegex = /<(?:item|entry)[^>]*>([\s\S]*?)<\/(?:item|entry)>/gi;
    const itemMatches = Array.from(xmlText.matchAll(itemRegex));
    
    const articles: NewsArticle[] = [];
    
    // Process more articles to get better coverage
    for (const match of itemMatches.slice(0, 100)) { // Increased from 50 to 100
      const itemContent = match[1];
      
      // Extract title (handle CDATA)
      const titleMatch = itemContent.match(/<title[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i);
      const title = titleMatch?.[1]?.trim().replace(/<[^>]+>/g, '') || '';
      
      // Extract description/summary
      const descMatch = itemContent.match(/<(?:description|summary|content)[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/(?:description|summary|content)>/i);
      let description = descMatch?.[1]?.trim().replace(/<[^>]+>/g, '') || '';
      
      // Clean and expand description
      description = description.substring(0, 800).trim(); // Increased from 500
      if (description.length === 800) description += '...';
      
      // Extract link
      const linkMatch = itemContent.match(/<link[^>]*>([^<]*)<\/link>|<link[^>]*href=["']([^"']*)/i);
      const link = (linkMatch?.[1] || linkMatch?.[2] || '').trim();
      
      // Extract date
      const dateMatch = itemContent.match(/<(?:pubDate|published|updated)[^>]*>(.*?)<\/(?:pubDate|published|updated)>/i);
      const dateText = dateMatch?.[1]?.trim() || '';
      
      if (!title || !link) continue;
      
      // Parse publication date
      let publishedAt = new Date().toISOString();
      if (dateText) {
        try {
          const parsedDate = new Date(dateText);
          if (!isNaN(parsedDate.getTime())) {
            publishedAt = parsedDate.toISOString();
          }
        } catch {
          // Use current date if parsing fails
        }
      }
      
      // Enhanced corruption detection
      const contentToCheck = `${title} ${description}`;
      const detection = isCorruptionRelated(contentToCheck, targetCategory);
      
      if (!detection.isRelevant) continue;
      
      // Skip if looking for specific category and this doesn't match
      if (targetCategory && targetCategory !== 'all' && 
          detection.detectedCategory !== targetCategory && detection.score < 2) {
        continue;
      }
      
      articles.push({
        id: stableId('rss', link, title),
        title,
        description: description || 'No description available.',
        url: link,
        publishedAt,
        source: { name: sourceName },
        category: detection.detectedCategory,
        content: description
      });
    }
    
    console.log(`[RSS] ${sourceName}: Found ${articles.length} relevant articles`);
    return articles;
    
  } catch (error) {
    console.warn(`[RSS] Failed to parse ${sourceName}:`, error);
    return [];
  }
}

// Main RSS Search Function
async function searchWithRSS(
  category: string,
  query?: string | null,
  from?: string | null,
  to?: string | null,
  pageSize: number = 20
): Promise<NewsArticle[]> {
  console.log(`[RSS] Starting search for category: ${category}`);
  
  // FIXED: Merge main feeds with additional opinion feeds
  const allFeeds = [...PH_RSS_FEEDS, ...ADDITIONAL_OPINION_FEEDS];
  const feedsToUse = allFeeds.sort((a, b) => a.priority - b.priority);
  
  console.log(`[RSS] Using ${feedsToUse.length} total feeds (including opinion sections)`);
  
  // Limit concurrent requests to avoid overwhelming servers
  const maxConcurrent = 5;
  const feedBatches: typeof feedsToUse[] = [];
  
  for (let i = 0; i < feedsToUse.length; i += maxConcurrent) {
    feedBatches.push(feedsToUse.slice(i, i + maxConcurrent));
  }
  
  let allArticles: NewsArticle[] = [];
  
  // Process feeds in batches
  for (const batch of feedBatches) {
    const batchPromises = batch.map(feed => 
      parseRSSFeed(feed.url, feed.source, category !== 'all' ? category : undefined)
    );
    
    const batchResults = await Promise.allSettled(batchPromises);
    
    batchResults.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        allArticles.push(...result.value);
        console.log(`[RSS] ${batch[index].source}: ${result.value.length} articles`);
      } else {
        console.warn(`[RSS] ${batch[index].source}: ${result.reason}`);
      }
    });
    
    // Small delay between batches to be respectful to servers
    if (feedBatches.indexOf(batch) < feedBatches.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  
  console.log(`[RSS] Total articles before filtering: ${allArticles.length}`);
  
  // Filter by category if specified
  if (category && category !== 'all') {
    allArticles = allArticles.filter(article => article.category === category);
    console.log(`[RSS] After category filter (${category}): ${allArticles.length}`);
  }
  
  // Filter by query
  if (query) {
    const queryLower = query.toLowerCase();
    allArticles = allArticles.filter(article => 
      article.title.toLowerCase().includes(queryLower) ||
      article.description.toLowerCase().includes(queryLower)
    );
    console.log(`[RSS] After query filter (${query}): ${allArticles.length}`);
  }
  
  // Filter by date range
  if (from || to) {
    allArticles = allArticles.filter(article => 
      withinWindow(article.publishedAt, from, to)
    );
    console.log(`[RSS] After date filter: ${allArticles.length}`);
  }
  
  // Remove duplicates
  allArticles = dedupeArticles(allArticles);
  console.log(`[RSS] After deduplication: ${allArticles.length}`);
  
  // Sort by relevance score first, then by date
  allArticles.sort((a, b) => {
    const aContent = `${a.title} ${a.description}`.toLowerCase();
    const bContent = `${b.title} ${b.description}`.toLowerCase();
    
    const aScore = isCorruptionRelated(aContent).score;
    const bScore = isCorruptionRelated(bContent).score;
    
    if (aScore !== bScore) {
      return bScore - aScore; // Higher score first
    }
    
    // Then sort by date (newest first)
    return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
  });
  
  console.log(`[RSS] Final filtered results: ${allArticles.length} articles`);
  return allArticles.slice(0, pageSize);
}

// ENHANCED: Better keyword matching for specific names
const SPECIFIC_NAMES = [
  'claudine co',
  'gela marasigan', 
  'gela alonte',
  'vern enciso',
  'verniece enciso', 
  'jammy cruz',
  'jasmine chan',
  'christine lim'
];

// Enhanced corruption detection with name variants
function isCorruptionRelated(content: string, targetCategory?: string): { 
  isRelevant: boolean; 
  detectedCategory: NewsArticle['category']; 
  score: number;
} {
  const contentLower = content.toLowerCase();
  
  const categoryScores: Record<string, number> = {
    'corrupt-politicians': 0,
    'dpwh': 0,
    'flood-control': 0,
    'nepo-babies': 0
  };
  
  // Special handling for the missing article pattern
  if (contentLower.includes('cancel') && contentLower.includes('nepo')) {
    categoryScores['nepo-babies'] += 5; // High score for "canceled nepo babies"
  }
  
  // Check against all category keywords
  Object.entries(UPDATED_CORRUPTION_KEYWORDS).forEach(([category, keywords]) => {
    keywords.forEach(keyword => {
      const keywordLower = keyword.toLowerCase();
      
      // Exact match
      if (contentLower.includes(keywordLower)) {
        categoryScores[category] += 1;
        
        // Extra bonus for multi-word phrases
        if (keywordLower.includes(' ') && keywordLower.length > 8) {
          categoryScores[category] += 1;
        }
        
        // Specific name bonus
        if (['claudine co', 'gela marasigan', 'gela alonte', 'vern enciso', 
             'verniece enciso', 'jammy cruz', 'jasmine chan', 'christine lim'].includes(keywordLower)) {
          categoryScores[category] += 3;
        }
        
        // Key corruption terms bonus
        if (['corruption', 'plunder', 'ghost project', 'kickback', 'malversation', 'dpwh'].includes(keywordLower)) {
          categoryScores[category] += 2;
        }
      }
      
      // Partial matching for names
      if (category === 'nepo-babies') {
        const nameParts = keywordLower.split(' ');
        if (nameParts.length >= 2) {
          const allPartsPresent = nameParts.every(part => contentLower.includes(part));
          if (allPartsPresent) {
            categoryScores[category] += 2;
          }
        }
      }
    });
  });
  
  // Find highest scoring category
  const maxScore = Math.max(...Object.values(categoryScores));
  const detectedCategory = Object.keys(categoryScores).find(
    cat => categoryScores[cat] === maxScore
  ) as NewsArticle['category'] || 'corrupt-politicians';
  
  // Even lower threshold for opinion pieces
  const isRelevant = maxScore >= 1;
  
  return {
    isRelevant,
    detectedCategory,
    score: maxScore
  };
}

// BONUS: Add environment variable control for feed selection
function getActiveFeedsFromConfig(): typeof PH_RSS_FEEDS {
  const enabledFeeds = PH_RSS_FEEDS.filter(feed => {
    // Allow environment variables to disable specific feeds
    const envKey = `ENABLE_${feed.source.toUpperCase().replace(/[^A-Z]/g, '_')}`;
    const isEnabled = process.env[envKey];
    
    // Default to enabled if no env var set
    return isEnabled !== 'false';
  });
  
  return enabledFeeds.length > 0 ? enabledFeeds : PH_RSS_FEEDS;
}

// Parameter parsing
function parseParams(req: NextRequest) {
  const sp = new URL(req.url).searchParams;
  
  const rawCategory = sp.get('category') || 'all';
  const validCategories = ['all', 'flood-control', 'dpwh', 'corrupt-politicians', 'nepo-babies'];
  const category = validCategories.includes(rawCategory) ? rawCategory : 'all';
  
  const query = sp.get('q');
  const from = sp.get('from');
  const to = sp.get('to');
  
  // Validate ISO dates
  const isValidISODate = (dateStr: string | null): boolean => {
    if (!dateStr) return false;
    const date = new Date(dateStr);
    return !isNaN(date.getTime());
  };
  
  const fromIso = isValidISODate(from) ? from : null;
  const toIso = isValidISODate(to) ? to : null;
  
  const page = Math.max(1, parseInt(sp.get('page') || '1') || 1);
  const pageSize = Math.min(50, Math.max(1, parseInt(sp.get('pageSize') || '20') || 20));
  
  return { category, query, from: fromIso, to: toIso, page, pageSize };
}

// Main GET Handler
export async function GET(request: NextRequest) {
  try {
    const { category, query, from, to, page, pageSize } = parseParams(request);
    const key = makeKey({ category, query, from, to, page, pageSize });
    const cached = getCached(key);
    
    // Return cached results if available
    if (cached) {
      console.log(`[CACHE] Returning cached results: ${cached.articles.length} articles`);
      return NextResponse.json({
        status: 'ok',
        totalResults: cached.articles.length,
        articles: cached.articles,
        providerTrace: [...cached.providerTrace, 'cache:hit']
      });
    }
    
    const trace: string[] = [];
    let articles: NewsArticle[] = [];
    
    // Use RSS as primary source (it's free!)
    try {
      articles = await searchWithRSS(category, query, from, to, pageSize);
      if (articles.length > 0) {
        trace.push(`rss:${articles.length}`);
      }
    } catch (error) {
      console.error('[RSS] Search failed:', error);
      trace.push('rss:failed');
    }
    
    // Cache successful results
    if (articles.length > 0) {
      setCached(key, articles, trace);
    }
    
    const response: NewsResponse = {
      status: 'ok',
      totalResults: articles.length,
      articles,
      providerTrace: trace
    };
    
    return NextResponse.json(response, {
      headers: {
        'Cache-Control': 'public, max-age=300, s-maxage=300',
        'X-Source': 'rss-feeds',
        'X-Articles-Found': articles.length.toString()
      }
    });
    
  } catch (error) {
    console.error('[API] Fatal error:', error);
    
    return NextResponse.json({
      status: 'error',
      totalResults: 0,
      articles: [],
      error: 'RSS feed processing failed',
      providerTrace: ['error:fatal']
    }, { 
      status: 500,
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate'
      }
    });
  }
}