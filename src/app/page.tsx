'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  Search,
  Heart,
  Share2,
  MessageCircle,
  X,
  Bookmark,
  ArrowUp,
} from 'lucide-react';

const FALLBACK_IMAGE =
  'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=1200&h=800&fit=crop';

type Article = {
  id: number;
  title: string;
  description: string;
  urlToImage?: string;
  publishedAt: string;
  source: { name: string };
  category: 'general' | 'technology' | 'sports' | 'health';
};

const NewsApp = () => {
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<
    'all' | 'favorites' | Article['category']
  >('all');
  const [selectedDay, setSelectedDay] = useState<string | null>(null); // toDateString()
  const [favorites, setFavorites] = useState<number[]>([]);
  const [selectedArticle, setSelectedArticle] = useState<Article | null>(null);

  const [showScrollTop, setShowScrollTop] = useState(false);
  const [readProgress, setReadProgress] = useState(0);

  // Mock data
  const mockNews: Article[] = [
    {
      id: 1,
      title:
        'Mga Bagong Infrastructure Projects sa Metro Manila, Nagsimula na!',
      description:
        'Malaking pagbabago ang inaasahan sa transportasyon sa Metro Manila dahil sa mga bagong proyekto ng gobyerno.',
      urlToImage:
        'https://images.unsplash.com/photo-1449824913935-59a10b8d2000?w=800&h=500&fit=crop',
      publishedAt: '2025-09-13T10:30:00Z',
      source: { name: 'Filipino News Network' },
      category: 'general',
    },
    {
      id: 2,
      title: 'Pinoy Tech Startup, Nakakuha ng $5M Investment!',
      description:
        'Isang Filipino tech startup ang naging successful sa pagkuha ng malaking investment mula sa international investors.',
      urlToImage:
        'https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=800&h=500&fit=crop',
      publishedAt: '2025-09-13T09:15:00Z',
      source: { name: 'Tech Pilipinas' },
      category: 'technology',
    },
    {
      id: 3,
      title: 'Gilas Pilipinas, Nanalo sa FIBA Championship!',
      description:
        'Nakamit ng Philippine basketball team ang championship title sa international tournament.',
      urlToImage:
        'https://images.unsplash.com/photo-1546519638-68e109498ffc?w=800&h=500&fit=crop',
      publishedAt: '2025-09-13T08:45:00Z',
      source: { name: 'Sports Central PH' },
      category: 'sports',
    },
    {
      id: 4,
      title: 'Bagong Healthcare Program para sa mga OFW',
      description:
        'Inilabas ng gobyerno ang comprehensive healthcare program na magbebenefit sa lahat ng overseas Filipino workers.',
      urlToImage:
        'https://images.unsplash.com/photo-1559757148-5c350d0d3c56?w=800&h=500&fit=crop',
      publishedAt: '2025-09-13T07:20:00Z',
      source: { name: 'OFW Today' },
      category: 'health',
    },
    {
      id: 5,
      title: 'Palawan, Naging Top Tourist Destination sa Asia!',
      description:
        'Nakamit ng Palawan ang recognition bilang number one tourist destination sa Southeast Asia.',
      urlToImage:
        'https://images.unsplash.com/photo-1544551763-46a013bb70d5?w=800&h=500&fit=crop',
      publishedAt: '2025-09-13T06:30:00Z',
      source: { name: 'Travel Philippines' },
      category: 'general',
    },
  ];

  // Simulate fetch
  useEffect(() => {
    const t = setTimeout(() => {
      setArticles(mockNews);
      setLoading(false);
    }, 700);
    return () => clearTimeout(t);
  }, []);

  // Favorites persistence
  useEffect(() => {
    const raw = localStorage.getItem('news:favorites');
    if (raw) {
      try {
        setFavorites(JSON.parse(raw));
      } catch {
        /* noop */
      }
    }
  }, []);
  useEffect(() => {
    localStorage.setItem('news:favorites', JSON.stringify(favorites));
  }, [favorites]);

  // UI listeners
  useEffect(() => {
    const onScroll = () => {
      setShowScrollTop(window.scrollY > 300);
      if (selectedArticle) {
        const doc = document.documentElement;
        const total = doc.scrollHeight - window.innerHeight;
        const p = total > 0 ? Math.min(100, (window.scrollY / total) * 100) : 0;
        setReadProgress(p);
      }
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [selectedArticle]);

  const categories: { key: 'all' | 'favorites' | Article['category']; label: string }[] =
    [
      { key: 'all', label: 'Lahat' },
      { key: 'general', label: 'Balitang Ina' },
      { key: 'technology', label: 'Flood Control' },
      { key: 'sports', label: 'Nepo Babies' },
      { key: 'health', label: 'Vico Sotto' },
      { key: 'favorites', label: '★ Favorites' },
    ];

  const filteredArticles = useMemo(() => {
    return articles.filter((a) => {
      const matchesSearch =
        !searchQuery ||
        a.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        a.description.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesCategory =
        selectedCategory === 'all'
          ? true
          : selectedCategory === 'favorites'
          ? favorites.includes(a.id)
          : a.category === selectedCategory;

      const matchesDay =
        !selectedDay ||
        new Date(a.publishedAt).toDateString() === selectedDay;

      return matchesSearch && matchesCategory && matchesDay;
    });
  }, [articles, searchQuery, selectedCategory, selectedDay, favorites]);

  const toggleFavorite = (id: number) => {
    setFavorites((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = +now - +date;
    const h = Math.floor(diffMs / (1000 * 60 * 60));
    if (h < 1) return 'Ngayon lang';
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  };

  const getReadTime = (text: string) => {
    const words = text.trim().split(/\s+/).length;
    const min = Math.max(1, Math.round(words / 180));
    return `${min} min read`;
  };

  const handleShare = (
    e: React.MouseEvent<HTMLButtonElement>,
    article: Article
  ) => {
    e.stopPropagation();
    const payload = {
      title: article.title,
      text: article.description,
      url: window.location.href,
    };
    if ((navigator as any).share) {
      (navigator as any).share(payload).catch(() => {});
    } else {
      navigator.clipboard.writeText(`${article.title} — ${payload.url}`);
      const el = e.currentTarget;
      el.classList.add('ring-2', 'ring-green-400');
      setTimeout(() => el.classList.remove('ring-2', 'ring-green-400'), 600);
    }
  };

  // Day generator (no scale; no overlap)
  const DayPicker = () => {
    const today = new Date();
    const days: { key: string; num: number; isToday: boolean; hasNews: boolean }[] = [];

    for (let i = -4; i <= 4; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      const key = d.toDateString();
      days.push({
        key,
        num: d.getDate(),
        isToday: i === 0,
        hasNews: i <= 0,
      });
    }

    return (
      <div className="overflow-x-auto">
        <div className="flex gap-2 pb-1">
          {days.map((d) => {
            const isSelected = selectedDay === d.key;
            return (
              <button
                key={d.key}
                onClick={() => setSelectedDay(d.key)}
                disabled={!d.hasNews}
                aria-pressed={isSelected}
                className={`min-w-[42px] h-10 rounded-lg text-sm font-medium transition-colors flex-shrink-0
                  ${isSelected ? 'bg-red-500 text-white' : d.isToday ? 'bg-red-50 text-red-700' : d.hasNews ? 'bg-gray-100 text-gray-700 hover:bg-gray-200' : 'bg-gray-50 text-gray-400'}
                  ${!d.hasNews ? 'cursor-not-allowed opacity-60' : ''}
                  focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400`}
              >
                <div className="w-full h-full grid place-items-center">
                  <div className="flex flex-col items-center leading-none">
                    <span>{d.num}</span>
                    {d.hasNews && (
                      <span
                        className={`mt-1 w-1 h-1 rounded-full ${isSelected ? 'bg-white/90' : 'bg-red-400'}`}
                      />
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  // Minimal top bar with search
  const TopBar = () => {
    return (
      <div className="bg-white/90 backdrop-blur border-b border-gray-200">
        <div className="max-w-3xl mx-auto px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-gray-900 tracking-tight">
                Cheese Miss
              </span>
            </div>
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Hanapin ang balita..."
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
            <div className="hidden sm:flex items-center gap-2 text-sm text-gray-500">
              <Bookmark className="w-4 h-4 text-red-500" />
              <span>{favorites.length}</span>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // Minimal article card
  const ArticleCard = ({ article, index }: { article: Article; index: number }) => {
    const isFav = favorites.includes(article.id);
    return (
      <div
        className="group border border-gray-200 bg-white rounded-xl overflow-hidden hover:border-gray-300 transition-colors cursor-pointer"
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
            className={`absolute top-3 right-3 w-9 h-9 rounded-lg grid place-items-center transition-colors
              ${isFav ? 'bg-red-500 text-white' : 'bg-white/90 text-gray-700 hover:bg-red-50 hover:text-red-600'}`}
          >
            <Heart className={`w-4 h-4 ${isFav ? 'fill-current' : ''}`} />
          </button>
        </div>

        <div className="p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-700">
                {article.source.name}
              </span>
              <span aria-hidden>•</span>
              <span>{formatTime(article.publishedAt)}</span>
              <span aria-hidden>•</span>
              <span className="text-red-600">#{article.category}</span>
            </div>
            <div className="text-xs text-gray-400">#{index + 1}</div>
          </div>

          <h3
            className="text-gray-900 font-semibold mb-1 leading-snug"
            style={{
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
          >
            {article.title}
          </h3>

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

          <div className="mt-3 flex items-center gap-2">
            <span className="text-xs text-gray-500 px-2 py-1 rounded-lg bg-gray-50">
              {getReadTime(article.description)}
            </span>
            <button
              onClick={(e) => e.stopPropagation()}
              className="ml-auto w-9 h-8 rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 grid place-items-center"
              aria-label="Comments"
            >
              <MessageCircle className="w-4 h-4" />
            </button>
            <button
              onClick={(e) => handleShare(e, article)}
              className="w-9 h-8 rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 grid place-items-center"
              aria-label="Share"
            >
              <Share2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    );
  };

  // Detail view (minimal)
  if (selectedArticle) {
    const isFav = favorites.includes(selectedArticle.id);
    return (
      <div className="min-h-screen bg-gray-50">
        {/* Reading progress */}
        <div
          className="fixed top-0 left-0 h-1 bg-red-500 z-50 transition-[width] duration-150"
          style={{ width: `${readProgress}%` }}
        />

        {/* Top bar */}
        <div className="sticky top-0 z-40 bg-white/90 backdrop-blur border-b border-gray-200">
          <div className="max-w-3xl mx-auto px-4 py-2.5 flex items-center gap-2">
            <button
              onClick={() => setSelectedArticle(null)}
              aria-label="Go back"
              className="w-9 h-9 rounded-lg bg-gray-100 hover:bg-gray-200 grid place-items-center"
            >
              <X className="w-4 h-4 text-gray-700" />
            </button>
            <div className="flex-1 text-sm text-gray-600">Article</div>
            <button
              onClick={() => toggleFavorite(selectedArticle.id)}
              aria-label="Toggle favorite"
              className={`w-9 h-9 rounded-lg grid place-items-center ${
                isFav
                  ? 'bg-red-500 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              <Heart className={`w-4 h-4 ${isFav ? 'fill-current' : ''}`} />
            </button>
            <button
              onClick={(e) => handleShare(e, selectedArticle)}
              aria-label="Share"
              className="w-9 h-9 rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 grid place-items-center"
            >
              <Share2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Hero image */}
        <div className="bg-white">
          <div className="max-w-3xl mx-auto">
            <div className="relative">
              <img
                src={selectedArticle.urlToImage || FALLBACK_IMAGE}
                alt={selectedArticle.title}
                onError={(e) =>
                  ((e.currentTarget as HTMLImageElement).src = FALLBACK_IMAGE)
                }
                className="w-full h-64 object-cover"
              />
              <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/40 to-transparent" />
              <div className="absolute bottom-3 left-3 flex items-center gap-2 text-xs text-white/90">
                <span className="px-2 py-0.5 rounded bg-black/40 backdrop-blur">
                  {selectedArticle.source.name}
                </span>
                <span aria-hidden>•</span>
                <span className="px-2 py-0.5 rounded bg-black/40 backdrop-blur">
                  {formatTime(selectedArticle.publishedAt)}
                </span>
                <span aria-hidden>•</span>
                <span className="px-2 py-0.5 rounded bg-red-500/90">#{selectedArticle.category}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="max-w-3xl mx-auto p-4">
          <h1 className="text-2xl font-bold text-gray-900 leading-tight mb-3">
            {selectedArticle.title}
          </h1>
          <p className="text-gray-700 text-base leading-relaxed mb-8">
            {selectedArticle.description}
          </p>

          <div className="flex gap-2">
            <button
              onClick={() => toggleFavorite(selectedArticle.id)}
              className={`px-4 py-2 rounded-lg text-sm font-medium ${
                isFav
                  ? 'bg-red-500 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {isFav ? 'Added to Favorites' : 'Add to Favorites'}
            </button>
            <button
              onClick={(e) => handleShare(e, selectedArticle)}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-gray-100 text-gray-700 hover:bg-gray-200"
            >
              Share
            </button>
          </div>
        </div>
      </div>
    );
  }

  // List view
  return (
    <div className="min-h-screen bg-gray-50">
      <TopBar />

      {/* Filters */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-3xl mx-auto px-4 py-3 space-y-3">
          {/* Day picker */}
          <DayPicker />

          {/* Categories */}
          <div className="overflow-x-auto">
            <div className="flex gap-2 pb-1">
              {categories.map((c) => {
                const active = selectedCategory === c.key;
                return (
                  <button
                    key={c.key}
                    onClick={() => setSelectedCategory(c.key)}
                    aria-pressed={active}
                    className={`px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400
                      ${active ? 'bg-red-500 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
                  >
                    {c.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Quick stats */}
          <div className="text-sm text-gray-500">
            {loading ? 'Loading…' : `${filteredArticles.length} articles`}
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
        ) : filteredArticles.length === 0 ? (
          <div className="border border-gray-200 rounded-xl bg-white p-8 text-center">
            <div className="mx-auto w-12 h-12 rounded-lg bg-red-50 text-red-600 grid place-items-center mb-3">
              <Search className="w-6 h-6" />
            </div>
            <div className="font-semibold text-gray-900">Walang nahanap</div>
            <div className="text-sm text-gray-500 mt-1">
              Subukan ang ibang salita o i-reset ang filters.
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

export default NewsApp;