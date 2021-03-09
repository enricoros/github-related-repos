/**
 * GitHubAPI: low-lever accessor for the GraphQL GitHub API
 *
 * Data retrieval is implemented via parametric GraphQL queries, defined in
 * 'github-queries.graphql' and inlined in this file, including parameter setting.
 */

import 'graphql-import-node-as-string';
import assert from "assert";
import axios, {AxiosError, AxiosInstance, AxiosResponse} from "axios";
import {Agent as HttpsAgent} from "https";
import {err, log, unixTimeNow} from "./Utils";

// Configuration of this module
const VERBOSE_FETCHES = false;
const DANGER_DISABLE_SLEEP = false;

// Generate your Personal Access Token here: https://github.com/settings/tokens
const GITHUB_PA_TOKEN = process.env.GITHUB_PA_TOKEN || '';
if (GITHUB_PA_TOKEN === '') {
  err(`No GITHUB_PA_TOKEN environment variable provided.`);
  process.exit(1);
}

// all queries used later by GraphQL (single file - NOTE: consider splitting in the future, maybe)
const gqlQueries = require('./github-queries.graphql')


/**
 * Response from the GraphQL queries to GitHub
 * NOTE: keep in sync with github-queries.graphql (!!!)
 */
export namespace GQL {
  // repo name -> stars count
  export interface RepoStarsCount {
    repository: {
      stargazerCount: number,
    }
  }

  // all users (and timestamps) that starred a specific repo [paginated]
  export interface RepoStarrings {
    repository: {
      stargazers: {
        pageInfo: CommonPageInfo,
        edges: {
          starredAt: string,
        }[],
        nodes: {
          id: string,
          login: string,
        }[],
      },
    },
  }

  // all repos starred by a user [paginated]
  export interface UserStarredRepos {
    user: {
      starredRepositories: CommonRepoStarring,
    },
  }

  // all repos starred by a user list [outer list sub-slicing, plus inner pagination]
  export interface UserListStarredRepos {
    nodes: {
      login: string,
      starredRepositories: CommonRepoStarring,
    }[],
  }

  // RepoID[] -> advanced repository information[]
  export interface RepoListDetails {
    nodes: RepoAdvanced[],
  }

  //// Common parts

  interface CommonRepoStarring {
    totalCount: number,
    edges: {
      starredAt: string,
      node: RepoBasic,
    }[],
    pageInfo: CommonPageInfo,
  }

  interface RepoBasic {
    id: string,
    nameWithOwner: string,
    isArchived: boolean,
    isFork: boolean,
    createdAt: string,
    pushedAt: string,
    stargazerCount: number,
  }

  interface RepoAdvanced extends RepoBasic {
    description: string,
    watchers: {
      totalCount: number,
    },
    forkCount: number,
    issues: {
      totalCount: number,
    },
    pullRequests: {
      totalCount: number,
    },
    releases: {
      totalCount: number,
    },
    repositoryTopics: {
      totalCount: number,
      nodes: {
        topic: {
          name: string,
        }
      }[],
    },
    mentionableUsers: {
      totalCount: number,
    },
    assignableUsers: {
      totalCount: number,
    },
  }

  interface CommonPageInfo {
    endCursor: string,
    hasNextPage: boolean,
  }
}

/**
 * Response from the REST GET API
 * Specialized interface definitions have been removed from this file when transitioning to GraphQL
 */

/*export interface ShortResponse<T = any> {
  data: T;
  status: number;
  headers: any;
}*/


export class GitHubAPI {
  private readonly axiosInstance: AxiosInstance;
  private static defaultHeaders = {
    Accept: 'application/vnd.github.v3+json',
    Authorization: GITHUB_PA_TOKEN ? `token ${GITHUB_PA_TOKEN}` : undefined,
  }

  constructor() {
    // Recyclable AXIOS instance
    this.axiosInstance = axios.create({
      baseURL: 'https://api.github.com/',
      httpsAgent: new HttpsAgent({keepAlive: true}),
      timeout: 60000,
      maxContentLength: 10 * 1024 * 1024, // 10MB
    });
  }

  static repoFullNameToParts(repoFullName: string): { owner: string, name: string } {
    const tokens: string[] = repoFullName.split('/');
    assert(tokens.length === 2, `repoFullNameToParts: expecting 2 owner/repo as repoFullName: ${repoFullName}`);
    return {owner: tokens[0], name: tokens[1]};
  }

  /// GraphQL -- High Order functions

  gqlRepoStarsCount = async (owner: string, name: string)
    : Promise<GQL.RepoStarsCount> =>
    await this.queryGraphQL<GQL.RepoStarsCount>({
      query: gqlQueries,
      operationName: 'RepoStarsCount',
      variables: {
        owner,
        name,
      }
    });

  gqlRepoStarrings = async (owner: string, name: string, cursorAfter?: string)
    : Promise<GQL.RepoStarrings> =>
    await this.queryGraphQL<GQL.RepoStarrings>({
      query: gqlQueries,
      operationName: 'RepoStarrings',
      variables: {
        owner,
        name,
        after: cursorAfter,
      }
    });

  gqlUserStarredRepos = async (login: string, cursorAfter?: string)
    : Promise<GQL.UserStarredRepos> =>
    await this.queryGraphQL<GQL.UserStarredRepos>({
      query: gqlQueries,
      operationName: 'UserStarredRepos',
      variables: {
        login,
        after: cursorAfter,
      }
    });

  gqlUserListStarredRepos = async (userIDs: string[])
    : Promise<GQL.UserListStarredRepos> =>
    await this.queryGraphQL<GQL.UserListStarredRepos>({
      query: gqlQueries,
      operationName: 'UserListStarredRepos',
      variables: {
        ids: userIDs,
      }
    });

  gqlRepoListDetails = async (repoIDs: string[])
    : Promise<GQL.RepoListDetails> =>
    await this.queryGraphQL<GQL.RepoListDetails>({
      query: gqlQueries,
      operationName: 'RepoListDetails',
      variables: {
        ids: repoIDs,
      }
    });

  static async gqlMultiPageDataHelper<T>(
    dataQueryAsync: (lastCursor?: string) => Promise<T>,
    dataAccumulator: (data: T) => boolean,  // true to continue the fetch, false to stop
    cursorUpdate: (data: T) => [hasMoreData: boolean, nextCursor: string],
    firstCursor?: string
  ): Promise<void> {
    // let pageIdx = 1;
    let hasMoreData: boolean = true;
    let lastCursor: string = firstCursor;
    while (hasMoreData) {
      // log(`\n - fetching page ${pageIdx++}`);
      const data = await dataQueryAsync(lastCursor);
      // special case to abort the operation and return null
      const proceed = dataAccumulator(data);
      if (!proceed)
        return;
      [hasMoreData, lastCursor] = cursorUpdate(data);
      assert(lastCursor, 'expected a cursor for every query');
    }
  }

  /// REST API - low level function

  /*async getREST<T>(path: string, extraHeaders?: Object): Promise<ShortResponse<T>> {
    const axiosRequestConfig = {
      headers: Object.assign({}, GitHubAPI.defaultHeaders, extraHeaders || {}),
    }
    const fetchStart = Date.now();
    try {
      if (VERBOSE_FETCHES) process.stdout.write(` ${path}: `);
      const axiosResponse: AxiosResponse = await this.axiosInstance.get(path, axiosRequestConfig);
      const fetchElapsed = Date.now() - fetchStart;
      if (VERBOSE_FETCHES) process.stdout.write(`${fetchElapsed} ms\n`);
      GitHubAPI.validateAxiosResponse(axiosResponse, path);
      await GitHubAPI.handleGitHubRateLimiter(axiosResponse.headers, path, fetchElapsed);
      return {
        data: axiosResponse.data,
        headers: axiosResponse.headers,
        status: axiosResponse.status,
      };
    } catch (e) {
      return GitHubAPI.handleAxiosException(e, path, Date.now() - fetchStart);
    }
  }*/

  /// Private functions ///

  /**
   * Performs a GraphQL query - which is just a POST with some GraphQL validation of the response
   * @param qlQuery
   * @param extraHeaders
   */
  private async queryGraphQL<T>(qlQuery: string | object, extraHeaders?: Object): Promise<T> {
    const path = '/graphql';
    const axiosRequestConfig = {
      headers: Object.assign({}, GitHubAPI.defaultHeaders, extraHeaders || {}),
    }
    const fetchStart = Date.now();
    try {
      if (VERBOSE_FETCHES) process.stdout.write(` ${path}: `);
      const axiosResponse: AxiosResponse = await this.axiosInstance.post(path, qlQuery, axiosRequestConfig);
      const fetchElapsed = Date.now() - fetchStart;
      if (VERBOSE_FETCHES) process.stdout.write(`${fetchElapsed} ms\n`);
      GitHubAPI.validateAxiosResponse(axiosResponse, path);
      await GitHubAPI.handleGitHubRateLimiter(axiosResponse.headers, path, fetchElapsed);
      // GraphQL-specific
      if (GitHubAPI.handleGraphQLErrors(axiosResponse.data, qlQuery))
        return null;
      return axiosResponse.data['data'];
    } catch (e) {
      return GitHubAPI.handleAxiosException(e, path, Date.now() - fetchStart);
    }
  }

  /// Static Helpers ///

  private static validateAxiosResponse(axiosResponse: AxiosResponse, path: string) {
    if (axiosResponse.status !== 200)
      err(`GitHubAPI.safeRequest: status is not 200 for: ${path}: ${axiosResponse}`);
  }

  /**
   * Helps with Rate Limiting, communicated by GitHub via HTTP response headers
   * @param headers the HTTP headers of the response
   * @param path the HTTP path of the response
   * @param fetchElapsed the amount of time already elapsed for the Fetching of the data - to shorten a possible rate limiting delay
   */
  private static async handleGitHubRateLimiter(headers: object, path: string, fetchElapsed: number) {
    // API limiter: sleep to meet quotas
    const hasRateLimiter =
      headers.hasOwnProperty('x-ratelimit-limit') &&
      headers.hasOwnProperty('x-ratelimit-remaining') &&
      headers.hasOwnProperty('x-ratelimit-reset');
    if (hasRateLimiter) {
      const currentTs = unixTimeNow();
      const resetTs = parseInt(headers['x-ratelimit-reset']);
      const secondsRemaining = resetTs - currentTs + 10;
      const callsRemaining = parseInt(headers['x-ratelimit-remaining']);
      // sleep to delay
      if (secondsRemaining > 0 && callsRemaining >= 0 && secondsRemaining <= 3700 && callsRemaining <= 20000) {
        let forcedDelayMs = 0;
        if (callsRemaining > 0) {
          const aggressiveness = 2; // 1: even spacing, 2: more towards the beginning, etc..
          forcedDelayMs = -fetchElapsed + ~~(1000 * secondsRemaining / callsRemaining / aggressiveness);
        } else {
          // if there are no calls left after this one, sleep for whatever time remaining +1s
          forcedDelayMs = 1000 * secondsRemaining + 1000;
        }
        if (forcedDelayMs > 0) {
          if (DANGER_DISABLE_SLEEP) {
            if (VERBOSE_FETCHES)
              log(`   ...SKIP sleeping for ${forcedDelayMs} ms (${callsRemaining} left for ${secondsRemaining}s)`);
          } else {
            await new Promise(resolve => setTimeout(resolve, forcedDelayMs))
            if (VERBOSE_FETCHES)
              log(`   ...slept ${forcedDelayMs} ms (${callsRemaining} left for ${secondsRemaining}s)`);
          }
        }
      } else
        err(`GitHubAPI.safeRequest: bad rate limiter (${callsRemaining}, in ${secondsRemaining}s) for: ${path}`)
    } else
      err(`GitHubAPI.safeRequest: no rate limiter for: ${path}`);
  }

  /**
   * Explains an Axios Exception
   */
  private static handleAxiosException(e: any, path, callDuration: number): null {
    // handle Axios errors
    if (e.response) {
      const axiosError = e as AxiosError;
      if (axiosError.response.status === 401)
        err(`GitHubAPI.safeRequest: 401: while accessing ${path}. Likely cause: INVALID GitHub Personal Access Token.`);
      else if (axiosError.response.status === 404)
        log(`GitHubAPI.safeRequest: 404: ${path} not found (anymore). ret: null.`);
      else if (axiosError.response.status === 451)
        log(`GitHubAPI.safeRequest: 451: ${path} repo access blocked (dmca?). ret: null.`);
      else
        err(`GitHubAPI.safeRequest: ${axiosError.response.status}: ${path} GET error (${callDuration} ms):`, e);
      if (axiosError?.response?.data)
        log(`server-response:`, axiosError?.response?.data);
      return null;
    }
    // handle other errors
    err(`GitHubAPI.safeRequest: ${path} GET (non-Axios) error (${callDuration} ms):`, e);
    return null;
  }

  /**
   * Detects and explains a GraphQL query Error
   */
  private static handleGraphQLErrors(responseData: any, qlQuery: string | object): boolean {
    const hasErrors = responseData.hasOwnProperty('errors');
    if (hasErrors)
      log(`GitHubAPI.handleGraphQLErrors: GraphQL errors:`, responseData['errors']);
    const missesData = !responseData.hasOwnProperty('data') || typeof responseData['data'] !== 'object';
    if (missesData)
      err(`GitHubAPI.handleGraphQLErrors: GraphQL missing data in the response`);
    const somethingWrong = hasErrors || missesData;
    if (somethingWrong)
      log(`GitHubAPI.handleGraphQLErrors: the query was:`, JSON.stringify(qlQuery, null, 2));
    return somethingWrong;
  }
}
