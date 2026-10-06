import OpenAI from 'openai';
import { env } from '../config/index.js';
import { ServiceUnavailableError } from '../errors/index.js';

let client: OpenAI | null = null;
let clientKey: string | null = null;

export function getOpenAI(): OpenAI {
  if (!env.OPENAI_API_KEY) {
    throw new ServiceUnavailableError('OpenAI is not configured (OPENAI_API_KEY)');
  }
  if (!client || clientKey !== env.OPENAI_API_KEY) {
    client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
    clientKey = env.OPENAI_API_KEY;
  }
  return client;
}

function mapOpenAIError(err: unknown): never {
  const status =
    err && typeof err === 'object' && 'status' in err
      ? Number((err as { status?: number }).status)
      : undefined;
  const code =
    err && typeof err === 'object' && 'code' in err
      ? String((err as { code?: string }).code)
      : '';

  if (status === 401 || code === 'invalid_api_key') {
    throw new ServiceUnavailableError(
      'OpenAI API key is invalid — check OPENAI_API_KEY in .env',
    );
  }
  if (status === 429) {
    throw new ServiceUnavailableError(
      'OpenAI rate limit reached — try again later',
    );
  }

  const msg = err instanceof Error ? err.message : 'OpenAI request failed';
  throw new ServiceUnavailableError(msg);
}

function normalizeHashtagBlob(raw: string): string {
  const matches = raw.match(/#[A-Za-z0-9_]+/g);
  if (matches?.length) {
    return [...new Set(matches)].join(' ');
  }
  return raw
    .split(/[\s,]+/)
    .map((t) => t.replace(/[^A-Za-z0-9_#]/g, '').trim())
    .filter((t) => t.length > 1)
    .map((t) => (t.startsWith('#') ? t : `#${t}`))
    .filter((t, i, arr) => arr.indexOf(t) === i)
    .join(' ');
}

export async function generateHashtags(content: string): Promise<string> {
  try {
    const openai = getOpenAI();
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You generate only social media hashtags.',
        },
        {
          role: 'user',
          content: `
Generate few relevant, trending social media hashtags.
Rules:
- Only return hashtags
- No explanations
- Space separated
- Each tag must start with #

Content: "${content}"
`,
        },
      ],
      temperature: 0.7,
    });

    const raw = response.choices[0]?.message?.content?.trim() ?? '';
    return normalizeHashtagBlob(raw);
  } catch (err) {
    if (err instanceof ServiceUnavailableError) throw err;
    mapOpenAIError(err);
  }
}

export async function generateCaption(content: string): Promise<string> {
  try {
    const openai = getOpenAI();
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content:
            'You are a creative social media caption writer. Generate engaging and concise captions.',
        },
        {
          role: 'user',
          content: `
Generate a single engaging social media caption.
Rules:
- Keep it concise (under 280 characters)
- Make it engaging and relatable
- No hashtags
- Only return the caption text

Content: "${content}"
`,
        },
      ],
      temperature: 0.8,
    });

    return response.choices[0]?.message?.content?.trim() ?? '';
  } catch (err) {
    if (err instanceof ServiceUnavailableError) throw err;
    mapOpenAIError(err);
  }
}
