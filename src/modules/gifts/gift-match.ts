import legacyGiftSource from './legacy-gift-source.json' with { type: 'json' };
import {
  giftIconStorageKey,
  isGenericGiftType,
} from './gift-icon.js';

export type GiftLookupRow = {
  id: number;
  uuid: string;
  title: string;
  iconRaw: string;
  amount: number;
  currency: string;
};

const LEGACY_BY_SOURCE_ID = legacyGiftSource as Record<
  string,
  { title: string; icon: string }
>;

function byUuid(catalog: GiftLookupRow[], type: string): GiftLookupRow | undefined {
  return catalog.find(
    (g) => g.uuid === type || g.uuid.startsWith(type) || type.startsWith(g.uuid),
  );
}

function byTitle(catalog: GiftLookupRow[], title: string): GiftLookupRow | undefined {
  const want = title.trim().toLowerCase();
  if (!want) return undefined;
  return catalog.find((g) => g.title.trim().toLowerCase() === want);
}

function byId(catalog: GiftLookupRow[], id: string): GiftLookupRow | undefined {
  if (!id) return undefined;
  return catalog.find((g) => String(g.id) === id);
}

function byIconKey(
  catalog: GiftLookupRow[],
  icon: string,
): GiftLookupRow | undefined {
  const key = giftIconStorageKey(icon);
  if (!key) return undefined;
  return catalog.find((g) => giftIconStorageKey(g.iconRaw) === key);
}

/**
 * Map a post_gifts row onto the catalog.
 * New sends store catalog uuid in `gift_type`. Linkgram import stored `coin`
 * plus `meta.sourceGiftId` (original gifts.id).
 */
export function matchCatalogGift(
  catalog: GiftLookupRow[],
  input: {
    giftType?: string | null;
    sourceGiftId?: string | number | null;
  },
): GiftLookupRow | null {
  const type = String(input.giftType ?? '').trim();
  if (type && !isGenericGiftType(type)) {
    const matched =
      byUuid(catalog, type) || byTitle(catalog, type) || byId(catalog, type);
    if (matched) return matched;
  }

  const sourceId = String(input.sourceGiftId ?? '').trim();
  if (sourceId) {
    const legacy = LEGACY_BY_SOURCE_ID[sourceId];
    if (legacy) {
      const matched =
        byIconKey(catalog, legacy.icon) || byTitle(catalog, legacy.title);
      if (matched) return matched;
      if (legacy.icon || legacy.title) {
        return {
          id: Number(sourceId) || 0,
          uuid: '',
          title: legacy.title || 'Gift',
          iconRaw: legacy.icon,
          amount: 0,
          currency: 'coin',
        };
      }
    }
    const bySourceId = byId(catalog, sourceId);
    if (bySourceId && !legacy) return bySourceId;
  }

  return null;
}
