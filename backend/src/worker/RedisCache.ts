/**
 * This file interfaces with Redis and provides a caching function for JS objects.
 * If the requested object ID is missing, or the TTL is expired, the Retrieval function
 * is used to update the cache.
 *
 */

import {Commands, RedisClient} from 'redis';
import {createClient as createRedisClient} from 'async-redis';

// Configuration
const REDIS_HOST = process.env.REDIS_HOST || '127.0.0.1';
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379');

// Local definition taken from Async-Redis, to make Typescript happy (and autocompletion happen)
type Omit<T, K extends keyof T> = Pick<T, Exclude<keyof T, K>>;
type Omitted = Omit<RedisClient, keyof Commands<boolean>>;

interface PromisifiedRedis extends Omitted, Commands<Promise<boolean>> {
}

/**
 * Within Redis, the strings will be scoped in the following fashion:
 *  - cache:${scopeName}:${uid}  [hash with 'ts' and 'object' keys]
 * where scopeName is provided in the constructor, and uid are the unique IDs of the objects being cached
 */
export class RedisCache {
  private readonly redisClient: PromisifiedRedis;
  private readonly scopeName: string;
  private readonly defaultTTL: number;

  constructor(scopeName: string, defaultTTL?: number) {
    this.scopeName = scopeName;
    this.defaultTTL = defaultTTL || 24 * 60 * 60; // 1 day if not specified
    this.redisClient = createRedisClient(REDIS_PORT, REDIS_HOST);
    this.redisClient.on("error", err => console.log('RedisCache: redis client error:', err));
  }

  /**
   * Simplified cache wrapper
   * @param uniqueKey Unique ID of the cached object
   * @param producer An Async function that resolves the object, if missing from the cache
   */
  getJSON = async <T>(uniqueKey: string, producer: () => Promise<T>): Promise<T> =>
    await this.cachedGetJSON<T>(uniqueKey, this.defaultTTL, producer);

  /**
   * Cache wrapper for JSON objects, up to a certain TTL
   * @param uid Unique ID of the cached object
   * @param ttl Time to live, in seconds
   * @param objectResolver An Async function that resolves the object, if missing from the cache
   */
  private async cachedGetJSON<T>(uid: string, ttl: number, objectResolver: () => Promise<T | null>): Promise<T | null> {
    const key = this.scopeName + ':' + uid;

    // return the cached key if it exists
    const cachedValue: string | null = (await this.redisClient.get(key)) as unknown as string;
    if (cachedValue !== null)
      return JSON.parse(cachedValue);

    // perform conversion from the previous format
    const CONVERT_OLD_KEYS = true;
    if (CONVERT_OLD_KEYS) {
      const oldKey = `cache:${this.scopeName}:${uid}`;
      const currentUnixTime = ~~(Date.now() / 1000);

      // use the cached object, if present and fresh
      let test = await this.redisClient.hgetall(oldKey);
      if (test !== null) {
        const ts: number = parseInt(test['ts']);
        // if the ttl isn't expired yet, return the cached JSON object
        if ((ts + ttl) > currentUnixTime) {
          const resultString = test['object'];
          if (!resultString)
            console.error(`RedisCache: error retrieving object for ${oldKey}`);
          let result = JSON.parse(resultString);

          // save in the new format
          const remainingTtl = Math.min(ttl, (ts + ttl) - currentUnixTime);
          await this.redisClient.set(key, resultString, 'EX', remainingTtl);

          // delete the old key
          await this.redisClient.del(oldKey);

          return result;
        }
      }
    }

    // resolve the non-cached result (and bail if null)
    const result: T = await objectResolver();
    if (result == null) {
      // NOTE: shall we save this in the cache, so the resolved is not re-invoked?
      return result;
    }

    // save to cache
    await this.redisClient.set(key, JSON.stringify(result), 'EX', ttl);
    return result;
  }

  /*async testRedis() {
    await this.redisClient.set('test:key', 'val');
    const value = await this.redisClient.get('test:key');
    // @ts-ignore
    const success = value === 'val';
    assert(success, 'Redis client: error comparing the value');
    await this.redisClient.del('test:key');
  };*/
}
