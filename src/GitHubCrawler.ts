/**
 * GitHubCrawler: classes and utility functions for GitHub.
 *
 * A bit too tangled for now, but cleaning it is not the highest priority.
 *
 * Utilizes code from https://github.com/timqian/star-history for finding
 * the 'starrings'; the rest is pretty much original.
 *
 * Uses Axios for REST API calls.
 */

import assert from "assert";
import colors from "colors";
import fs from "fs";
import {Parser as JSONParser} from "json2csv";
import {RedisCache} from "./RedisCache";
import {GHTypes, GitHubAPI, ShortResponse} from "./GitHubAPI";
import {log, removeProperties, unixTimeFromISOString, unixTimeProgramStart, unixTimeStartOfWeek} from "./Utils";
import {statClip, statComputeSlopes, statGetBounds} from "./Statistics";

// Configuration of this module
const VERBOSE_LOGIC = false;
const WRITE_OUTPUT_FILES = false;


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

interface Starring extends GHTypes.Starring {
  n: number,
  ts: number,
}

interface RepoRefStats {
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
  // stats...

}

const HYPER_PARAMS = {
  related_users_max_stars: 200,
  relevant_filters: [
    {fn: (rs: RepoRefStats) => !rs.isArchived, reason: 'archived (old)'},
    {fn: (rs: RepoRefStats) => rs.leftShare >= 0.005, reason: 'left share < 0.5%'},
    {fn: (rs: RepoRefStats) => rs.rightShare >= 0.02, reason: 'right share < 2%'},
    {fn: (rs: RepoRefStats) => rs.pushedAgo < 60, reason: 'no activity in the last 2 months'},
  ],
}


export class GitHubCrawler {
  private readonly githubAPI: GitHubAPI;
  private readonly redisCache: RedisCache;

  constructor(githubAPI: GitHubAPI) {
    this.githubAPI = githubAPI;
    this.redisCache = new RedisCache('GitHubCrawler');
  }

  async analyzeRelatedRepos(repoId: string) {
    const outFileName = repoId.replace('/', '_').replace('.', '_')
      + '-' + HYPER_PARAMS.related_users_max_stars;

    // 1. Repo -> Stars(t)
    log(`*** Resolving starrings for '${colors.cyan(repoId)}' ...`);
    const starrings: Starring[] = await this.resolveRepoStarrings(repoId);
    if (!starrings || starrings.length < 10)
      return log(`W: issues finding stars(t) of '${repoId}: ${starrings?.length}`);
    if (WRITE_OUTPUT_FILES)
      fs.writeFileSync(`out-${outFileName}-starrings.json`, JSON.stringify(starrings, null, 2));

    // 2. Related repos: All Users -> Accumulate user's Starred repos
    log(`\n** Found ${colors.red(starrings.length.toString())} users that starred '${repoId}'. Next, finding all the starred repos of those users...`);
    const userLogins: string[] = starrings.map(starring => starring.user.login);
    const relatedRepos: RepoRefStats[] = await this.resolveUsersStarredRepos(userLogins, HYPER_PARAMS.related_users_max_stars);
    if (!relatedRepos || relatedRepos.length < 1)
      return log(`W: issues finding related repos`);
    if (WRITE_OUTPUT_FILES)
      fs.writeFileSync(`out-${outFileName}-relatedRepos.csv`, (new JSONParser()).parse(relatedRepos));

    // 3. Find Relevant repos, by filtering all Related repos
    log(`\n** Discovered ${colors.bold.white(relatedRepos.length.toString())} related repos to '${repoId}'. Next, narrowing down ` +
      `${colors.bold('relevant')} repos, according to ${colors.yellow('relevant_filters')}...`);

    let relevantRepos = relatedRepos.slice();
    HYPER_PARAMS.relevant_filters.forEach(filter => relevantRepos = filterList(relevantRepos, filter.fn, filter.reason));
    log(` -> ${colors.bold.white(relevantRepos.length.toString())} ${colors.bold('relevant')} repos left ` +
      `(${Math.round(10000 * (1 - relevantRepos.length / relatedRepos.length)) / 100}% is gone)`);

    if (WRITE_OUTPUT_FILES)
      fs.writeFileSync(`out-${outFileName}-relevantRepos.csv`, (new JSONParser()).parse(relevantRepos));

    // 4. Find starrings for Relevant repos
    log(`\n>> Finding starrings of ${relevantRepos.length} repositories (most starred by the ${userLogins.length} users of ${repoId})`);
    for (const repo of relevantRepos) {
      const relatedRepo = repo.fullName;
      log(`*** 2-Resolving starrings for '${colors.cyan(relatedRepo)}' ...`);
      if (relatedRepo === 'tensorflow/tensorflow')
        log();
      const starrings: Starring[] = await this.resolveRepoStarrings(relatedRepo);
      if (!starrings || starrings.length < 10) {
        log(`W: issues finding stars(t) of '${relatedRepo}: ${starrings?.length}`);
        continue;
      }
      // log(`Statistics for ${starrings.length} stars...`)
      const starStats = GitHubCrawler.computeStarringStats(starrings);
      // log(starStats);
    }
  }


  private static computeStarringStats(starrings: Starring[]) {
    // to XYList
    let xys = starrings.map(s => ({x: s.ts, y: s.n}));

    // remove everything before the start of the week
    xys = statClip(xys, null, unixTimeStartOfWeek, null, null, 'remove partial current week');

    // some basic stats
    const {first, last, left: xMin, right: xMax, bottom: yMin, top: yMax} = statGetBounds(xys);
    {
      const firstAgo = unixTimeProgramStart - xMin;
      const lastAgo = unixTimeProgramStart - xMax;
      log(` - last star was ${Math.round(lastAgo / 3600)} hours ago (#${yMax}), ` +
        `the first (#${yMin}) was ${Math.round(100 * firstAgo / 3600 / 24 / 365) / 100} years ago`);
    }

    // compute growth in Y at different X bases
    const Bases = [
      {name: 'T1W', days: 7, slope: undefined},
      {name: 'T2W', days: 7 * 2, slope: undefined},
      {name: 'T1M', days: 365 / 12, slope: undefined},
      {name: 'T3M', days: 365 / 4, slope: undefined},
      {name: 'T6M', days: 365 / 2, slope: undefined},
      {name: 'T1Y', days: 365, slope: undefined},
      {name: 'T2Y', days: 365 * 2, slope: undefined},
      {name: 'T5Y', days: 365 * 5, slope: undefined},
      {name: 'TI', days: -1, slope: undefined}, // special: -1 means xMin
    ]
    statComputeSlopes(xys, Bases, unixTimeStartOfWeek, xMin);

    // TODO: compute Weekly numbers
    // TODO: compute histograms on Starrings, for Excel charts, then merged across all of the repos later

    // return stats
    return {
      slopes: Bases,
      weekly: undefined,
    }
  }

  private async resolveRepoStarrings(repoId: string): Promise<Starring[]> {
    // get Repo data, which includes the expected number of stars
    const repoApiPath = GitHubAPI.apiRepoPath(repoId) + '';
    const repoResponse: ShortResponse<GHTypes.Repo> = <ShortResponse>await this.redisCache.cachedGetJSON('response-' + repoApiPath, 3600 * 24 * 14,
      async () => removeProperties(await this.githubAPI.getResponse(repoApiPath), allRemovedProps),
    );
    let expectedCount = repoResponse?.data?.stargazers_count;
    if (!expectedCount) {
      log(`GitHubAPI.resolveRepoStarrings: issue accessing ${repoId}. Skipping.`);
      return null;
    }

    // get Starrings data
    const ghStarrings: GHTypes.Starring[] = await this.getDataArrayWithPagination<GHTypes.Starring>(
      repoApiPath + '/stargazers', null, GitHubAPI.stargazerHeaders, null);

    // match star expectations
    const fetchedCount = ghStarrings.length;
    if (fetchedCount < expectedCount) {
      if (VERBOSE_LOGIC) log(`GitHubAPI.resolveRepoStarrings: fetched fewer stars than expected: ${fetchedCount}. Needed ${expectedCount - fetchedCount} more`);
    } else if (fetchedCount > expectedCount) {
      log(`GitHubAPI.resolveRepoStarrings: fetched more than expected stars. Increasing expectations by ${fetchedCount - expectedCount}`);
      expectedCount = fetchedCount;
    }

    // map to local objects
    const starrings: Starring[] = [];
    let decreasingStarNumber = expectedCount;
    for (let iRev = fetchedCount - 1; iRev >= 0; iRev--) {
      starrings.unshift({
        n: decreasingStarNumber--,
        ts: unixTimeFromISOString(ghStarrings[iRev].starred_at),
        ...ghStarrings[iRev],
      });
    }

    // done with this repo
    if (VERBOSE_LOGIC) log(`    ${repoId}, fetched ${fetchedCount} starrings, expected ${expectedCount}`);
    return starrings;
  }

  private async resolveUsersStarredRepos(userLogins: string[], maxStarsPerUser = 200): Promise<RepoRefStats[]> {
    // accumulator for counting all referred-to repos
    const repoStatsAccumulator: {
      [repoFullName: string]: RepoRefStats,
    } = {};

    // get starred repositories for all the provided user logins
    const initialUsersCount = userLogins.length;
    let processedUsersCount = 0;
    for (let i = 0; i < initialUsersCount; i++) {
      if (i % 5000 === 0) log(` - Fetching all stars of user ${colors.red((i + 1).toString())}/${initialUsersCount} ...`);
      const userName = userLogins[i];
      if (VERBOSE_LOGIC) log(` - Fetching all stars of user ${i + 1}/${initialUsersCount}: ${userName} ...`);

      // get all repos starred by each User
      const userStarredRepos: GHTypes.RepoBasics[] = await this.getDataArrayWithPagination<GHTypes.RepoBasics>(
        `/users/${userName}/starred`, null, null, maxStarsPerUser);
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
            createdAgo: (unixTimeProgramStart - unixTimeFromISOString(userStarredRepo.created_at)) / 3600 / 24,
            pushedAgo: (unixTimeProgramStart - unixTimeFromISOString(userStarredRepo.pushed_at)) / 3600 / 24,
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
    const popularReposRefs: RepoRefStats[] = Object.values(repoStatsAccumulator);
    for (let repo of popularReposRefs) {
      repo.rightShare = shareAdjustment * repo.usersStars / repo.repoStars;
      repo.leftShare = shareAdjustment * repo.usersStars / initialUsersCount;
      repo.relevance = Math.pow(repo.rightShare * repo.rightShare * repo.leftShare, 1 / 3);
      repo.scale = shareAdjustment;
    }

    // sort top starred repos for the provided group of users
    popularReposRefs.sort((a, b) => b.relevance - a.relevance);
    return popularReposRefs;
  }

  /**
   * Multi-Page fetching function for GitHub Array-like data
   */
  private async getDataArrayWithPagination<T>(apiEndpoint: string, extraGetQuery?: string[], extraGetHeaders?: Object, maxEntries?: number): Promise<T[]> {
    assert.ok(apiEndpoint.indexOf('?') === -1, 'endpoint assumed without parameters');

    // paged-fetch function
    const maxPerPage = 100;
    const querySuffix = extraGetQuery ? `&${extraGetQuery.join('&')}` : '';
    const fetchPageResponse = async (pageIdx): Promise<ShortResponse> => {
      const pageApiPath = `${apiEndpoint}?page=${pageIdx}&per_page=${maxPerPage}${querySuffix}`;
      return <ShortResponse>await this.redisCache.cachedGetJSON('response-' + pageApiPath, 3600 * 24 * 14,
        async () => removeProperties(await this.githubAPI.getResponse(pageApiPath, extraGetHeaders), allRemovedProps),
      );
    }

    // get the first page, check if it has a multi-paged structure
    const page1Response: ShortResponse = await fetchPageResponse(1);
    if (!page1Response) {
      if (VERBOSE_LOGIC) log(` < error processing ${apiEndpoint}. stopping multi-paged data request.`);
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
        const pageData: T[] = (await fetchPageResponse(pageIdx)).data;
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

const filterList = (list: any[], filterFn, reason): any[] => {
  const initialSize = list.length;
  const filteredList = list.filter(filterFn);
  const finalSize = filteredList.length;
  log(` -- removed ${initialSize - finalSize} elements: ${reason}. (${initialSize} -> ${finalSize})`);
  return filteredList;
}
