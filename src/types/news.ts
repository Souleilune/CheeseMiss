// src/types/news.ts - Updated with content property
export interface Article {
  id: number | string;
  title: string;
  description: string;
  urlToImage?: string;
  publishedAt: string;
  source: { 
    name: string;
    url?: string;
  };
  category: 'flood-control' | 'dpwh' | 'corrupt-politicians' | 'nepo-babies';
  url?: string;
  content?: string; // Added this property to support TLDR generation
}

export interface Category {
  key: string;
  label: string;
  icon: string;
}

export interface NewsApiResponse {
  status: string;
  totalResults: number;
  articles: Article[];
  fallback?: boolean;
  error?: string;
}

export interface ErrorResponse {
  error: string;
  details?: string;
  status?: number;
}