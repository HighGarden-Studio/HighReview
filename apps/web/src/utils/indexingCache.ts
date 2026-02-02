import { openDB, DBSchema, IDBPDatabase } from 'idb';

interface IndexingCacheEntry {
  owner: string;
  repo: string;
  cachedAt: number; // timestamp
  loadedFiles: string[]; // list of file paths
  totalFiles: number;
  expiresAt: number; // timestamp
}

interface IndexingCacheDB extends DBSchema {
  indexingCache: {
    key: string; // "owner/repo"
    value: IndexingCacheEntry;
  };
}

const DB_NAME = 'highreview-indexing-cache';
const STORE_NAME = 'indexingCache';
const CACHE_VERSION = 1;
const CACHE_VALIDITY_DAYS = 7; // Cache valid for 7 days

let dbPromise: Promise<IDBPDatabase<IndexingCacheDB>> | null = null;

async function getDB(): Promise<IDBPDatabase<IndexingCacheDB>> {
  if (!dbPromise) {
    dbPromise = openDB<IndexingCacheDB>(DB_NAME, CACHE_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      },
    });
  }
  return dbPromise;
}

/**
 * Get cache key for a repository
 */
function getCacheKey(owner: string, repo: string): string {
  return `${owner}/${repo}`;
}

/**
 * Check if cache exists and is still valid for a repository
 */
export async function hasValidIndexingCache(
  owner: string,
  repo: string
): Promise<boolean> {
  try {
    const db = await getDB();
    const key = getCacheKey(owner, repo);
    const entry = await db.get(STORE_NAME, key);

    if (!entry) {
      console.log('[IndexingCache] No cache found for:', key);
      return false;
    }

    const now = Date.now();
    if (now > entry.expiresAt) {
      console.log('[IndexingCache] Cache expired for:', key);
      // Clean up expired cache
      await db.delete(STORE_NAME, key);
      return false;
    }

    console.log('[IndexingCache] Valid cache found for:', key, {
      cachedAt: new Date(entry.cachedAt).toISOString(),
      expiresAt: new Date(entry.expiresAt).toISOString(),
      totalFiles: entry.totalFiles,
    });

    return true;
  } catch (error) {
    console.error('[IndexingCache] Error checking cache:', error);
    return false;
  }
}

/**
 * Get cached indexing data for a repository
 */
export async function getIndexingCache(
  owner: string,
  repo: string
): Promise<IndexingCacheEntry | null> {
  try {
    const db = await getDB();
    const key = getCacheKey(owner, repo);
    const entry = await db.get(STORE_NAME, key);

    if (!entry) {
      return null;
    }

    const now = Date.now();
    if (now > entry.expiresAt) {
      console.log('[IndexingCache] Cache expired, removing:', key);
      await db.delete(STORE_NAME, key);
      return null;
    }

    return entry;
  } catch (error) {
    console.error('[IndexingCache] Error getting cache:', error);
    return null;
  }
}

/**
 * Save indexing cache for a repository
 */
export async function saveIndexingCache(
  owner: string,
  repo: string,
  loadedFiles: string[],
  totalFiles: number
): Promise<void> {
  try {
    const db = await getDB();
    const key = getCacheKey(owner, repo);
    const now = Date.now();
    const expiresAt = now + CACHE_VALIDITY_DAYS * 24 * 60 * 60 * 1000;

    const entry: IndexingCacheEntry = {
      owner,
      repo,
      cachedAt: now,
      loadedFiles,
      totalFiles,
      expiresAt,
    };

    await db.put(STORE_NAME, entry, key);

    console.log('[IndexingCache] Saved cache:', key, {
      totalFiles,
      expiresAt: new Date(expiresAt).toISOString(),
    });
  } catch (error) {
    console.error('[IndexingCache] Error saving cache:', error);
  }
}

/**
 * Clear cache for a specific repository
 */
export async function clearIndexingCache(
  owner: string,
  repo: string
): Promise<void> {
  try {
    const db = await getDB();
    const key = getCacheKey(owner, repo);
    await db.delete(STORE_NAME, key);
    console.log('[IndexingCache] Cleared cache:', key);
  } catch (error) {
    console.error('[IndexingCache] Error clearing cache:', error);
  }
}

/**
 * Clear all expired caches
 */
export async function clearExpiredCaches(): Promise<void> {
  try {
    const db = await getDB();
    const now = Date.now();
    const allKeys = await db.getAllKeys(STORE_NAME);

    let clearedCount = 0;
    for (const key of allKeys) {
      const entry = await db.get(STORE_NAME, key);
      if (entry && now > entry.expiresAt) {
        await db.delete(STORE_NAME, key);
        clearedCount++;
      }
    }

    if (clearedCount > 0) {
      console.log(`[IndexingCache] Cleared ${clearedCount} expired caches`);
    }
  } catch (error) {
    console.error('[IndexingCache] Error clearing expired caches:', error);
  }
}

/**
 * Get all cached repositories
 */
export async function getAllCachedRepositories(): Promise<Array<{ owner: string; repo: string; cachedAt: Date; expiresAt: Date }>> {
  try {
    const db = await getDB();
    const allEntries = await db.getAll(STORE_NAME);

    return allEntries.map(entry => ({
      owner: entry.owner,
      repo: entry.repo,
      cachedAt: new Date(entry.cachedAt),
      expiresAt: new Date(entry.expiresAt),
    }));
  } catch (error) {
    console.error('[IndexingCache] Error getting all cached repositories:', error);
    return [];
  }
}
