import leoProfanity from 'leo-profanity';
import { env } from '../../shared/config/index.js';
import { getRedis, isRedisEnabled } from '../../shared/cache/index.js';
import {
  TooManyRequestsError,
  ValidationError,
} from '../../shared/errors/index.js';
import {
  generateCaption,
  generateHashtags,
} from '../../shared/openai/index.js';
import {
  detectedLanguage,
  translateHandler,
  type DetectLanguageResult,
  type TranslateResult,
} from '../../shared/translate/index.js';

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export class CommonService {
  checkBadWord(text: string): {
    flagged: boolean;
    categories: { harassment: boolean };
  } {
    const wordList = (
      typeof leoProfanity.list === 'function' ? leoProfanity.list() : []
    ).filter(
      (word: string) => /^[\x00-\x7F]+$/.test(word) && word.trim().length >= 3,
    );

    const input = text.toLowerCase().trim();
    let flagged = false;

    for (const word of wordList) {
      if (!word || typeof word !== 'string') continue;
      try {
        const safe = escapeRegex(word.toLowerCase().trim());
        const pattern = new RegExp(`\\b${safe}\\b`, 'i');
        if (pattern.test(input)) {
          flagged = true;
          break;
        }
      } catch {
        // skip malformed patterns
      }
    }

    return {
      flagged,
      categories: { harassment: flagged },
    };
  }

  private async consumeDailyLimit(
    kind: 'hashtags' | 'caption',
    userId: string,
  ): Promise<void> {
    const max = env.OPENAI_DAILY_LIMIT;
    if (!isRedisEnabled()) return;

    const today = new Date().toISOString().slice(0, 10);
    const key = `openai_daily_limit:${kind}:${userId}:${today}`;
    const redis = getRedis();
    const count = await redis.incr(key);
    if (count === 1) {
      await redis.expire(key, 86_400);
    }
    if (count > max) {
      throw new TooManyRequestsError("You have reached todays limit");
    }
  }

  async generateHashtags(userId: string, content: string): Promise<string> {
    if (!content?.trim()) {
      throw new ValidationError('Missing content field in the request body');
    }
    if (content.length > 200) {
      throw new ValidationError('Prompt exceeds 200 characters limit');
    }
    await this.consumeDailyLimit('hashtags', userId);
    return generateHashtags(content.trim());
  }

  async generateCaption(userId: string, content: string): Promise<string> {
    if (!content?.trim()) {
      throw new ValidationError('Missing content field in the request body');
    }
    if (content.length > 200) {
      throw new ValidationError('Prompt exceeds 200 characters limit');
    }
    await this.consumeDailyLimit('caption', userId);
    return generateCaption(content.trim());
  }

  async translate(input: {
    text: string;
    sourceLanguage?: string;
    targetLanguage?: string;
  }): Promise<TranslateResult> {
    const text = input.text?.trim();
    if (!text) {
      throw new ValidationError('Missing text field in the request body');
    }
    return translateHandler(
      text,
      input.sourceLanguage?.trim() || 'auto',
      input.targetLanguage?.trim() || 'en',
    );
  }

  async detectLanguage(text: string): Promise<DetectLanguageResult> {
    const value = text?.trim();
    if (!value) {
      throw new ValidationError('Missing text field in the request body');
    }
    return detectedLanguage(value);
  }
}
