import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { title, description, content } = await request.json();
    
    if (!title && !description) {
      return NextResponse.json({ error: 'Title or description is required' }, { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ 
        tldr: generateFallbackTldr(title, description),
        fallback: true 
      });
    }

    const url = `${getGeminiEndpoint()}?key=${apiKey}`;
    
    const prompt = `Create a very brief TL;DR summary (max 2-3 sentences) in Filipino/Tagalog for this corruption news article:

Title: ${title}
Description: ${description}
Content: ${content || description}

Focus on: WHO is involved, HOW MUCH money/corruption, WHERE it happened.
Keep it short, factual, and in Filipino. Start directly with the summary, no "TL;DR:" prefix.`;

    const requestBody = {
      contents: [{ parts: [{ text: prompt }] }]
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      throw new Error(`Gemini API responded with ${response.status}${errText ? `: ${errText}` : ''}`);
    }

    const data = await response.json() as { // FIXED: proper typing instead of 'any'
      candidates?: Array<{
        content?: {
          parts?: Array<{
            text?: string;
          }>;
        };
      }>;
    };
    
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';

    // Extract TLDR from response
    let tldr = text.trim();
    if (tldr.toLowerCase().startsWith('tldr:')) {
      tldr = tldr.substring(5).trim();
    }

    // Fallback if Gemini fails
    if (!tldr || tldr.length < 10) {
      tldr = generateFallbackTldr(title, description);
    }

    return NextResponse.json({ tldr });

  } catch (error) {
    console.error('Error generating TLDR:', error);
    
    // Return fallback TLDR on error
    const { title, description } = await request.json();
    const fallbackTldr = generateFallbackTldr(title, description);
    
    return NextResponse.json({ 
      tldr: fallbackTldr,
      fallback: true 
    });
  }
}

function getGeminiEndpoint() {
  const base = process.env.GEMINI_API_BASE || 'https://generativelanguage.googleapis.com';
  const version = process.env.GEMINI_API_VERSION || 'v1beta';
  const model = process.env.GEMINI_MODEL || 'gemini-1.5-flash';
  return `${base}/${version}/models/${model}:generateContent`;
}

// Simple fallback TLDR generator
function generateFallbackTldr(title: string, description: string): string {
  const text = `${title} ${description}`;
  
  // Extract key corruption indicators
  const amountMatch = text.match(/₱[\d,.]+(M|B|million|billion)?/i);
  const personMatch = text.match(/(mayor|governor|congressman|senator|official|undersecretary|secretary)[\s\w]*/i);
  const locationMatch = text.match(/(manila|cebu|davao|quezon|pampanga|bicol|mindanao|metro manila|ncr)/i);
  
  let tldr = 'Corruption case';
  
  if (personMatch) {
    tldr = `${personMatch[0]} involved in corruption`;
  }
  
  if (amountMatch) {
    tldr += ` worth ${amountMatch[0]}`;
  }
  
  if (locationMatch) {
    tldr += ` in ${locationMatch[0]}`;
  }
  
  tldr += '.';
  
  return tldr.length > 150 ? tldr.substring(0, 147) + '...' : tldr;
}