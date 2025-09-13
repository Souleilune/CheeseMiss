import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q');
    const page = parseInt(searchParams.get('page') || '1');
    const pageSize = parseInt(searchParams.get('pageSize') || '20');
    const sortBy = searchParams.get('sortBy') || 'publishedAt';
    const language = searchParams.get('language') || 'en';
    const country = searchParams.get('country') || 'ph';

    if (!query) {
      return NextResponse.json(
        { error: 'Search query is required' },
        { status: 400 }
      );
    }

    const apiKey = process.env.NEWS_API_KEY;
    const baseUrl = process.env.NEWS_API_BASE_URL || 'https://api.apinews.org/v1';

    if (!apiKey) {
      return NextResponse.json(
        { error: 'News API key not configured' },
        { status: 500 }
      );
    }

    const params = new URLSearchParams({
      apikey: apiKey,
      q: query,
      page: page.toString(),
      pageSize: pageSize.toString(),
      sortBy,
      language,
      country
    });

    const apiUrl = `${baseUrl}/news?${params.toString()}`;
    
    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'CheeseMsg-NewsApp/1.0'
      },
      next: { revalidate: 180 } // Cache for 3 minutes for search results
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: 'Failed to search news' },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);

  } catch (error) {
    console.error('Error searching news:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
