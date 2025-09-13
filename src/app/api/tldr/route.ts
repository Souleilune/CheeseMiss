import { NextRequest, NextResponse } from 'next/server';

interface TldrRequest {
  title: string;
  description: string;
  content?: string;
}

export async function POST(request: NextRequest) {
  try {
    const { title, description, content }: TldrRequest = await request.json();

    if (!title || !description) {
      return NextResponse.json(
        { error: 'Title and description are required' },
        { status: 400 }
      );
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'Gemini API key not configured' },
        { status: 500 }
      );
    }

    // Use the same Gemini endpoint structure as your existing code
    const configuredUrl = process.env.GEMINI_API_URL;
    const url = `${configuredUrl || getGeminiEndpoint()}?key=${apiKey}`;

    // Create focused TLDR prompt for Philippine corruption news
    const prompt = `Gumawa ng maikling TLDR para sa Filipino corruption news article na ito:

TITLE: ${title}
DESCRIPTION: ${description}
${content ? `CONTENT: ${content}` : ''}

Instructions:
- Gumawa ng 1-2 sentences na TLDR sa Filipino/Taglish
- I-highlight ang mga key corruption details (amounts, names, locations)
- Gamitin ang format: "TLDR: [summary]"
- Mag-focus sa mga konkretong detalye like ₱ amounts, officials involved
- Keep it under 150 characters for mobile readability

Example format: "TLDR: Si Mayor X, naaresto dahil sa ₱500M ghost project sa Cebu. COA audit nagtukoy ng overpricing at kickbacks."`;

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

    const data = await response.json().catch(() => ({} as any));
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