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
const DEBUG_REDIS_CACHE = false;

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

  constructor(scopeName: string) {
    this.scopeName = scopeName;
    this.redisClient = createRedisClient(REDIS_PORT, REDIS_HOST);
    this.redisClient.on("error", err => console.log('RedisCache: redis client error:', err));
  }

  /**
   * Cache wrapper for JSON objects, up to a certain TTL
   * @param uid Unique ID of the cached object
   * @param ttl Time to live, in seconds
   * @param objectResolver An Async function that resolves the object, if missing from the cache
   * @param cacheTransformer (optional) Re-processes (and saves) cached objects - used from time to time to migrate/clean the DB
   */
  async cachedGetJSON<T>(uid: string, ttl: number, objectResolver: () => Promise<T>, cacheTransformer?: (input: object) => object): Promise<T> {
    const key = `cache:${this.scopeName}:${uid}`;
    const currentUnixTime = ~~(Date.now() / 1000);

    // use the cached object, if present and fresh
    const uidAlreadyPResent = Boolean(await this.redisClient.exists(key));
    if (uidAlreadyPResent) {
      const ts: number = parseInt(String(await this.redisClient.hget(key, 'ts')));
      // if the ttl isn't expired yet, return the cached JSON object
      if ((ts + ttl) > currentUnixTime) {
        const resultString = String(await this.redisClient.hget(key, 'object'));
        if (!resultString) console.error(`RedisCache: error retrieving object for ${key}`);
        let result = JSON.parse(resultString);
        if (DEBUG_REDIS_CACHE)
          console.log(` using cached ${typeof result}: ${uid}`);
        // transform object, if requested
        if (cacheTransformer) {
          result = cacheTransformer(result);
          if (result != null) {
            if (DEBUG_REDIS_CACHE)
              console.log(`   transformed loaded object: ${uid}. saving.`);
            await this.redisClient.hset(key, 'object', JSON.stringify(result));
          } else
            console.error(` ERROR transforming loaded object ${uid}`);
        }
        return result;
      }
    }

    // resolve the non-cached result (and bail if null)
    let result: T = await objectResolver();
    if (result == null)
      return result;
    // if (cacheTransformer) {
    //   result = cacheTransformer(result);
    //   if (result == null) {
    //     console.error(`RedisCache.cachedGet: the saved object transformed nullified the object`);
    //     return result;
    //   }
    // }

    // save to cache
    await this.redisClient.hmset(key, 'ts', currentUnixTime.toString(), 'object', JSON.stringify(result));
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
