import type { Knex } from 'knex';

/**
 * Default coin packages for Purchase Coin UI / IAP.
 * Product IDs use amount_usd_cent (e.g. coins_100 = $1.00).
 */
export type CoinPackageSeedRow = {
  uuid: string;
  name: string;
  coins: number;
  bonusCoins: number;
  amountUsdCent: number;
  googleProductId: string;
  iosProductId: string;
  sortOrder: number;
};

export const COIN_PACKAGE_CATALOG_SEED: CoinPackageSeedRow[] = [
  {
    uuid: 'c0df9ab4-7c7e-42be-9529-027661f18a90',
    name: '50 Coins',
    coins: 50,
    bonusCoins: 0,
    amountUsdCent: 100,
    googleProductId: 'com.onevibe.coins_100',
    iosProductId: 'com.onevibe.coins_100',
    sortOrder: 10,
  },
  {
    uuid: '7d43f8ff-5686-499a-a585-09522d927bb0',
    name: '250 Coins',
    coins: 250,
    bonusCoins: 0,
    amountUsdCent: 500,
    googleProductId: 'com.onevibe.coins_500',
    iosProductId: 'com.onevibe.coins_500',
    sortOrder: 20,
  },
  {
    uuid: '89232c16-d5df-4bab-944a-13d4eef07c17',
    name: '500 Coins',
    coins: 500,
    bonusCoins: 0,
    amountUsdCent: 1000,
    googleProductId: 'com.onevibe.coins_1000',
    iosProductId: 'com.onevibe.coins_1000',
    sortOrder: 30,
  },
  {
    uuid: 'e358c8db-2ab0-421b-bb60-232017e9e9bf',
    name: '1250 Coins',
    coins: 1250,
    bonusCoins: 50,
    amountUsdCent: 2500,
    googleProductId: 'com.onevibe.coins_2500',
    iosProductId: 'com.onevibe.coins_2500',
    sortOrder: 40,
  },
  {
    uuid: '550ee8ed-73dc-4eb7-bc0f-de5b3522a6f9',
    name: '2500 Coins',
    coins: 2500,
    bonusCoins: 150,
    amountUsdCent: 5000,
    googleProductId: 'com.onevibe.coins_5000',
    iosProductId: 'com.onevibe.coins_5000',
    sortOrder: 50,
  },
  {
    uuid: '55a07090-88c3-4a24-b19d-2f211e7b4cbe',
    name: '5000 Coins',
    coins: 5000,
    bonusCoins: 400,
    amountUsdCent: 10000,
    googleProductId: 'com.onevibe.coins_10000',
    iosProductId: 'com.onevibe.coins_10000',
    sortOrder: 60,
  },
  {
    uuid: '5b33b690-4687-4f84-93be-4d45003a44c5',
    name: '12500 Coins',
    coins: 12500,
    bonusCoins: 1000,
    amountUsdCent: 25000,
    googleProductId: 'com.onevibe.coins_25000',
    iosProductId: 'com.onevibe.coins_25000',
    sortOrder: 70,
  },
  {
    uuid: '0ef164c5-bdb5-48e9-8114-8bf2c94fc79d',
    name: '25000 Coins',
    coins: 25000,
    bonusCoins: 3000,
    amountUsdCent: 50000,
    googleProductId: 'com.onevibe.coins_50000',
    iosProductId: 'com.onevibe.coins_50000',
    sortOrder: 80,
  },
  {
    uuid: '79f195d5-ae44-4e1c-b817-23b0b7fd19f5',
    name: '50000 Coins',
    coins: 50000,
    bonusCoins: 7500,
    amountUsdCent: 100000,
    googleProductId: 'com.onevibe.coins_100000',
    iosProductId: 'com.onevibe.coins_100000',
    sortOrder: 90,
  },
];

/**
 * Idempotent: skips insert when any active package already exists.
 */
export async function seedCoinPackagesCatalog(knex: Knex): Promise<number> {
  const existing = await knex('coin_packages')
    .where({ is_active: true })
    .whereNull('deleted_at')
    .first('id');
  if (existing) return 0;

  await knex('coin_packages').insert(
    COIN_PACKAGE_CATALOG_SEED.map((p) => ({
      uuid: p.uuid,
      name: p.name,
      coins: p.coins,
      bonus_coins: p.bonusCoins,
      amount_usd_cent: p.amountUsdCent,
      google_product_id: p.googleProductId,
      ios_product_id: p.iosProductId,
      sort_order: p.sortOrder,
      is_active: true,
    })),
  );

  return COIN_PACKAGE_CATALOG_SEED.length;
}
