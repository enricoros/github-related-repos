/**
 * GitHubAPI: simple class for accessing REST APIs from GitHub.
 *
 * A bit too tangled for now, but cleaning it is not the highest priority.
 *
 * Uses Axios for REST API calls.
 */

import axios, {AxiosError, AxiosInstance, AxiosResponse} from "axios";
import {Agent as HttpsAgent} from "https";
import {err, log, unixTimeNow} from "./Utils";

// Configuration of this module
const VERBOSE_FETCHES = true;


// Generate your Personal Access Token here: https://github.com/settings/tokens
const GITHUB_PA_TOKEN = process.env.GITHUB_PA_TOKEN || '';
if (GITHUB_PA_TOKEN === '') {
  err(`No GITHUB_PA_TOKEN environment variable provided.`);
  process.exit(1);
}


// Mirror definition for "vnd.github.v3+json" JSON Object types
// NOTE: commented-out props are deemed not useful and removed from the returned objects
export namespace GHTypes {

  // endpoint: /repos/${repoFullName}/stargazers [when requested as 'vnd.github.v3.star+json']
  export interface Starring {
    starred_at: string, //
    user: OwnerBasics,
  }

  // endpoint: /users/${login}
  // noinspection JSUnusedGlobalSymbols
  export interface User extends OwnerBasics {
    name: string, // "Enrico Ros",
    company?: string, // null
    blog?: string, // "https://www.enricoros.com",
    location?: string, // null,
    email?: string, // null,
    hireable?: string, // null,
    bio?: string, // null,
    twitter_username?: string, // null,
    public_repos: number, // 46,
    public_gists: number, // 6,
    followers: number, // 17,
    following: number, // 7,
    created_at: string, // "2008-11-06T15:55:25Z",
    updated_at: string, // "2020-12-21T23:21:39Z"
  }

  interface OwnerBasics {
    login: string, // "enricoros",
    id: number, // 32999,
    node_id: number, // "MDQ6VXNlcjMyOTk5",
    avatar_url: string, // "https://avatars0.githubusercontent.com/u/32999?v=4",
    // gravatar_id: string, // "",
    url: string, // "https://api.github.com/users/enricoros",
    // html_url: string, // "https://github.com/enricoros",
    // followers_url: string, // "https://api.github.com/users/enricoros/followers",
    // following_url: string, // "https://api.github.com/users/enricoros/following{/other_user}",
    // gists_url: string, // "https://api.github.com/users/enricoros/gists{/gist_id}",
    // starred_url: string, // "https://api.github.com/users/enricoros/starred{/owner}{/repo}",
    // subscriptions_url: string, // "https://api.github.com/users/enricoros/subscriptions",
    // organizations_url: string, // "https://api.github.com/users/enricoros/orgs",
    // repos_url: string, // "https://api.github.com/users/enricoros/repos",
    // events_url: string, // "https://api.github.com/users/enricoros/events{/privacy}",
    // received_events_url: string, // "https://api.github.com/users/enricoros/received_events",
    type: string, // "User", "Organization"
    site_admin: boolean, // false
  }

  // endpoint: /repos/${repoFullName}, /repositories/${repoId}
  export interface Repo extends RepoBasics {
    /*"temp_clone_token": "",*/
    "organization": OwnerBasics,
    "network_count": number, // 301,
    "subscribers_count": number, // 77
  }

  export interface RepoBasics {
    "id": number, // 219035799,
    "node_id": string, // "MDEwOlJlcG9zaXRvcnkyMTkwMzU3OTk=",
    "name": string, // "tokenizers",
    "full_name": string, // "huggingface/tokenizers",
    "private": boolean, // false,
    "owner": OwnerBasics,

    "html_url": string, // "https://github.com/huggingface/tokenizers",
    "description": string, // "💥 Fast State-of-the-Art Tokenizers optimized for Research and Production",
    "fork": boolean, // false,
    /*"url": "https://api.github.com/repos/huggingface/tokenizers",
    "forks_url": "https://api.github.com/repos/huggingface/tokenizers/forks",
    "keys_url": "https://api.github.com/repos/huggingface/tokenizers/keys{/key_id}",
    "collaborators_url": "https://api.github.com/repos/huggingface/tokenizers/collaborators{/collaborator}",
    "teams_url": "https://api.github.com/repos/huggingface/tokenizers/teams",
    "hooks_url": "https://api.github.com/repos/huggingface/tokenizers/hooks",
    "issue_events_url": "https://api.github.com/repos/huggingface/tokenizers/issues/events{/number}",
    "events_url": "https://api.github.com/repos/huggingface/tokenizers/events",
    "assignees_url": "https://api.github.com/repos/huggingface/tokenizers/assignees{/user}",
    "branches_url": "https://api.github.com/repos/huggingface/tokenizers/branches{/branch}",
    "tags_url": "https://api.github.com/repos/huggingface/tokenizers/tags",
    "blobs_url": "https://api.github.com/repos/huggingface/tokenizers/git/blobs{/sha}",
    "git_tags_url": "https://api.github.com/repos/huggingface/tokenizers/git/tags{/sha}",
    "git_refs_url": "https://api.github.com/repos/huggingface/tokenizers/git/refs{/sha}",
    "trees_url": "https://api.github.com/repos/huggingface/tokenizers/git/trees{/sha}",
    "statuses_url": "https://api.github.com/repos/huggingface/tokenizers/statuses/{sha}",
    "languages_url": "https://api.github.com/repos/huggingface/tokenizers/languages",
    "stargazers_url": "https://api.github.com/repos/huggingface/tokenizers/stargazers",
    "contributors_url": "https://api.github.com/repos/huggingface/tokenizers/contributors",
    "subscribers_url": "https://api.github.com/repos/huggingface/tokenizers/subscribers",
    "subscription_url": "https://api.github.com/repos/huggingface/tokenizers/subscription",
    "commits_url": "https://api.github.com/repos/huggingface/tokenizers/commits{/sha}",
    "git_commits_url": "https://api.github.com/repos/huggingface/tokenizers/git/commits{/sha}",
    "comments_url": "https://api.github.com/repos/huggingface/tokenizers/comments{/number}",
    "issue_comment_url": "https://api.github.com/repos/huggingface/tokenizers/issues/comments{/number}",
    "contents_url": "https://api.github.com/repos/huggingface/tokenizers/contents/{+path}",
    "compare_url": "https://api.github.com/repos/huggingface/tokenizers/compare/{base}...{head}",
    "merges_url": "https://api.github.com/repos/huggingface/tokenizers/merges",
    "archive_url": "https://api.github.com/repos/huggingface/tokenizers/{archive_format}{/ref}",
    "downloads_url": "https://api.github.com/repos/huggingface/tokenizers/downloads",
    "issues_url": "https://api.github.com/repos/huggingface/tokenizers/issues{/number}",
    "pulls_url": "https://api.github.com/repos/huggingface/tokenizers/pulls{/number}",
    "milestones_url": "https://api.github.com/repos/huggingface/tokenizers/milestones{/number}",
    "notifications_url": "https://api.github.com/repos/huggingface/tokenizers/notifications{?since,all,participating}",
    "labels_url": "https://api.github.com/repos/huggingface/tokenizers/labels{/name}",
    "releases_url": "https://api.github.com/repos/huggingface/tokenizers/releases{/id}",
    "deployments_url": "https://api.github.com/repos/huggingface/tokenizers/deployments",*/
    "created_at": string, // "2019-11-01T17:52:20Z",
    "updated_at": string, // "2020-12-24T09:36:35Z",
    "pushed_at": string, // "2020-12-23T17:25:34Z",
    /*"git_url": "git://github.com/huggingface/tokenizers.git",
    "ssh_url": "git@github.com:huggingface/tokenizers.git",
    "clone_url": "https://github.com/huggingface/tokenizers.git",
    "svn_url": "https://github.com/huggingface/tokenizers",*/
    "homepage": string, // "https://huggingface.co/docs/tokenizers",
    "size": number, // 4334,
    "stargazers_count": number, // 4102,
    "watchers_count": number, // 4102,
    "language": string, // "Rust",
    "has_issues": boolean, // true,
    "has_projects": boolean, // true,
    "has_downloads": boolean, // true,
    "has_wiki": boolean, // true,
    "has_pages": boolean, // false,
    "forks_count": number, // 301,
    /*"mirror_url": null,*/
    "archived": boolean, // false,
    "disabled": boolean, // false,
    "open_issues_count": number, // 81,
    /*"license": {},*/
    // "forks": number, // 301,
    // "open_issues": number, // 81,
    // "watchers": number, // 4102,
    "default_branch": string, // "master",
    /*"permissions": {},*/
  }

}


export interface ShortResponse<T = any> {
  data: T;
  status: number;
  headers: any;
}

export class GitHubAPI {
  private readonly axiosInstance: AxiosInstance;
  private static defaultHeaders = {
    Accept: 'application/vnd.github.v3+json',
    Authorization: GITHUB_PA_TOKEN ? `token ${GITHUB_PA_TOKEN}` : undefined,
  }
  // This special data type adds the 'starred_at' property on results
  // See: https://docs.github.com/en/free-pro-team@latest/rest/reference/activity#starring
  static stargazerHeaders = {
    Accept: 'application/vnd.github.v3.star+json',
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

  // repo IDs should be 'fullNames' (org/name), but could also be numbers, in which case we change the base
  static apiRepoPath(repoSpec: any) {
    return isNaN(repoSpec) ? `/repos/${repoSpec}` : `/repositories/${repoSpec}`;
  }

  /**
   * @param path
   * @param extraHeaders
   */
  async getResponse<T>(path: string, extraHeaders?: Object): Promise<ShortResponse<T>> {
    const axiosRequestConfig = {
      headers: Object.assign({}, GitHubAPI.defaultHeaders, extraHeaders || {}),
    }
    try {
      const fetchStart = Date.now();
      const axiosResponse: AxiosResponse = await this.axiosInstance.get(path, axiosRequestConfig);
      const fetchElapsed = Date.now() - fetchStart;
      if (VERBOSE_FETCHES) log(` ${path}: ${fetchElapsed} ms`);
      GitHubAPI.validateAxiosResponse(axiosResponse, path);
      await GitHubAPI.handleGitHubRateLimiter(axiosResponse.headers, path, fetchElapsed);
      return {
        data: axiosResponse.data,
        headers: axiosResponse.headers,
        status: axiosResponse.status,
      };
    } catch (e) {
      return GitHubAPI.handleAxiosException(e, path);
    }
  }

  /**
   * Performs a GraphQL query - which is just a POST with some GraphQL validation of the response
   * @param qlQuery
   * @param extraHeaders
   */
  async graphQL<T>(qlQuery: string | object, extraHeaders?: Object): Promise<T> {
    const path = '/graphql';
    const axiosRequestConfig = {
      headers: Object.assign({}, GitHubAPI.defaultHeaders, extraHeaders || {}),
    }
    try {
      const fetchStart = Date.now();
      const axiosResponse: AxiosResponse = await this.axiosInstance.post(path, qlQuery, axiosRequestConfig);
      const fetchElapsed = Date.now() - fetchStart;
      if (VERBOSE_FETCHES) log(` ${path}: ${fetchElapsed} ms`);
      GitHubAPI.validateAxiosResponse(axiosResponse, path);
      await GitHubAPI.handleGitHubRateLimiter(axiosResponse.headers, path, fetchElapsed);
      // GraphQL-specific
      if (GitHubAPI.handleGraphQLErrors(axiosResponse.data))
        return null;
      return axiosResponse.data['data'];
    } catch (e) {
      return GitHubAPI.handleAxiosException(e, path);
    }
  }

  // Static Helpers

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
          await new Promise(resolve => setTimeout(resolve, forcedDelayMs))
          if (VERBOSE_FETCHES)
            log(`   ...slept ${forcedDelayMs} ms (${callsRemaining} left for ${secondsRemaining}s)`);
        }
      } else
        err(`GitHubAPI.safeRequest: bad rate limiter (${callsRemaining}, in ${secondsRemaining}s) for: ${path}`)
    } else
      err(`GitHubAPI.safeRequest: no rate limiter for: ${path}`);
  }

  /**
   * Explains an Axios Exception
   */
  private static handleAxiosException(e: any, path): null {
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
        err(`GitHubAPI.safeRequest: ${path} GET error:`, e);
      if (axiosError?.response?.data)
        log(`server-response:`, axiosError?.response?.data);
      return null;
    }
    // handle other errors
    err(`GitHubAPI.safeRequest: ${path} GET error:`, e);
    return null;
  }

  /**
   * Detects and explains a GraphQL query Error
   */
  private static handleGraphQLErrors(responseData: any): boolean {
    const hasErrors = responseData.hasOwnProperty('errors');
    if (hasErrors)
      log(`GitHubAPI.safeRequest: GraphQL errors:`, responseData['errors']);
    const missesData = !responseData.hasOwnProperty('data') || typeof responseData['data'] !== 'object';
    if (missesData)
      err(`GitHubAPI.safeRequest: GraphQL missing data in the response`);
    return hasErrors || missesData;
  }
}
