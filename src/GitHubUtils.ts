/**
 * GitHubUtils: classes and utility functions for GitHub.
 *
 * A bit too tangled for now, but cleaning it is not the highest priority.
 *
 * Utilizes code from https://github.com/timqian/star-history for finding
 * the 'starrings'; the rest is pretty much original.
 *
 * Uses Axios for REST API calls.
 */

import assert from "assert";
import fs from "fs";
import axios, {AxiosInstance, AxiosResponse} from "axios";
import {Agent as HttpsAgent} from "https";
import {Parser as JSONParser} from "json2csv";
import {RedisCache} from "./RedisCache";
import {err, log, removePropertiesRecursively} from "./Utils";
import RepoRefStats = CrawlerTypes.RepoRefStats;
import {unixTimeNow} from "./Utils";

// Configuration of this module
const VERBOSE_LOGIC = false;
const VERBOSE_FETCHES = true;
const WRITE_OUTPUT_FILES = true;


// Generate your Personal Access Token here: https://github.com/settings/tokens
const GITHUB_PA_TOKEN = process.env.GITHUB_PA_TOKEN || '';
if (GITHUB_PA_TOKEN === '') {
  err(`No GITHUB_PA_TOKEN environment variable provided.`);
  process.exit(1);
}

// NOTE: commented-out props are deemed not useful and removed from the returned objects
namespace GHTypes {
  export interface Starring {
    starred_at: string, //
    user: OwnerBasics,
  }

  // endpoints: /users/${login}
  /*interface User extends OwnerBasics {
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
  }*/


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

}

const removeRepoProps = [
  'url', 'forks_url', 'keys_url', 'collaborators_url', 'teams_url', 'hooks_url', 'issue_events_url', 'events_url',
  'assignees_url', 'branches_url', 'tags_url', 'blobs_url', 'git_tags_url', 'git_refs_url', 'trees_url', 'statuses_url',
  'languages_url', 'stargazers_url', 'contributors_url', 'subscribers_url', 'subscription_url', 'commits_url',
  'git_commits_url', 'comments_url', 'issue_comment_url', 'contents_url', 'compare_url', 'merges_url', 'archive_url',
  'downloads_url', 'issues_url', 'pulls_url', 'milestones_url', 'notifications_url', 'labels_url', 'releases_url',
  'deployments_url', 'git_url', 'ssh_url', 'clone_url', 'svn_url', 'forks', 'open_issues', 'watchers', 'permissions',
]

const removeOwnerProps = [
  'gravatar_id', 'html_url', 'followers_url', 'following_url', 'gists_url', 'starred_url', 'subscriptions_url',
  'organizations_url', 'repos_url', 'events_url', 'received_events_url',
];

const allRemovedProps = [...removeOwnerProps, ...removeRepoProps];

function removeUnusedGitHubProps(obj: object): object {
  removePropertiesRecursively(obj, allRemovedProps);
  return obj;
}


namespace CrawlerTypes {
  export interface Starring extends GHTypes.Starring {
    n: number,
    ts: number,
  }

  export interface RepoRefStats {
    // static
    fullName: string,
    isArchived: boolean,
    isFork: boolean,
    description: string,
    createdAgo: number,
    pushedAgo: number,
    repoStars: number,
    // dynamic
    usersStars: number,
    rightShare: number,
    leftShare: number,
    relevance: number,
    scale: number,
  }
}

const filterWithReason = (list: any[], filterFn, reason) => {
  const initialSize = list.length;
  const smallerList = list.filter(filterFn);
  const finalSize = smallerList.length;
  log(` -- removed ${initialSize - finalSize} elements: ${reason}. Initial size ${initialSize}, final: ${finalSize}.`);
  return smallerList;
}

const unixTimeISO = (isoTime: string) => ~~(new Date(isoTime).getTime() / 1000);
const unixTimeStart = unixTimeNow();
// const unixTime1YearAgo = unixTimeStart - 60 * 60 * 24 * 365;
// const unixTime2MonthsAgo = unixTimeStart - 60 * 60 * 24 * 30 * 2;

const HYPER_PARAMS = {
  related_users_max_stars: 200,
  related_filters: [
    rsList => filterWithReason(rsList, (rs: RepoRefStats) => !rs.isArchived, 'archived'),
    // rsList => filterWithReason(rsList, (rs: RepoRefStats) => rs.updatedTs > unixTime2MonthsAgo, 'no activity in the last 2 months'),
    rsList => filterWithReason(rsList, (rs: RepoRefStats) => rs.leftShare >= 0.005, 'left share < 0.5%'),
    rsList => filterWithReason(rsList, (rs: RepoRefStats) => rs.rightShare >= 0.02, 'right share < 2%'),
    rsList => filterWithReason(rsList, (rs: RepoRefStats) => rs.pushedAgo < 60, 'no activity in the last 2 months'),
  ],
}

export class GitHubCrawler {
  private readonly githubAPI: GitHubUtils;
  private readonly redisCache: RedisCache;

  constructor(githubAPI: GitHubUtils) {
    this.githubAPI = githubAPI;
    this.redisCache = new RedisCache('GitHubCrawler');
  }

  async resolveWave(repoId: string, recursionLevel: number, recursionLimit: number) {
    const outFileName = repoId.replace('/', '_').replace('.', '_')
      + '-' + HYPER_PARAMS.related_users_max_stars;

    // 1. Repo -> Stars(t)
    log(`*** Resolving stars(t) for '${repoId}' (recursion level: ${recursionLevel}/${recursionLimit})...`);
    const starrings: CrawlerTypes.Starring[] = await this.resolveRepoStarrings(repoId);
    if (!starrings)
      return log(`W: issues finding stars(t) of '${repoId}`);
    if (WRITE_OUTPUT_FILES) fs.writeFileSync(`out-${outFileName}-starrings.json`, JSON.stringify(starrings, null, 2));

    // stop recursion if done with the current task
    if (recursionLevel >= recursionLimit)
      return;

    // 2. Related repos: All Users -> Accumulate user's Starred repos
    log(`** Finding the starred repos of ${starrings.length} users (that starred '${repoId}')...`);
    const userLogins: string[] = starrings.map(starring => starring.user.login);
    const relatedRepos: CrawlerTypes.RepoRefStats[] = await this.resolveUsersStarredRepos(userLogins, HYPER_PARAMS.related_users_max_stars);
    if (!relatedRepos || relatedRepos.length < 1)
      return log(`W: issues finding related repos`);
    if (WRITE_OUTPUT_FILES) fs.writeFileSync(`out-${outFileName}-relatedRepos.json`, JSON.stringify(relatedRepos, null, 2));
    if (WRITE_OUTPUT_FILES) fs.writeFileSync(`out-${outFileName}-relatedRepos.csv`, (new JSONParser()).parse(relatedRepos));

    // 3. Select on which repos to recurse, for more details
    log(`** Narrowing down the ${relatedRepos.length} related repositories to relevant repositories...`);
    //const selfRepoStats = relatedRepos[0]; //.shift();
    let relevantRepos = relatedRepos.slice();
    HYPER_PARAMS.related_filters.forEach(filter => relevantRepos = filter(relevantRepos));
    if (WRITE_OUTPUT_FILES) fs.writeFileSync(`out-${outFileName}-relevantRepos.json`, JSON.stringify(relevantRepos, null, 2));
    if (WRITE_OUTPUT_FILES) fs.writeFileSync(`out-${outFileName}-relevantRepos.csv`, (new JSONParser()).parse(relevantRepos));

    // RECUR (only on the Top-popular)
    log(`>> Recurring into ${relevantRepos.length} repositories (most starred by the ${userLogins.length} users of ${repoId}`);
    for (const repo of relevantRepos)
      await this.resolveWave(repo.fullName, recursionLevel + 1, recursionLimit);
  }

  private async resolveRepoStarrings(repoId: string): Promise<CrawlerTypes.Starring[]> {
    // get Repo data
    const repoApiPath = GitHubUtils.pathFromId(repoId);
    // @ts-ignore
    const repoData: GHTypes.Repo = await this.redisCache.cachedGetJSON('data-' + repoApiPath, 3600 * 24 * 14,
      async () => removeUnusedGitHubProps(await this.githubAPI.safeGetData(repoApiPath)),
      // removeUnusedGitHubProps // DISABLE if not re-processing the DB
    );
    if (!repoData) {
      log(`GitHubAPI.resolveRepoStarrings: issue accessing ${repoId}. Skipping.`);
      return null;
    }
    let expectedStars = repoData.stargazers_count;

    // get Starrings data
    const ghStarrings: GHTypes.Starring[] = await this.getDataArrayWithPagination<GHTypes.Starring>(
      GitHubUtils.pathFromId(repoId) + '/stargazers', GitHubUtils.stargazerHeaders);

    // match star expectations
    if (ghStarrings.length < expectedStars) {
      if (VERBOSE_LOGIC) log(`GitHubAPI.resolveRepoStarrings: fetched fewer than the full stars: got ${ghStarrings.length}, expected ${expectedStars}`);
    } else if (ghStarrings.length > expectedStars) {
      log(`GitHubAPI.resolveRepoStarrings: fetched more than expected stars. adjusting expectation by ${ghStarrings.length - expectedStars}`)
      expectedStars = ghStarrings.length;
    }

    // map to local objects
    const starrings: CrawlerTypes.Starring[] = [];
    let decreasingStarNumber = expectedStars;
    for (let iRev = ghStarrings.length - 1; iRev >= 0; iRev--) {
      starrings.unshift({
        n: decreasingStarNumber--,
        ts: unixTimeISO(ghStarrings[iRev].starred_at),
        ...ghStarrings[iRev],
      });
    }

    // done with this repo
    if (VERBOSE_LOGIC) log(`    ${repoId}, fetched ${ghStarrings.length} starrings, expected ${expectedStars}`);
    return starrings;
  }

  private async resolveUsersStarredRepos(userLogins: string[], maxStarsPerUser = 200): Promise<CrawlerTypes.RepoRefStats[]> {
    // accumulator for counting all referred-to repos
    const repoStatsAccumulator: {
      [repoFullName: string]: CrawlerTypes.RepoRefStats,
    } = {};

    // get starred repositories for all the provided user logins
    const initialUsersCount = userLogins.length;
    let processedUsersCount = 0;
    for (let i = 0; i < initialUsersCount; i++) {
      if (i % 5000 === 0) log(` * Fetching user ${i}`);
      const userName = userLogins[i];
      if (VERBOSE_LOGIC) log(`** Fetching all stars of user ${i + 1}/${initialUsersCount}: ${userName} ...`);

      // get all repos starred by each User
      const userStarredRepos: GHTypes.RepoBasics[] = await this.getDataArrayWithPagination<GHTypes.RepoBasics>(
        `/users/${userName}/starred`, null, maxStarsPerUser);
      // user skipped - likely too many likes for this fellow, or user deleted
      if (!userStarredRepos)
        continue;

      // integrate stats for all starred repos of this user
      for (let userStarredRepo of userStarredRepos) {
        const repoFullName = userStarredRepo.full_name;
        // sanity check: log special conditions (assumed always false)
        if (userStarredRepo.disabled || userStarredRepo.private)
          log(` special repo ${repoFullName}: disabled: ${userStarredRepo.disabled}, private: ${userStarredRepo.private}`);
        // create repo reference if needed (with invariant properties across users)
        if (!repoStatsAccumulator.hasOwnProperty(repoFullName)) {
          repoStatsAccumulator[repoFullName] = {
            fullName: repoFullName,
            isArchived: userStarredRepo.archived,
            isFork: userStarredRepo.fork,
            description: (userStarredRepo.description || '').slice(0, 50),
            createdAgo: (unixTimeStart - unixTimeISO(userStarredRepo.created_at)) / 3600 / 24,
            pushedAgo: (unixTimeStart - unixTimeISO(userStarredRepo.pushed_at)) / 3600 / 24,
            repoStars: userStarredRepo.stargazers_count,
            // dynamic, to be populated later
            usersStars: 0,
            rightShare: undefined,
            leftShare: undefined,
            relevance: undefined,
            scale: undefined,
          }
        }
        // integrate stats for this repo
        const repoReference = repoStatsAccumulator[repoFullName];
        repoReference.usersStars++;
      }

      // the real number of users (less the skipped)
      processedUsersCount++;
    }

    // add the couple of fields that were missing
    const shareAdjustment = processedUsersCount ? (initialUsersCount / processedUsersCount) : 1;
    const popularReposRefs: CrawlerTypes.RepoRefStats[] = Object.values(repoStatsAccumulator);
    for (let repo of popularReposRefs) {
      repo.rightShare = shareAdjustment * repo.usersStars / repo.repoStars;
      repo.leftShare = shareAdjustment * repo.usersStars / initialUsersCount;
      repo.relevance = Math.pow(repo.rightShare * repo.rightShare * repo.leftShare, 1 / 3);
      repo.scale = shareAdjustment;
    }

    // sort top starred repos for the provided group of users
    popularReposRefs.sort((a, b) => b.usersStars - a.usersStars);
    return popularReposRefs;
  }

  /**
   * Multi-Page fetching function for GitHub Array-like data
   */
  private async getDataArrayWithPagination<T>(apiEndpoint: string, extraGetHeaders?: Object, maxEntries?: number): Promise<T[]> {
    assert.ok(apiEndpoint.indexOf('?') === -1, 'endpoint assumed without parameters');

    // paged-fetch function
    const maxPerPage = 100;
    const fetchPage = async (pageIdx): Promise<ShortResponse> => {
      const pageUrl = (page) => apiEndpoint + '?page=' + page + '&per_page=' + maxPerPage;
      // use cached response, if present
      const pageApiPath = pageUrl(pageIdx);
      // @ts-ignore
      return await this.redisCache.cachedGetJSON('response-' + pageApiPath, 3600 * 24 * 14,
        async () => removeUnusedGitHubProps(await this.githubAPI.safeRequest(pageApiPath, extraGetHeaders)),
        // removeUnusedGitHubProps // DISABLE if not re-processing the DB
      );
    }

    // get the first page, check if it has a multi-paged structure
    const page1Response: ShortResponse = await fetchPage(1);
    if (!page1Response) {
      if (VERBOSE_FETCHES) log(` < error processing ${apiEndpoint}. stopping multi-paged data request.`);
      return null;
    }
    const isMultiPage = page1Response.headers.hasOwnProperty('link');

    // fetch all pages, keeping the responses
    const allData: T[] = [];
    if (isMultiPage) {
      const pagesCount = parseInt(/next.*?page=(\d*).*?last/.exec(page1Response.headers.link)[1]);
      // if a limit has been set and there are too many results, just bail
      if (maxEntries && (pagesCount * maxPerPage) > maxEntries) {
        if (VERBOSE_LOGIC) log(` < skipping ${apiEndpoint} because ${pagesCount * maxPerPage} exceeds ${maxEntries}`);
        return null;
      }
      // note: we scan down from 'page=pageCount' to 'page=2' - since page=1 is already fetched
      for (let pageIdx = pagesCount; pageIdx > 1; --pageIdx) {
        const pageData: T[] = (await fetchPage(pageIdx)).data;
        // prepend block
        allData.unshift(...pageData);
      }
    }

    // prepend the first page data
    const page1Data: T[] = page1Response.data;
    allData.unshift(...page1Data);

    // at this point, the data is all in sequence, older to newer
    return allData;
  }
}


export interface ShortResponse<T = any> {
  data: T;
  status: number;
  headers: any;
}

export class GitHubUtils {
  private readonly axiosInstance: AxiosInstance;
  private static defaultHeaders = {
    Accept: 'application/vnd.github.v3+json',
    Authorization: GITHUB_PA_TOKEN ? `token ${GITHUB_PA_TOKEN}` : undefined,
  }
  // This special data type adds the 'starred_at' property on results ('https://docs.github.com/en/free-pro-team@latest/rest/reference/activity#starring')
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

  //
  static pathFromId(repoId: any) {
    return isNaN(repoId) ? `/repos/${repoId}` : `/repositories/${repoId}`;
  }

  async safeRequest(path: string, headers?: Object): Promise<ShortResponse> {
    const axiosConfig = {
      headers: Object.assign({}, GitHubUtils.defaultHeaders, headers || {}),
    }
    try {
      const start_time = Date.now();
      const axiosResponse: AxiosResponse = await this.axiosInstance.get(path, axiosConfig);
      const response: ShortResponse = {
        data: axiosResponse.data,
        headers: axiosResponse.headers,
        status: axiosResponse.status,
      };
      const fetchElapsed = Date.now() - start_time;
      if (VERBOSE_FETCHES)
        log(` ${path}: ${fetchElapsed} ms`);

      // safety checks
      if (response.status !== 200) err(`GitHubAPI.safeRequest: status is not 200 for: ${path}: ${response}`);

      // API limiter: sleep to meet quotas
      const hasRateLimiter =
        response.headers.hasOwnProperty('x-ratelimit-limit') &&
        response.headers.hasOwnProperty('x-ratelimit-remaining') &&
        response.headers.hasOwnProperty('x-ratelimit-reset');
      if (hasRateLimiter) {
        const currentTs = unixTimeNow();
        const resetTs = parseInt(response.headers['x-ratelimit-reset']);
        const secondsRemaining = resetTs - currentTs + 10;
        const callsRemaining = parseInt(response.headers['x-ratelimit-remaining']);
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

      // proceed
      return response;
    } catch (e) {
      if (e.response && e.response.status === 401)
        err(`GitHubAPI.safeRequest: 401: while accessing ${path}. Likely cause: INVALID GitHub Personal Access Token.`);
      else if (e.response && e.response.status === 404)
        log(`GitHubAPI.safeRequest: 404: ${path} not found (anymore). ret: null.`);
      else if (e.response && e.response.status === 451)
        log(`GitHubAPI.safeRequest: 451: ${path} repo access blocked (dmca?). ret: null.`);
      else
        err(`GitHubAPI.safeRequest: ${path} GET error:`, e);
      return null;
    }
  }

  async safeGetData<T>(path: string, headers?: Object): Promise<T> {
    const response = await this.safeRequest(path, headers);
    return response ? response.data : response;
  }

}
