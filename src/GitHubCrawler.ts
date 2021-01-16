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
import {GitHubAPI, GQL} from "./GitHubAPI";
import {err, log, unixTimeFromISOString, unixTimeProgramStart, unixTimeStartOfWeek} from "./Utils";
import {statClip, statComputeSlopes, statGetBounds} from "./Statistics";

// Configuration of this module
const VERBOSE_LOGIC = false;
const WRITE_OUTPUT_FILES = true;

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
    const {owner: repoOwner, name: repoName} = GitHubAPI.repoFullNameToParts(repoId);
    const starrings = await this.getRepoStarringsCached(repoOwner, repoName);
    if (!starrings || starrings.length < 10)
      return log(`W: issues finding stars(t) of '${repoId}: ${starrings?.length}`);
    if (WRITE_OUTPUT_FILES)
      fs.writeFileSync(`out-${outFileName}-starrings.json`, JSON.stringify(starrings, null, 2));

    // 2. Related repos: All Users -> Accumulate user's Starred repos
    log(`\n** Found ${colors.red(starrings.length.toString())} users that starred '${repoId}'. Next, finding all the starred repos of those users...`);
    const userLogins: string[] = starrings.map(starring => starring.userLogin);
    userLogins.forEach(login => assert(typeof login === 'string'));
    const relatedRepos: RepoRefStats[] = await this.getUsersStarredRepos(userLogins, HYPER_PARAMS.related_users_max_stars);
    if (!relatedRepos || relatedRepos.length < 1)
      return log(`W: issues finding related repos`);
    if (WRITE_OUTPUT_FILES)
      fs.writeFileSync(`out-${outFileName}-relatedRepos.csv`, (new JSONParser()).parse(relatedRepos));

    // 3. Find Relevant repos, by filtering all Related repos
    log(`\n** Discovered ${colors.bold.white(relatedRepos.length.toString())} related repos to '${repoId}'. Next, narrowing down ` +
      `${colors.bold('relevant')} repos, according to ${colors.yellow('relevant_filters')}...`);

    let relevantRepos = relatedRepos.slice();
    HYPER_PARAMS.relevant_filters.forEach(filter => relevantRepos = verboseFilterList(relevantRepos, filter.fn, filter.reason));
    log(` -> ${colors.bold.white(relevantRepos.length.toString())} ${colors.bold('relevant')} repos left ` +
      `(${Math.round(10000 * (1 - relevantRepos.length / relatedRepos.length)) / 100}% is gone)`);

    if (WRITE_OUTPUT_FILES)
      fs.writeFileSync(`out-${outFileName}-relevantRepos.csv`, (new JSONParser()).parse(relevantRepos));

    // 4. Find starrings for Relevant repos
    log(`\n>> Finding starrings of ${relevantRepos.length} repositories (most starred by the ${userLogins.length} users of '${repoId}')`);
    for (const repo of relevantRepos) {
      const relatedRepo = repo.fullName;
      log(`*** 2-Resolving starrings for '${colors.cyan(relatedRepo)}' ...`);
      const {owner: relatedOwner, name: relatedName} = GitHubAPI.repoFullNameToParts(relatedRepo);
      const starrings = await this.getRepoStarringsCached(relatedOwner, relatedName);
      if (!starrings || starrings.length < 10) {
        log(`W: issues finding stars(t) of '${relatedRepo}: ${starrings?.length}`);
        continue;
      }
      // log(`Statistics for ${starrings.length} stars...`)
      const starStats = GitHubCrawler.computeStarringStats(starrings);
      log(starStats);
    }
  }

  /// Statistical functions

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

  /// Parsers of GitHub GQL data into our own data types

  private async getUsersStarredRepos(userLogins: string[], maxStarsPerUser: number): Promise<RepoRefStats[]> {
    // accumulator for counting all referred-to repos
    const repoStatsAccumulator: {
      [repoFullName: string]: RepoRefStats,
    } = {};

    // get starred repositories for all the provided user logins
    const usersCount = userLogins.length;
    let validUsersCount = 0;
    for (let i = 0; i < usersCount; i++) {
      if (i % 100 === 0) log(` - Fetching up to ${maxStarsPerUser} stars for user ${colors.red((i + 1).toString())}/${usersCount} ...`);
      const userLogin = userLogins[i];
      if (VERBOSE_LOGIC) log(` - Fetching all stars of user ${i + 1}/${usersCount}: ${userLogin} ...`);

      // get the data from every user, skip users under threshold
      const repoMinInfos = await this.getUserStarredReposCached(userLogin, HYPER_PARAMS.related_users_max_stars);
      if (repoMinInfos.length < 1)
        continue;

      // accumulate the data into the RepoRefStats format
      for (const r of repoMinInfos) {
        const repoFullName = r.nameWithOwner;
        // sanity check: log special conditions (assumed always false)
        if (r.isDisabled || r.isPrivate)
          log(` special repo ${repoFullName}: disabled: ${r.isDisabled}, private: ${r.isPrivate}`);
        // create repo reference if needed (with invariant properties across users)
        if (!repoStatsAccumulator.hasOwnProperty(repoFullName)) {
          repoStatsAccumulator[repoFullName] = {
            fullName: repoFullName,
            isArchived: r.isArchived,
            isFork: r.isFork,
            description: (r.description || '').slice(0, 50),
            createdAgo: (unixTimeProgramStart - unixTimeFromISOString(r.createdAt)) / 3600 / 24,
            pushedAgo: (unixTimeProgramStart - unixTimeFromISOString(r.pushedAt)) / 3600 / 24,
            repoStars: r.stargazerCount,
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
      validUsersCount++;
    }

    // add the couple of fields that were missing
    const shareAdjustment = validUsersCount ? (usersCount / validUsersCount) : 1;
    const popularReposRefs: RepoRefStats[] = Object.values(repoStatsAccumulator);
    for (let repo of popularReposRefs) {
      repo.rightShare = shareAdjustment * repo.usersStars / repo.repoStars;
      repo.leftShare = shareAdjustment * repo.usersStars / usersCount;
      repo.relevance = Math.pow(repo.rightShare * repo.rightShare * repo.leftShare, 1 / 3);
      repo.scale = shareAdjustment;
    }

    // sort top starred repos for the provided group of users
    popularReposRefs.sort((a, b) => b.relevance - a.relevance);
    return popularReposRefs;
  }

  private getRepoStarringsCached = async (owner, name): Promise<Starring[]> =>
    await this.redisCache.cachedGetJSON(`starrings-${owner}/${name}`, 3600 * 24 * 14,
      async () => await this.getRepoStarrings(owner, name));

  private async getRepoStarrings(owner: string, name: string): Promise<Starring[]> {
    // get the total number of stars only at the beginning (could be in the paged query, but then it would be live and slow)
    const repoStarsCount = await this.githubAPI.gqlRepoStarsCount(owner, name);
    const stargazersCount = repoStarsCount.repository.stargazerCount;

    // extract Starrings
    const allStarrings: Starring[] = [];
    let descendingN = stargazersCount;
    await GitHubAPI.gqlMultiPageDataHelper(
      async lastCursor => await this.githubAPI.gqlStarringsForRepo(owner, name, lastCursor),
      (data) => {
        // if the data is Null, there probably was an error with the API - in this case, we consider this an [] user
        if (!data) {
          err(` < skipping repo '${owner}/${name}' because of an API error`);
          return false;
        }
        const s = data.repository.stargazers;
        assert(s.edges.length === s.nodes.length, `Expected as many users as stars ${s.nodes.length}, ${s.edges.length}`);
        for (let i = 0; i < s.edges.length; i++) {
          allStarrings.push({
            n: descendingN--,
            starredAt: s.edges[i].starredAt,
            ts: unixTimeFromISOString(s.edges[i].starredAt),
            userLogin: s.nodes[i].login,
          });
        }
        if (VERBOSE_LOGIC) log(` + fetched ${allStarrings.length} stars (over ${stargazersCount})...`);
        return true;
      },
      (data) => [
        data.repository.stargazers.pageInfo.hasNextPage,
        data.repository.stargazers.pageInfo.endCursor,
      ]
    );
    return allStarrings;
  }

  private getUserStarredReposCached = async (login, starsMaximum): Promise<GQL.RepoMinInfo[]> =>
    await this.redisCache.cachedGetJSON(`user-starred-${login}-${starsMaximum}`, 3600 * 24 * 14,
      async () => await this.getUserStarredRepos(login, starsMaximum));

  private async getUserStarredRepos(login: string, starsMaximum: number): Promise<GQL.RepoMinInfo[]> {
    const repoMinInfo: GQL.RepoMinInfo[] = [];
    await GitHubAPI.gqlMultiPageDataHelper(
      async lastCursor => await this.githubAPI.gqlStarringsForUser(login, lastCursor),
      (data) => {
        // if the data is Null, there probably was an error with the API - in this case, we consider this an [] user
        if (!data) {
          err(` < skipping user '${login}' because of an API error`);
          return false;
        }
        // stop the fetch operation if the user has too many stars
        const starsCount = data.user.starredRepositories.totalCount;
        if (starsCount > starsMaximum) {
          if (VERBOSE_LOGIC) log(` < skipping user '${login}' because ${starsCount} exceeds ${starsMaximum} max stars`);
          return false;
        }
        // accumulate the repos for this user
        const r = data.user.starredRepositories.edges;
        r.forEach(({node: repo, starredAt}) => repoMinInfo.push(repo));
        return true;
      },
      (data) => [
        data.user.starredRepositories.pageInfo.hasNextPage,
        data.user.starredRepositories.pageInfo.endCursor,
      ]
    );
    return repoMinInfo;
  }

}

const verboseFilterList = (list: any[], filterFn, reason): any[] => {
  const initialSize = list.length;
  const filteredList = list.filter(filterFn);
  const finalSize = filteredList.length;
  log(` -- removed ${initialSize - finalSize} elements: ${reason}. (${initialSize} -> ${finalSize})`);
  return filteredList;
}

export interface Starring {
  n: number,
  starredAt: string,
  ts: number,
  userLogin: string,
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
