import { NextResponse } from 'next/server';

const categories = [
  { key: 'all', label: 'All News', icon: '📰' },
  { key: 'flood-control', label: 'Flood Control', icon: '🌊' },
  { key: 'dpwh', label: 'DPWH', icon: '🏗️' },
  { key: 'corrupt-politicians', label: 'Corrupt Politicians', icon: '⚖️' },
  { key: 'nepo-babies', label: 'Nepo Babies', icon: '👑' },
  { key: 'favorites', label: 'Favorites', icon: '❤️' }
];

export async function GET() {
  return NextResponse.json({ categories });
}