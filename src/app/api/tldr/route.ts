import { NextRequest, NextResponse } from 'next/server';

// Route/runtime config
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

type TldrBody = {
  title?: string;
  description?: string;
  content?: string;
};

type GeminiPart = { text?: string };
type GeminiContent = { parts?: GeminiPart[] };
type GeminiCandidate = { content?: GeminiContent; finishReason?: string };
type GeminiResponse = { candidates?: GeminiCandidate[] };

// Rate limit config (override via env)
const RL_WINDOW_SECONDS = Number(process.env.TLDR_RATE_WINDOW_SECONDS || 60);  // window size
const RL_MAX_REQUESTS = Number(process.env.TLDR_RATE_MAX || 10);              // requests per window

// Upstash Redis REST (optional; enables distributed rate limiting)
const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL || '';
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || '';

// In-memory rate limiter fallback (single instance)
const memBuckets = new Map<string, { count: number; resetSec: number }>();

export async function POST(request: NextRequest) {
  // Parse body ONCE and reuse
  let body: TldrBody | null = null;

  try {
    try {
      body = (await request.json()) as TldrBody;
    } catch {
      return json({ error: 'Invalid JSON body' }, 400);
    }

    const title = (body.title || '').trim();
    const description = (body.description || '').trim();
    const content = (body.content || description || '').trim();

    if (!title && !description) {
      return json({ error: 'Title or description is required' }, 400);
    }

    // Rate limiting per IP
    const ip = getClientIp(request);
    const rl = await checkRateLimit(ip, RL_WINDOW_SECONDS, RL_MAX_REQUESTS);

    if (!rl.allowed) {
      // Return a 429 with a heuristic TL;DR to preserve UX without hitting LLM quota
      const fallback = generateFallbackTldr(title, description);
      return json(
        { tldr: fallback, fallback: true, rateLimited: true },
        429,
        rateLimitHeaders(RL_MAX_REQUESTS, rl.remaining, rl.resetSec)
      );
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return json(
        { tldr: generateFallbackTldr(title, description), fallback: true },
        200,
        rateLimitHeaders(RL_MAX_REQUESTS, rl.remaining, rl.resetSec)
      );
    }

    const prompt = buildPrompt(title, description, content);
    const url = `${getGeminiEndpoint()}?key=${apiKey}`;

    // Call Gemini with timeout and small generationConfig
    const data = await fetchJsonWithTimeout<GeminiResponse>(
      url,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: Number(process.env.TLDR_TEMPERATURE ?? 0.2),
            topP: 0.9,
            maxOutputTokens: Number(process.env.TLDR_MAX_TOKENS ?? 90), // ~2–3 short sentences
          },
        }),
      },
      8000
    );

    const text = extractText(data).trim();
    let tldr = normalizeTldr(text);

    if (tldr.length < 10) {
      tldr = generateFallbackTldr(title, description);
    }

    return json({ tldr }, 200, rateLimitHeaders(RL_MAX_REQUESTS, rl.remaining, rl.resetSec));
  } catch (error) {
    console.error('Error generating TL;DR:', error);
    const title = (body?.title || '').trim();
    const description = (body?.description || '').trim();
    const fallbackTldr = generateFallbackTldr(title, description);
    return json({ tldr: fallbackTldr, fallback: true }, 200);
  }
}

/* ----------------------------- Helpers below ----------------------------- */

function buildPrompt(title: string, description: string, content: string) {
  const clean = (s: string) => s.replace(/\s+/g, ' ').trim();
  const t = clean(title).slice(0, 300);
  const d = clean(description).slice(0, 600);
  const c = clean(content).slice(0, 1200);

  return `Gumawa ng maikling buod (TL;DR) sa Filipino/Tagalog para sa balitang korapsyon. Max 2–3 maikling pangungusap.

Title: ${t}
Description: ${d}
Content: ${c}

Tutok sa:
- Sino ang sangkot
- Magkano (₱) ang pera/korapsyon
- Saan nangyari

Mga Panuto:
- Maging tuwiran at makatotohanan.
- Huwag gumamit ng "TL;DR:" sa simula.
- Simulan agad sa buod, walang intro o paliwanag.`;
}

function extractText(data: GeminiResponse): string {
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

function normalizeTldr(text: string): string {
  if (!text) return '';
  let out = text.trim();

  // Strip leading "TL;DR:" or variants
  if (/^tl;?dr[:\-]\s*/i.test(out)) {
    out = out.replace(/^tl;?dr[:\-]\s*/i, '').trim();
  }

  // Strip simple markdown emphasis/code
  out = out.replace(/^\*+\s*/g, '').replace(/^`{1,3}/g, '').trim();

  // Cap length for UI
  if (out.length > 280) out = out.slice(0, 277) + '...';
  return out;
}

function getGeminiEndpoint() {
  const base = process.env.GEMINI_API_BASE || 'https://generativelanguage.googleapis.com';
  const version = process.env.GEMINI_API_VERSION || 'v1beta';
  const model = process.env.GEMINI_MODEL || 'gemini-1.5-flash';
  return `${base}/${version}/models/${model}:generateContent`;
}

// Simple fallback TL;DR heuristic (no LLM)
function generateFallbackTldr(title?: string, description?: string): string {
  const text = `${title || ''} ${description || ''}`.trim();
  if (!text) return 'Maikling buod: walang sapat na detalye.';

  const peso = text.match(/₱[\d,.]+(?:\s?(?:M|B|million|billion))?/i);
  const person = text.match(
    /(mayor|governor|congressman|congresswoman|senator|official|undersecretary|secretary|councilor)[\s\w\-]*/i
  );
  const place = text.match(
    /\b(manila|cebu|davao|quezon|pampanga|bicol|mindanao|marikina|pasig|makati|ncr|metro manila)\b/i
  );

  const who = person ? person[0].trim() : 'Isang opisyal';
  const amt = peso ? ` na nagkakahalaga ng ${peso[0]}` : '';
  const where = place ? ` sa ${place[0]}` : '';
  const out = `${who} ang sangkot sa posibleng katiwalian${amt}${where}.`;

  return out.length > 200 ? out.slice(0, 197) + '...' : out;
}

// JSON helper with no-store + optional rate-limit headers
function json(payload: unknown, status = 200, extraHeaders?: Record<string, string>) {
  return NextResponse.json(payload, {
    status,
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
      Pragma: 'no-cache',
      ...(extraHeaders || {}),
    },
  });
}

// Timeout wrapper for fetch returning JSON
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

/* ----------------------------- Rate limiting ----------------------------- */

type RateLimitResult = {
  allowed: boolean;
  remaining: number; // remaining tokens in current window
  resetSec: number;  // epoch seconds when the window resets
};

function rateLimitHeaders(limit: number, remaining: number, resetSec: number): Record<string, string> {
  return {
    'X-RateLimit-Limit': String(limit),
    'X-RateLimit-Remaining': String(Math.max(0, remaining)),
    'X-RateLimit-Reset': String(resetSec),
    'X-RateLimit-Policy': `ip;window=${RL_WINDOW_SECONDS}s;max=${RL_MAX_REQUESTS}`,
    'Retry-After': String(Math.max(0, resetSec - Math.floor(Date.now() / 1000))),
  };
}

function getClientIp(req: NextRequest): string {
  const xf = req.headers.get('x-forwarded-for');
  if (xf) {
    const ip = xf.split(',')[0]?.trim();
    if (ip) return ip;
  }
  const xr = req.headers.get('x-real-ip');
  if (xr) return xr.trim();
  // NextRequest.ip may be set in some runtimes
  // @ts-expect-error: ip may not exist in all environments
  if (req.ip) return String(req.ip);
  return 'unknown';
}

// Main rate limit function: prefers Upstash; falls back to in-memory
async function checkRateLimit(ip: string, windowSec: number, limit: number): Promise<RateLimitResult> {
  // Disabled if max <= 0
  if (limit <= 0) {
    const nowSec = Math.floor(Date.now() / 1000);
    return { allowed: true, remaining: Number.MAX_SAFE_INTEGER, resetSec: nowSec + windowSec };
  }

  if (UPSTASH_URL && UPSTASH_TOKEN && ip !== 'unknown') {
    return await checkRateLimitUpstash(ip, windowSec, limit);
  }
  return checkRateLimitMemory(ip, windowSec, limit);
}

// Upstash fixed-window limiter
async function checkRateLimitUpstash(ip: string, windowSec: number, limit: number): Promise<RateLimitResult> {
  const nowSec = Math.floor(Date.now() / 1000);
  const bucket = Math.floor(nowSec / windowSec); // fixed window index
  const key = `rl:tldr:${ip}:${bucket}`;
  const ttl = windowSec + 5;

  type UpstashResult = Array<{ result: number }>;
  const res = await fetch(`${UPSTASH_URL}/pipeline`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${UPSTASH_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify([
      ['INCR', key],
      ['EXPIRE', key, ttl],
    ]),
    cache: 'no-store',
    next: { revalidate: 0 },
  });

  if (!res.ok) {
    const msg = await res.text().catch(() => '');
    throw new Error(`RateLimit Upstash error ${res.status}${msg ? `: ${msg}` : ''}`);
  }

  const data = (await res.json()) as UpstashResult;
  const count = Number(data?.[0]?.result || 0);
  const allowed = count <= limit;
  const remaining = Math.max(0, limit - count);
  const resetSec = bucket * windowSec + windowSec;

  return { allowed, remaining, resetSec };
}

// In-memory fixed-window limiter (per instance)
function checkRateLimitMemory(ip: string, windowSec: number, limit: number): RateLimitResult {
  const nowSec = Math.floor(Date.now() / 1000);
  let entry = memBuckets.get(ip);

  if (!entry || nowSec >= entry.resetSec) {
    entry = { count: 0, resetSec: nowSec + windowSec };
  }

  entry.count += 1;
  memBuckets.set(ip, entry);

  const allowed = entry.count <= limit;
  const remaining = Math.max(0, limit - entry.count);
  return { allowed, remaining, resetSec: entry.resetSec };
}