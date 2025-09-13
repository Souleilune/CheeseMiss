// FIXED: Removed unused import
import { NewsResponse } from '@/app/api/news/route';

const API_BASE = '/api/news';

export interface FetchNewsParams {
  category?: string;
  query?: string;
  page?: number;
  pageSize?: number;
  country?: string;
  language?: string;
}

export async function fetchNews(params: FetchNewsParams = {}): Promise<NewsResponse> {
  const {
    category = 'general',
    query = '',
    page = 1,
    pageSize = 20,
    country = 'ph',
    language = 'en'
  } = params;

  const searchParams = new URLSearchParams();
  
  if (category && category !== 'all') searchParams.append('category', category);
  if (query) searchParams.append('q', query);
  if (page > 1) searchParams.append('page', page.toString());
  if (pageSize !== 20) searchParams.append('pageSize', pageSize.toString());
  if (country !== 'ph') searchParams.append('country', country);
  if (language !== 'en') searchParams.append('language', language);

  const url = `${API_BASE}?${searchParams.toString()}`;
  
  const response = await fetch(url, {
    next: { revalidate: 300 } // 5 minutes cache
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }

  return response.json();
}

export async function searchNews(query: string, options: Omit<FetchNewsParams, 'query'> = {}): Promise<NewsResponse> {
  const params = new URLSearchParams();
  params.append('q', query);
  
  if (options.page) params.append('page', options.page.toString());
  if (options.pageSize) params.append('pageSize', options.pageSize.toString());
  if (options.country) params.append('country', options.country);
  if (options.language) params.append('language', options.language);

  const response = await fetch(`${API_BASE}/search?${params.toString()}`);
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }

  return response.json();
}

export async function getCategories() {
  const response = await fetch(`${API_BASE}/categories`);
  
  if (!response.ok) {
    throw new Error('Failed to fetch categories');
  }

  return response.json();
}

// Client-side utility to handle errors gracefully
export function handleApiError(error: unknown): string { // FIXED: changed from 'any' to 'unknown'
  const err = error as Error; // Safe type assertion
  
  if (err.message?.includes('fetch')) {
    return 'Network error. Please check your connection.';
  }
  
  if (err.message?.includes('API key')) {
    return 'News service is temporarily unavailable.';
  }
  
  return err.message || 'Something went wrong. Please try again.';
}