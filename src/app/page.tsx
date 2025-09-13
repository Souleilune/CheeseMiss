'use client';

import React, { useEffect, useMemo, useState, useCallback } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  Search,
  Heart,
  Share2,
  MessageCircle,
  X,
  Bookmark,
  ArrowUp,
  AlertCircle,
  RefreshCw,
  Waves,
  Hammer,
  Scale,
  Crown,
  Newspaper,
  ChevronLeft,
  ChevronRight,
  Calendar,
  FileText,      // For TLDR button
  Zap,          // For TLDR icon
  ExternalLink,
  Check,
  Copy  // For read more button
} from 'lucide-react';

const FALLBACK_IMAGE =
  'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=1200&h=800&fit=crop';

type Article = {
  id: number | string;
  title: string;
  description: string;
  urlToImage?: string;
  publishedAt: string;
  source: { name: string };
  category: 'flood-control' | 'dpwh' | 'corrupt-politicians' | 'nepo-babies';
  url?: string;
  content?: string;
};

interface ApiResponse {
  status: string;
  totalResults: number;
  articles: Article[];
  fallback?: boolean;
  error?: string;
}

interface ErrorState {
  message: string;
  isRetryable: boolean;
}

type CategoryKey = 'all' | 'favorites' | Article['category'];

// Date helpers
const msPerDay = 24 * 60 * 60 * 1000;
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const endOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
const toDateInputValue = (d: Date) => {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const toLabel = (d: Date) =>
  d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

const CheeseMiss = () => {
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ErrorState | null>(null);
  const [retrying, setRetrying] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<CategoryKey>('all');

  // Selected day stored as toDateString to avoid time drift issues
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const [favorites, setFavorites] = useState<(number | string)[]>([]);
  const [selectedArticle, setSelectedArticle] = useState<Article | null>(null);

  const [showScrollTop, setShowScrollTop] = useState(false);
  const [readProgress, setReadProgress] = useState(0);
  const [isFallbackMode, setIsFallbackMode] = useState(false);

  // Day scroller window state
  const WINDOW_SIZE = 14; // days visible per window
  const [windowOffset, setWindowOffset] = useState(0); // 0 = includes today; grows older by WINDOW_SIZE steps

  // Categories using lucide icons
  const categories: { key: CategoryKey; label: string; icon: LucideIcon }[] = [
    { key: 'all', label: 'All News', icon: Newspaper },
    { key: 'flood-control', label: 'Flood Control', icon: Waves },
    { key: 'dpwh', label: 'DPWH', icon: Hammer },
    { key: 'corrupt-politicians', label: 'Corrupt Politicians', icon: Scale },
    { key: 'nepo-babies', label: 'Nepo Babies', icon: Crown },
    { key: 'favorites', label: 'Favorites', icon: Heart },
  ];

  // API function to fetch news (now supports optional from/to params for day filtering)
  const fetchNews = useCallback(
    async (opts: {
      category?: string;
      query?: string;
      from?: string;
      to?: string;
      retryAttempt?: number;
    }): Promise<ApiResponse> => {
      const { category, query, from, to } = opts || {};
      const params = new URLSearchParams();

      if (category && category !== 'all' && category !== 'favorites') {
        params.append('category', category);
      }
      if (query) params.append('q', query);
      if (from) params.append('from', from);
      if (to) params.append('to', to);

      // These are harmless if your backend ignores them
      params.append('country', 'ph');
      params.append('language', 'en');
      params.append('pageSize', '20');

      const response = await fetch(`/api/news?${params.toString()}`);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = errorData.error || `HTTP ${response.status}`;
        const isRetryable = response.status >= 500 || response.status === 429;

        throw new Error(
          JSON.stringify({
            message: errorMessage,
            isRetryable,
            status: response.status,
          })
        );
      }

      return response.json();
    },
    []
  );

  // Load news (stable function, params in call sites)
  const loadNews = useCallback(
    async (opts: {
      category?: string;
      query?: string;
      from?: string;
      to?: string;
      retryAttempt?: number;
    } = {}) => {
      try {
        setError(null);
        setLoading(true);

        const response = await fetchNews(opts);

        setArticles(response.articles || []);
        setIsFallbackMode(!!response.fallback);

        if (response.fallback) {
          console.log('Using fallback data:', response.error);
        }
      } catch (err) {
        console.error('Error loading news:', err);

        try {
          const errorInfo = JSON.parse((err as Error).message);
          setError({
            message: errorInfo.message || 'Failed to load news',
            isRetryable: errorInfo.isRetryable || false,
          });
        } catch {
          setError({
            message: 'Network error. Please check your connection.',
            isRetryable: true,
          });
        }
      } finally {
        setLoading(false);
        setRetrying(false);
      }
    },
    [fetchNews]
  );

  // Load news on mount and when filters change (debounced for search)
  useEffect(() => {
    if (selectedCategory === 'favorites') {
      // No network fetch needed for local favorites view
      setLoading(false);
      setError(null);
      return;
    }

    const today = startOfDay(new Date());
    const day = selectedDay ? startOfDay(new Date(selectedDay)) : null;
    const from = day ? startOfDay(day).toISOString() : undefined;
    const to = day ? endOfDay(day).toISOString() : undefined;

    const delay = searchQuery ? 500 : 0;
    const t = setTimeout(() => {
      loadNews({
        category: selectedCategory === 'all' ? undefined : selectedCategory,
        query: searchQuery || undefined,
        from,
        to,
      });
    }, delay);

    return () => clearTimeout(t);
  }, [selectedCategory, selectedDay, searchQuery, loadNews]);

  // Favorites persistence
  useEffect(() => {
    const raw = localStorage.getItem('news:favorites');
    if (raw) {
      try {
        setFavorites(JSON.parse(raw));
      } catch {}
    }
  }, []);
  useEffect(() => {
    localStorage.setItem('news:favorites', JSON.stringify(favorites));
  }, [favorites]);

  // UI listeners for scroll
  useEffect(() => {
    const onScroll = () => {
      setShowScrollTop(window.scrollY > 300);
      if (selectedArticle) {
        const doc = document.documentElement;
        const total = doc.scrollHeight - window.innerHeight;
        const p = total > 0 ? (window.scrollY / total) * 100 : 0;
        setReadProgress(Math.min(100, Math.max(0, p)));
      }
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [selectedArticle]);

  // Filter articles (client-side) for favorites/day (kept for mock data)
  const filteredArticles = useMemo(() => {
    let filtered = articles;

    if (selectedCategory === 'favorites') {
      filtered = filtered.filter((a) => favorites.includes(a.id));
    }

    if (selectedDay) {
      filtered = filtered.filter((a) => {
        const articleDate = new Date(a.publishedAt).toDateString();
        return articleDate === selectedDay;
      });
    }

    return filtered;
  }, [articles, selectedCategory, selectedDay, favorites]);

  // Utilities
  const toggleFavorite = (id: number | string) => {
    setFavorites((prev) => (prev.includes(id) ? prev.filter((fav) => fav !== id) : [...prev, id]));
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));

    if (hours < 1) return 'Just now';
    if (hours < 24) return `${hours}h ago`;
    return date.toLocaleDateString();
  };

  const getReadTime = (text: string) => {
    const words = text.split(' ').length;
    const minutes = Math.max(1, Math.round(words / 200));
    return `${minutes} min read`;
  };

  const handleShare = async (e: React.MouseEvent, article: Article) => {
    e.stopPropagation();
    if (navigator.share && article.url) {
      try {
        await navigator.share({
          title: article.title,
          text: article.description,
          url: article.url,
        });
      } catch {
        if (article.url) navigator.clipboard.writeText(article.url);
      }
    } else if (article.url) {
      navigator.clipboard.writeText(article.url);
    }
  };

  // Category icon and color (for article metadata)
  const getCategoryIcon = (category: string, size = 'w-3 h-3') => {
    switch (category) {
      case 'flood-control':
        return <Waves className={size} />;
      case 'dpwh':
        return <Hammer className={size} />;
      case 'corrupt-politicians':
        return <Scale className={size} />;
      case 'nepo-babies':
        return <Crown className={size} />;
      default:
        return null;
    }
  };

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'flood-control':
        return 'text-blue-600';
      case 'dpwh':
        return 'text-orange-600';
      case 'corrupt-politicians':
        return 'text-red-600';
      case 'nepo-babies':
        return 'text-purple-600';
      default:
        return 'text-gray-600';
    }
  };

  // Day scroller component (Prev/Next + Today + date input)
  const DayScroller = () => {
    const today = startOfDay(new Date());

    // Build window [older ... newer], newest day is today - windowOffset
    const days = Array.from({ length: WINDOW_SIZE }, (_, i) => {
      const dayIndexFromToday = windowOffset + (WINDOW_SIZE - 1 - i);
      const date = new Date(today.getTime() - dayIndexFromToday * msPerDay);
      return date;
    });

    const isFuture = (d: Date) => d.getTime() > today.getTime();
    const articlesDaySet = new Set(articles.map((a) => new Date(a.publishedAt).toDateString()));

    const jumpToDate = (d: Date) => {
      const chosen = startOfDay(d);
      const diffDays = Math.max(0, Math.floor((today.getTime() - chosen.getTime()) / msPerDay));
      // Center chosen day within the window when possible
      const centeredOffset = Math.max(0, diffDays - Math.floor(WINDOW_SIZE / 2));
      setWindowOffset(centeredOffset);
      setSelectedDay(chosen.toDateString());
    };

    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="text-sm font-medium text-gray-700">Browse by day</div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setWindowOffset(windowOffset + WINDOW_SIZE)}
              className="px-2 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700"
              aria-label="Older days"
              title="Older"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => setWindowOffset(Math.max(0, windowOffset - WINDOW_SIZE))}
              className="px-2 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
              aria-label="Newer days"
              title="Newer"
              disabled={windowOffset === 0}
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            <button
              onClick={() => {
                setWindowOffset(0);
                setSelectedDay(today.toDateString());
              }}
              className="px-2.5 py-1.5 rounded-lg bg-red-500 text-white hover:bg-red-600 text-sm"
              title="Jump to today"
            >
              Today
            </button>
            <label className="relative inline-flex items-center gap-2 text-sm text-gray-700">
              <Calendar className="w-4 h-4 text-gray-500" />
              <input
                type="date"
                max={toDateInputValue(today)}
                value={selectedDay ? toDateInputValue(new Date(selectedDay)) : ''}
                onChange={(e) => {
                  if (!e.target.value) return;
                  const [y, m, d] = e.target.value.split('-').map(Number);
                  jumpToDate(new Date(y, m - 1, d));
                }}
                className="appearance-none px-2 py-1.5 border border-gray-200 rounded-lg bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-red-400"
              />
            </label>
          </div>
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1">
          {days.map((d) => {
            const key = d.toDateString();
            const isSelected = selectedDay === key;
            const hasNews = articlesDaySet.has(key);
            const disabled = isFuture(d);

            return (
              <button
                key={key}
                onClick={() => setSelectedDay(isSelected ? null : key)}
                disabled={disabled}
                className={`min-w-[44px] h-11 rounded-lg text-sm font-medium transition-colors
                  ${
                    isSelected
                      ? 'bg-red-500 text-white'
                      : disabled
                      ? 'bg-gray-50 text-gray-400 cursor-not-allowed opacity-60'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }
                  focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400`}
                title={toLabel(d)}
              >
                <div className="w-full h-full grid place-items-center">
                  <div className="flex flex-col items-center leading-none">
                    <span>{d.getDate()}</span>
                    <span
                      className={`mt-1 w-1 h-1 rounded-full ${
                        isSelected ? 'bg-white/90' : hasNews ? 'bg-red-400' : 'bg-transparent'
                      }`}
                    />
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  // Top bar component
  const TopBar = () => {
    const selectedLabel =
      selectedDay ? toLabel(new Date(selectedDay)) : 'All recent days';

    return (
      <div className="bg-white/90 backdrop-blur border-b border-gray-200">
        <div className="max-w-3xl mx-auto px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-gray-900 tracking-tight">
                Cheese Miss
              </span>
              {isFallbackMode && (
                <span className="px-2 py-1 text-xs bg-yellow-100 text-yellow-800 rounded-full">
                  Demo Mode
                </span>
              )}
            </div>
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Para maging politically aware ka search mo..."
                aria-label="Search news"
                className="w-full pl-9 pr-8 py-2.5 rounded-lg border border-gray-200 bg-white text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-red-400"
              />
              {searchQuery && (
                <button
                  aria-label="Clear search"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            <div className="hidden sm:flex items-center gap-3 text-sm text-gray-500">
              <div className="px-2 py-1 rounded bg-gray-100 text-gray-700">{selectedLabel}</div>
              <Bookmark className="w-4 h-4 text-red-500" />
              <span>{favorites.length}</span>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // Error display component
  const ErrorDisplay = () => {
    if (!error) return null;

    return (
      <div className="border border-red-200 rounded-xl bg-red-50 p-6 text-center">
        <div className="mx-auto w-12 h-12 rounded-lg bg-red-100 text-red-600 grid place-items-center mb-3">
          <AlertCircle className="w-6 h-6" />
        </div>
        <div className="font-semibold text-red-900 mb-1">May problema sa pagkuha ng balita</div>
        <div className="text-sm text-red-700 mb-4">{error.message}</div>
        {error.isRetryable && (
          <button
            onClick={async () => {
              setRetrying(true);
              await loadNews({ retryAttempt: 1 });
            }}
            disabled={retrying}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-red-500 text-white hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
          >
            {retrying ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                Sinusubukan ulit...
              </>
            ) : (
              <>
                <RefreshCw className="w-4 h-4" />
                Subukan Ulit
              </>
            )}
          </button>
        )}
      </div>
    );
  };

  // Article card component
  const ArticleCard = ({ article, index }: { article: Article; index: number }) => {
    const isFav = favorites.includes(article.id);
    const [showTldr, setShowTldr] = useState(false);
    const [tldr, setTldr] = useState<string>('');
    const [loadingTldr, setLoadingTldr] = useState(false);
    const [tldrError, setTldrError] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);

    const tldrId = `tldr-${article.id}-${index}`;

    const generateTldr = async () => {
      if (tldr || loadingTldr) return;
      setLoadingTldr(true);
      setTldrError(null);
      try {
        const response = await fetch('/api/tldr', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: article.title,
            description: article.description,
            content: article.content || article.description,
          }),
        });
        if (!response.ok) throw new Error(await response.text().catch(() => ''));
        const data = await response.json();
        setTldr((data?.tldr || '').trim());
        if (!data?.tldr) setTldrError('No summary returned.');
      } catch (error) {
        setTldrError('Failed to generate summary.');
        console.error('TLDR error:', error);
      } finally {
        setLoadingTldr(false);
      }
    };

    const handleToggleTldr = (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!showTldr && !tldr && !tldrError) generateTldr();
      setShowTldr((s) => !s);
    };

    const handleCopy = async (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!tldr) return;
      try {
        await navigator.clipboard.writeText(tldr);
        setCopied(true);
        setTimeout(() => setCopied(false), 900);
      } catch {}
    };

    const tldrLines =
      tldr
        ?.split('\n')
        .map((l: string) => l.trim())
        .filter(Boolean) || [];

    return (
      <div
        className="group border border-gray-200 bg-white rounded-xl overflow-hidden hover:border-gray-300 transition-all duration-200 cursor-pointer"
        onClick={() => setSelectedArticle(article)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && setSelectedArticle(article)}
      >
        <div className="relative">
          <img
            src={article.urlToImage || FALLBACK_IMAGE}
            alt={article.title}
            onError={(e) => ((e.currentTarget as HTMLImageElement).src = FALLBACK_IMAGE)}
            className="w-full h-44 object-cover"
          />
          <button
            onClick={(e) => {
              e.stopPropagation();
              toggleFavorite(article.id);
            }}
            aria-label="Toggle favorite"
            className={`absolute top-3 right-3 w-9 h-9 rounded-lg grid place-items-center transition-colors ${
              isFav
                ? 'bg-red-500 text-white'
                : 'bg-white/90 text-gray-700 hover:bg-red-50 hover:text-red-600'
            }`}
          >
            <Heart className={`w-4 h-4 ${isFav ? 'fill-current' : ''}`} />
          </button>
        </div>

        <div className="p-4">
          {/* Meta */}
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-700">
                {article.source.name}
              </span>
              <span aria-hidden>•</span>
              <span>{formatTime(article.publishedAt)}</span>
              <span aria-hidden>•</span>
              <span className={`flex items-center gap-1 ${getCategoryColor(article.category)}`}>
                {getCategoryIcon(article.category)}
                #{article.category.replace('-', ' ')}
              </span>
            </div>
            <div className="text-xs text-gray-400">#{index + 1}</div>
          </div>

          {/* TL;DR collapsible */}
          <div
            className={`transition-[max-height,opacity] duration-300 ease-out ${
              showTldr ? 'max-h-80 opacity-100' : 'max-h-0 opacity-0'
            } overflow-hidden`}
            id={tldrId}
            aria-hidden={!showTldr}
          >
            <div className="mb-3 rounded-lg border border-red-200 bg-red-50 p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2 text-red-800">
                  <Zap className="w-4 h-4" />
                  <span className="text-[11px] font-semibold uppercase tracking-wide">
                    TL;DR
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  {loadingTldr ? (
                    <span className="inline-flex items-center gap-1 text-[11px] text-red-700">
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      Summarizing…
                    </span>
                  ) : tldr ? (
                    <button
                      onClick={handleCopy}
                      className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] border ${
                        copied
                          ? 'bg-red-600 text-white border-red-600'
                          : 'bg-white text-red-700 border-red-200 hover:bg-red-100'
                      }`}
                      title="Copy summary"
                    >
                      {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      {copied ? 'Copied' : 'Copy'}
                    </button>
                  ) : tldrError ? (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        generateTldr();
                      }}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] bg-white text-red-700 border border-red-200 hover:bg-red-100"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      Retry
                    </button>
                  ) : null}
                </div>
              </div>

              {loadingTldr ? (
                <div className="space-y-2" aria-live="polite">
                  <div className="h-2.5 rounded bg-red-100 animate-pulse" />
                  <div className="h-2.5 rounded bg-red-100 animate-pulse w-11/12" />
                  <div className="h-2.5 rounded bg-red-100 animate-pulse w-9/12" />
                </div>
              ) : tldr ? (
                tldrLines.length > 1 ? (
                  <ul className="ml-5 list-disc text-[13px] text-red-900 leading-relaxed space-y-1">
                    {tldrLines.map((line, idx) => (
                      <li key={idx}>{line}</li>
                    ))}
                  </ul>
                ) : (
                  <p
                    className="text-[13px] text-red-900 leading-relaxed"
                    style={{
                      display: '-webkit-box',
                      WebkitLineClamp: 6,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                    }}
                  >
                    {tldr}
                  </p>
                )
              ) : tldrError ? (
                <div className="flex items-center gap-2 text-red-700">
                  <AlertCircle className="w-4 h-4" />
                  <span className="text-sm">{tldrError}</span>
                </div>
              ) : null}
            </div>
          </div>

          {/* Title */}
          <h3
            className="text-gray-900 font-semibold mb-1 leading-snug hover:text-red-600 transition-colors"
            style={{
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
          >
            {article.title}
          </h3>

          {/* Description */}
          <p
            className="text-gray-600 text-sm"
            style={{
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
          >
            {article.description}
          </p>

          {/* Footer (TL;DR only) */}
          <div className="mt-3 flex items-center justify-between">
            <span className="text-xs text-gray-500 px-2 py-1 rounded-lg bg-gray-50">
              {getReadTime(article.description)}
            </span>

            <button
              onClick={handleToggleTldr}
              aria-controls={tldrId}
              aria-expanded={showTldr}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
                showTldr
                  ? 'bg-red-100 text-red-700'
                  : 'bg-gray-100 text-gray-700 hover:bg-red-50 hover:text-red-700'
              }`}
              title="Toggle TL;DR"
            >
              <FileText className="w-3.5 h-3.5" />
              TL;DR
            </button>
          </div>
        </div>
      </div>
    );
  };

  // Article detail view
  if (selectedArticle) {
    const isFav = favorites.includes(selectedArticle.id);
    return (
      <div className="min-h-screen bg-gray-50">
        {/* Progress bar */}
        <div
          className="fixed top-0 left-0 h-1 bg-red-500 z-50 transition-all duration-150"
          style={{ width: `${readProgress}%` }}
        />

        <TopBar />

        <div className="max-w-2xl mx-auto px-4 py-6">
          <button
            onClick={() => setSelectedArticle(null)}
            className="mb-4 inline-flex items-center gap-2 text-gray-600 hover:text-gray-900"
          >
            <X className="w-4 h-4" />
            Bumalik sa feed
          </button>

          <article className="bg-white rounded-xl overflow-hidden">
            <img
              src={selectedArticle.urlToImage || FALLBACK_IMAGE}
              alt={selectedArticle.title}
              onError={(e) => ((e.currentTarget as HTMLImageElement).src = FALLBACK_IMAGE)}
              className="w-full h-64 object-cover"
            />

            <div className="p-6">
              <div className="flex items-center gap-2 text-sm text-gray-500 mb-4">
                <span className="px-2 py-1 rounded-full bg-gray-100 text-gray-700">
                  {selectedArticle.source.name}
                </span>
                <span>•</span>
                <span>{formatTime(selectedArticle.publishedAt)}</span>
                <span>•</span>
                <span className={`flex items-center gap-1 ${getCategoryColor(selectedArticle.category)}`}>
                  {getCategoryIcon(selectedArticle.category, 'w-3 h-3')}
                  #{selectedArticle.category.replace('-', ' ')}
                </span>
              </div>

              <h1 className="text-2xl font-bold text-gray-900 mb-4 leading-tight">
                {selectedArticle.title}
              </h1>

              <p className="text-gray-700 text-lg leading-relaxed mb-6">
                {selectedArticle.description}
              </p>

              {selectedArticle.url && (
                <a
                  href={selectedArticle.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block px-4 py-2 rounded-lg bg-blue-500 text-white hover:bg-blue-600 text-sm font-medium mb-4"
                >
                  Basahin ang Buong Artikulo
                </a>
              )}

              <div className="flex items-center gap-3 pt-4 border-t border-gray-200">
                <button
                  onClick={() => toggleFavorite(selectedArticle.id)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors
                    ${isFav ? 'bg-red-500 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
                >
                  {isFav ? 'Na-save na sa Favorites' : 'I-save sa Favorites'}
                </button>
                <button
                  onClick={(e) => handleShare(e, selectedArticle)}
                  className="px-4 py-2 rounded-lg text-sm font-medium bg-gray-100 text-gray-700 hover:bg-gray-200"
                >
                  I-share
                </button>
              </div>
            </div>
          </article>
        </div>
      </div>
    );
  }

  // Main list view
  return (
    <div className="min-h-screen bg-gray-50">
      <TopBar />

      {/* Filters */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-3xl mx-auto px-4 py-3 space-y-4">
          {/* Day scroller (infinite back) */}
          <DayScroller />

          {/* Categories */}
          <div className="overflow-x-auto">
            <div className="flex gap-2 pb-1">
              {categories.map((c) => {
                const active = selectedCategory === c.key;
                const Icon = c.icon;
                return (
                  <button
                    key={c.key}
                    onClick={() => setSelectedCategory(c.key)}
                    aria-pressed={active}
                    className={`px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400 flex items-center gap-2
                      ${active ? 'bg-red-500 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
                  >
                    <Icon className="w-4 h-4" />
                    {c.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Quick stats */}
          <div className="flex items-center justify-between text-sm text-gray-500">
            <span>
              {loading ? 'Loading…' : error ? 'May error sa pagkuha ng balita' : `${filteredArticles.length} articles`}
            </span>
            {isFallbackMode && (
              <span className="text-orange-600 text-xs">
                🔄 Demo data (API key needed for live news)
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Feed */}
      <div className="max-w-3xl mx-auto px-4 py-4">
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="border border-gray-200 rounded-xl overflow-hidden bg-white">
                <div className="h-44 bg-gray-200 animate-pulse" />
                <div className="p-4">
                  <div className="h-4 w-2/3 bg-gray-200 rounded mb-2 animate-pulse" />
                  <div className="h-4 w-1/3 bg-gray-200 rounded mb-4 animate-pulse" />
                  <div className="h-8 w-24 bg-gray-200 rounded animate-pulse" />
                </div>
              </div>
            ))}
          </div>
        ) : error ? (
          <ErrorDisplay />
        ) : filteredArticles.length === 0 ? (
          <div className="border border-gray-200 rounded-xl bg-white p-8 text-center">
            <div className="mx-auto w-12 h-12 rounded-lg bg-red-50 text-red-600 grid place-items-center mb-3">
              <Search className="w-6 h-6" />
            </div>
            <div className="font-semibold text-gray-900">Walang nahanap na balita</div>
            <div className="text-sm text-gray-500 mt-1">
              Subukan ang ibang araw, category o search terms.
            </div>
            <div className="flex justify-center gap-2 mt-4">
              <button
                onClick={() => setSearchQuery('')}
                className="px-3 py-1.5 rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 text-sm"
              >
                Clear search
              </button>
              <button
                onClick={() => {
                  setSelectedCategory('all');
                  setSelectedDay(null);
                  setWindowOffset(0);
                }}
                className="px-3 py-1.5 rounded-lg bg-red-500 text-white hover:bg-red-600 text-sm"
              >
                Reset filters
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredArticles.map((a, idx) => (
              <ArticleCard key={a.id} article={a} index={idx} />
            ))}
          </div>
        )}
      </div>

      {/* Scroll-to-top */}
      {showScrollTop && (
        <button
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          aria-label="Scroll to top"
          className="fixed bottom-6 right-6 w-12 h-12 rounded-lg bg-red-500 text-white grid place-items-center shadow-lg hover:bg-red-600"
        >
          <ArrowUp className="w-5 h-5" />
        </button>
      )}
    </div>
  );
};

export default CheeseMiss;