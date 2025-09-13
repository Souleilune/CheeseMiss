'use client';

import React, { useEffect, useMemo, useState, useCallback } from 'react';
import Image from 'next/image';
import type { LucideIcon } from 'lucide-react';
import {
  Search,
  Share2,
  X,
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
// FIXED: Removed unused imports: Heart, MessageCircle, Bookmark

const FALLBACK_IMAGE = 'https://images.unsplash.com/photo-1504711434969-e33886168f5c?w=800&h=600&fit=crop&q=80';

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

type CategoryKey = 'all' | Article['category'];

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

  const [selectedArticle, setSelectedArticle] = useState<Article | null>(null);

  const [showScrollTop, setShowScrollTop] = useState(false);
  const [readProgress, setReadProgress] = useState(0);
  const [isFallbackMode, setIsFallbackMode] = useState(false);

  // Day scroller window state
  const WINDOW_SIZE = 14; // days visible per window
  const [windowOffset, setWindowOffset] = useState(0); // 0 = includes today; grows older by WINDOW_SIZE steps

  // Categories using lucide icons (removed favorites)
  const categories: { key: CategoryKey; label: string; icon: LucideIcon }[] = [
    { key: 'all', label: 'All News', icon: Newspaper },
    { key: 'flood-control', label: 'Flood Control', icon: Waves },
    { key: 'dpwh', label: 'DPWH', icon: Hammer },
    { key: 'corrupt-politicians', label: 'Corrupt Politicians', icon: Scale },
    { key: 'nepo-babies', label: 'Nepo Babies', icon: Crown }
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

      if (category && category !== 'all') {
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
    // FIXED: removed unused 'today' variable
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

  // Filter articles (client-side) for day filtering (simplified without favorites)
  const filteredArticles = useMemo(() => {
    let filtered = articles;

    if (selectedDay) {
      filtered = filtered.filter((a) => {
        const articleDate = new Date(a.publishedAt).toDateString();
        return articleDate === selectedDay;
      });
    }

    return filtered;
  }, [articles, selectedDay]); // FIXED: removed selectedCategory from dependencies

  // Utilities
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

    // Helper function to get abbreviated day name (2 letters)
    const getDayAbbreviation = (date: Date): string => {
      const dayNames = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
      return dayNames[date.getDay()];
    };

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
            const isToday = d.toDateString() === today.toDateString();

            return (
              <button
                key={key}
                onClick={() => setSelectedDay(isSelected ? null : key)}
                disabled={disabled}
                className={`min-w-[48px] h-14 rounded-lg text-sm font-medium transition-colors
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
                <div className="w-full h-full flex flex-col items-center justify-center leading-none">
                  {/* Day abbreviation (2 letters) */}
                  <span 
                    className={`text-[10px] font-medium mb-0.5 ${
                      isSelected 
                        ? 'text-white/80' 
                        : disabled 
                        ? 'text-gray-400' 
                        : 'text-gray-500'
                    }`}
                  >
                    {getDayAbbreviation(d)}
                  </span>
                  
                  {/* Date number */}
                  <span className={`text-base font-semibold ${isToday ? 'font-bold' : ''}`}>
                    {d.getDate()}
                  </span>
                  
                  {/* News indicator dot */}
                  <span
                    className={`mt-0.5 w-1 h-1 rounded-full ${
                      isSelected ? 'bg-white/90' : hasNews ? 'bg-red-400' : 'bg-transparent'
                    }`}
                  />
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
                Beware
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
    const [showTldr, setShowTldr] = useState(false);
    const [tldr, setTldr] = useState<string>('');
    const [loadingTldr, setLoadingTldr] = useState(false);
    const [tldrError, setTldrError] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);

    // FIXED: removed unused tldrId variable

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

    // Handle article click - redirect to external URL or show in detail view if no URL
    const handleArticleClick = () => {
      if (article.url) {
        // Open the article URL in a new tab
        window.open(article.url, '_blank', 'noopener,noreferrer');
      } else {
        // Fallback: show detail view if no URL available
        setSelectedArticle(article);
      }
    };

    const tldrLines =
      tldr
        ?.split('\n')
        .map((l: string) => l.trim())
        .filter(Boolean) || [];

    return (
      <div
        className="group border border-gray-200 bg-white rounded-xl overflow-hidden hover:border-gray-300 transition-all duration-200 cursor-pointer"
        onClick={handleArticleClick}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && handleArticleClick()}
      >
        <div className="relative">
          <Image
            src={article.urlToImage || FALLBACK_IMAGE}
            alt={article.title}
            width={400}
            height={176}
            className="w-full h-44 object-cover"
            onError={(e) => {
              const img = e.currentTarget as HTMLImageElement;
              img.src = FALLBACK_IMAGE;
            }}
          />
                    
          {/* External link indicator */}
          {article.url && (
            <div className="absolute top-3 left-3 w-8 h-8 rounded-lg bg-black/50 text-white grid place-items-center backdrop-blur-sm">
              <ExternalLink className="w-4 h-4" />
            </div>
          )}
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
                {article.category.replace('-', ' ')}
              </span>
            </div>
            <div className="text-xs text-gray-400">#{index + 1}</div>
          </div>

          {/* TL;DR collapsible */}
          <div
            className={`transition-[max-height,opacity] duration-300 ease-out ${
              showTldr
                ? 'max-h-[400px] opacity-100 mb-3'
                : 'max-h-0 opacity-0 overflow-hidden'
            }`}
          >
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-sm">
              <div className="flex items-center gap-2 text-yellow-800 font-medium mb-2">
                <Zap className="w-4 h-4" />
                TL;DR
                {tldr && (
                  <button
                    onClick={handleCopy}
                    className={`ml-auto p-1 rounded transition-colors ${
                      copied
                        ? 'bg-green-100 text-green-600'
                        : 'hover:bg-yellow-100 text-yellow-600'
                    }`}
                    title={copied ? 'Copied!' : 'Copy summary'}
                  >
                    {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                  </button>
                )}
              </div>
              {loadingTldr ? (
                <div className="flex items-center gap-2 text-yellow-700">
                  <div className="w-4 h-4 border-2 border-yellow-300 border-t-yellow-600 rounded-full animate-spin" />
                  Summarizing...
                </div>
              ) : tldrError ? (
                <div className="text-red-600 text-xs">{tldrError}</div>
              ) : tldr ? (
                <div className="text-yellow-800 space-y-1">
                  {tldrLines.map((line, i) => (
                    <div key={i}>{line}</div>
                  ))}
                </div>
              ) : null}
            </div>
          </div>

          {/* Title */}
          <h2 className="font-bold text-gray-900 mb-2 line-clamp-3 group-hover:text-red-700 transition-colors">
            {article.title}
          </h2>

          {/* Description */}
          <p className="text-gray-600 text-sm mb-3 line-clamp-2 leading-relaxed">
            {article.description}
          </p>

          {/* Actions */}
          <div className="flex items-center gap-2 pt-2">
            <div className="flex items-center text-xs text-gray-500">
              <span>
                {getReadTime(article.description + (article.content || ''))} •{' '}
                {article.url ? 'Click to read full article' : 'View details'}
              </span>
            </div>
            
            <div className="ml-auto flex items-center gap-1">
              <button
                onClick={(e) => handleShare(e, article)}
                className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                title="Share article"
              >
                <Share2 className="w-4 h-4" />
              </button>
              <button
                onClick={handleToggleTldr}
                className={`p-2 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 ${
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
      </div>
    );
  };

  // Article detail view
  if (selectedArticle) {
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
            <Image
              src={selectedArticle.urlToImage || FALLBACK_IMAGE}
              alt={selectedArticle.title}
              width={800}
              height={256}
              className="w-full h-64 object-cover"
              onError={(e) => {
                const img = e.currentTarget as HTMLImageElement;
                img.src = FALLBACK_IMAGE;
              }}
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
          <div className="flex flex-wrap items-center gap-2">
            {categories.map((c) => {
              const active = selectedCategory === c.key;
              const Icon = c.icon;
              return (
                <button
                  key={c.key}
                  onClick={() => setSelectedCategory(c.key)}
                  aria-pressed={active}
                  className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400 flex items-center gap-2 flex-shrink-0
                    ${active
                      ? 'bg-red-500 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                >
                  <Icon className="w-4 h-4" />
                  {c.label}
                </button>
              );
            })}
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