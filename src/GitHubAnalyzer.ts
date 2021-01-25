/**
 * GitHubAnalyzer: classes and utility functions for GitHub.
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
import {err, log, roundToDecimals, secondsPerDay, unixTimeFromISOString, unixTimeProgramStart, unixTimeStartOfWeek} from "./Utils";
import {statComputeSlope, statGetBounds, XYPoint} from "./Statistics";

// Configuration of this module
const VERBOSE_LOGIC = false;
const WRITE_OUTPUT_FILES = true;
const DEFAULT_TTL = 7 * 2 * 24 * 60 * 60;
const STAT_INTERVALS = [
  {name: 'T1W', weekMinus: 7},
  {name: 'T2W', weekMinus: 7 * 2},
  {name: 'T1M', weekMinus: 365 / 12},
  {name: 'T3M', weekMinus: 365 / 4},
  {name: 'T6M', weekMinus: 365 / 2},
  {name: 'T1Y', weekMinus: 365},
  {name: 'T2Y', weekMinus: 365 * 2},
  {name: 'T5Y', weekMinus: 365 * 5},
  {name: 'TI', weekMinus: -1}, // special: -1 means xMin
];
const NOISE_REPOS = [
  "CyC2018/CS-Notes",
  "TheAlgorithms/Python",
  "awesomedata/awesome-public-datasets",
  "coder2gwy/coder2gwy",
  "jwasham/coding-interview-university",
  "labuladong/fucking-algorithm",
  "vinta/awesome-python",
];

const SEARCH_HYPER_PARAMS = {
  related_users_max_stars: 200,
  relevant_filters: [
    {fn: (rs: RepoRefStats) => !rs.isArchived, reason: 'archived (old)'},
    {fn: (rs: RepoRefStats) => rs.leftShare >= 0.4, reason: 'left share < 0.4%'},
    {fn: (rs: RepoRefStats) => rs.rightShare >= 3.0, reason: 'right share < 3%'},
    {fn: (rs: RepoRefStats) => rs.pushedAgo < 42, reason: 'no activity in the last 6 weeks'},
  ],
}



export class GitHubAnalyzer {
  private readonly githubAPI: GitHubAPI;
  private readonly redisCache: RedisCache;

  constructor(githubAPI: GitHubAPI) {
    this.githubAPI = githubAPI;
    this.redisCache = new RedisCache('GitHubCrawler');
  }

  async findAndAnalyzeRelatedRepos(initialRepoId: string) {
    const outFileName = initialRepoId.replace('/', '_').replace('.', '_')
      + '-' + SEARCH_HYPER_PARAMS.related_users_max_stars;

    // 1. Repo -> Users[]
    log(`*** Resolving Users that starred '${colors.cyan(initialRepoId)}' ...`);
    let userLogins: string[];
    {
      const {owner: repoOwner, name: repoName} = GitHubAPI.repoFullNameToParts(initialRepoId);
      const starrings = await this.getRepoStarringsDESCCached(repoOwner, repoName);
      if (starrings.length < 10)
        return log(`W: issues finding stars(t) of '${initialRepoId}: ${starrings?.length}`);
      // if (WRITE_OUTPUT_FILES)
      //   fs.writeFileSync(`out-${outFileName}-starrings.json`, JSON.stringify(starrings, null, 2));
      userLogins = starrings.map(starring => starring.userLogin);
    }

    // 2. Related repos: Users[] -> Accumulate user's Starred repos
    log(`\n** Found ${colors.red(userLogins.length.toString())} users that starred '${initialRepoId}'. Next, finding all the starred repos of those users...`);
    let relatedRepos: RepoRefStats[];
    {
      userLogins.forEach(login => assert(typeof login === 'string'));
      relatedRepos = await this.getUsersStarredRepos(userLogins, SEARCH_HYPER_PARAMS.related_users_max_stars);
      if (!relatedRepos || relatedRepos.length < 1)
        return log(`W: issues finding related repos`);
      if (WRITE_OUTPUT_FILES)
        fs.writeFileSync(`out-${outFileName}-related.csv`, (new JSONParser()).parse(relatedRepos));
    }

    // 3. Find Relevant repos, by filtering all Related repos
    log(`\n** Discovered ${colors.bold.white(relatedRepos.length.toString())} related repos to '${initialRepoId}'. Next, narrowing down ` +
      `${colors.bold('relevant')} repos, according to ${colors.yellow('relevant_filters')}...`);
    let relevantRepos: RepoRefStats[], relevantCount: number;
    {
      relevantRepos = relatedRepos.slice();
      SEARCH_HYPER_PARAMS.relevant_filters.forEach(filter => relevantRepos = verboseFilterList(relevantRepos, filter.fn, filter.reason));
      relevantCount = relevantRepos.length;
      log(` -> ${colors.bold.white(relevantCount.toString())} ${colors.bold('relevant')} repos left ` +
        `(${roundToDecimals(100 * (1 - relevantCount / relatedRepos.length), 2)}% is gone)`);
      // if (WRITE_OUTPUT_FILES)
      //   fs.writeFileSync(`out-${outFileName}-relevant.csv`, (new JSONParser()).parse(relevantRepos));
    }

    // 4. Process all Relevant repos
    log(`\n>> Finding starrings of ${relevantCount} repositories (most starred by the ${userLogins.length} users of '${initialRepoId}')`);
    for (let i = 0; i < relevantCount; i++) {
      const repo = relevantRepos[i];

      log(`*** Resolving starrings for '${colors.cyan(repo.fullName)}' (${i + 1}/${relevantCount}) ...`);
      const starrings = await this.getRepoStarringsASCCached(repo.fullName);
      if (starrings.length < 10) {
        log(`W: issues finding stars(t) of '${repo.fullName}: ${starrings?.length}`);
        continue;
      }
      if (NOISE_REPOS.includes(repo.fullName)) {
        log(`I: skipping ${repo.fullName} because it's noise for the current analysis`);
        continue;
      }

      // Compute statistics for various time intervals that end at the beginning of the current week
      let xyList: XYPoint[] = starrings.map(s => ({x: s.ts, y: s.n}));

      // print basic stats (bounds)
      const {first, last, left: xMin, right: xMax, bottom: yMin, top: yMax} = statGetBounds(xyList);
      log(` - last star was ${Math.round((unixTimeProgramStart - xMax) / 3600)} hours ago (#${yMax}), ` +
        `the first (#${yMin}) was ${roundToDecimals((unixTimeProgramStart - xMin) / 3600 / 24 / 365, 2)} years ago`);

      // TODO: could do weekly samplings here of each repo, to plot trend lines, exported as a separate output


      // compute interval stats, and add them to the repo object
      const intervalStats = {};
      for (const interval of STAT_INTERVALS) {
        const right = unixTimeStartOfWeek;
        const left = (interval.weekMinus === -1) ? xMin : right - secondsPerDay * interval.weekMinus;
        repo[interval.name] = intervalStats[interval.name] = statComputeSlope(xyList, left, right, xMin, interval.name);
      }
    }
    // remove unused attributes for the export
    const unusedAttributes = ['isArchived'];
    relevantRepos.forEach(r => unusedAttributes.forEach(u => delete r[u]));
    if (WRITE_OUTPUT_FILES)
      fs.writeFileSync(`out-${outFileName}-stats.csv`, (new JSONParser()).parse(relevantRepos));
  }

  /// Parsers of GitHub GQL data into our own data types

  /// Repository > Starrings

  private getRepoStarringsASCCached = async (repoFullName: string): Promise<Starring[]> => {
    const {owner: relatedOwner, name: relatedName} = GitHubAPI.repoFullNameToParts(repoFullName);
    return (await this.getRepoStarringsDESCCached(relatedOwner, relatedName)).reverse();
  }

  private getRepoStarringsDESCCached = async (owner, name): Promise<Starring[]> =>
    await this.redisCache.cachedGetJSON(`starrings-${owner}/${name}`, DEFAULT_TTL,
      async () => await this.getRepoStarringsDecreasing(owner, name));

  private async getRepoStarringsDecreasing(owner: string, name: string): Promise<Starring[]> {
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
          // sometimes a node (user) can be null.. maybe deleted in the meantime?
          if (!s.edges[i] || !s.nodes[i]) {
            err(` < skipping starring ${allStarrings.length + i} of repo '${owner}/${name}' (${!s.edges[i]}, ${!s.nodes[i]})`);
            continue;
          }
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

  /// User(s) Starrings

  private async getUsersStarredRepos(userLogins: string[], maxStarsPerUser: number): Promise<RepoRefStats[]> {
    // accumulator for counting all referred-to repos
    const repoStatsAccumulator: {
      [repoFullName: string]: RepoRefStats,
    } = {};

    // get starred repositories for all the provided user logins
    const usersCount = userLogins.length;
    let validUsersCount = 0;
    const ellipsize = (text) => text.length > 200 ? (text.slice(0, 200) + '...') : text;
    for (let i = 0; i < usersCount; i++) {
      if (i % 1000 === 0) log(` - Fetching up to ${maxStarsPerUser} stars for user ${colors.red((i + 1).toString())}/${usersCount} ...`);
      const userLogin = userLogins[i];
      if (VERBOSE_LOGIC) log(` - Fetching all stars of user ${i + 1}/${usersCount}: ${userLogin} ...`);

      // get the data from every user, skip users under threshold
      const repoMinInfos = await this.getUserStarredReposCached(userLogin, SEARCH_HYPER_PARAMS.related_users_max_stars);
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
            description: ellipsize(r.description || ''),
            createdAgo: roundToDecimals((unixTimeProgramStart - unixTimeFromISOString(r.createdAt)) / 3600 / 24, 1),
            pushedAgo: roundToDecimals((unixTimeProgramStart - unixTimeFromISOString(r.pushedAt)) / 3600 / 24, 1),
            isArchived: r.isArchived,
            isFork: r.isFork ? 1 : undefined,
            repoStars: r.stargazerCount,
            // dynamic, to be populated later
            usersStars: 0,
            leftShare: undefined,
            rightShare: undefined,
            relevance: undefined,
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
      const leftShare = shareAdjustment * repo.usersStars / usersCount;
      const rightShare = shareAdjustment * repo.usersStars / repo.repoStars;
      const relevance = Math.pow(rightShare * rightShare * leftShare, 1 / 3);
      repo.leftShare = roundToDecimals(100 * leftShare, 2);
      repo.rightShare = roundToDecimals(100 * rightShare, 2);
      repo.relevance = roundToDecimals(100 * relevance, 2);
    }

    // sort top starred repos for the provided group of users
    popularReposRefs.sort((a, b) => b.relevance - a.relevance);
    return popularReposRefs;
  }

  private getUserStarredReposCached = async (login, starsMaximum): Promise<GQL.RepoMinInfo[]> =>
    await this.redisCache.cachedGetJSON(`user-starred-${login}-${starsMaximum}`, DEFAULT_TTL,
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
  // static (read from GitHub)
  fullName: string,
  description: string,
  isArchived: boolean,
  isFork: number | undefined,
  createdAgo: number,
  pushedAgo: number,
  repoStars: number,
  // dynamic (computed based on the analysis)
  usersStars: number,
  leftShare: number,  // percent
  rightShare: number, // percent
  relevance: number,
  // NOTE: Statistics are added subsequently, for export to CSV reasons
}
