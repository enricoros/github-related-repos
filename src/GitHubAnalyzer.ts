/**
 * GitHubAnalyzer: classes and utility functions for GitHub.
 *
 * A bit too tangled for now, but cleaning it is not the highest priority.
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
import {interpolateY, statComputeSlope, statGetBounds, XYPoint} from "./Statistics";

// Configuration of this module
const VERBOSE_LOGIC = false;
const WRITE_OUTPUT_FILES = true;
const DEFAULT_TTL = 7 * 2 * 24 * 60 * 60;
const DEFAULT_HISTOGRAM_MONTHS = 12 * 4;
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
const BROKEN_USER_IDS = [
  'MDQ6VXNlcjQyMTgzMzI2',
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
const NOISE_REPOS_NAME_PARTS = [
  'fuck',
  'awesome',
];
const REMOVE_CSV_ATTRIBUTES = ['id', 'isArchived'];

const SEARCH_HYPER_PARAMS = {
  related_users_max_stars: 200,
  relevant_filters: [
    {fn: (rs: RepoInfo) => !rs.isArchived, reason: 'archived (old)'},
    {fn: (rs: RepoInfo) => rs.leftShare >= 0.4, reason: 'left share < 0.4%'},
    {fn: (rs: RepoInfo) => rs.rightShare >= 3.0, reason: 'right share < 3%'},
    {fn: (rs: RepoInfo) => rs.pushedAgo < 42, reason: 'no activity in the last 6 weeks'},
    {fn: (rs: RepoInfo) => NOISE_REPOS_NAME_PARTS.find(noise => rs.fullName.indexOf(noise) !== -1) === undefined, reason: 'noise names'},
    {fn: (rs, idx) => idx < 100, reason: 'stop at project 100'},
  ],
}


export class GitHubAnalyzer {
  private readonly githubAPI: GitHubAPI;
  private readonly redisCache: RedisCache;

  constructor(githubAPI: GitHubAPI) {
    this.githubAPI = githubAPI;
    this.redisCache = new RedisCache('gh-analyzer', DEFAULT_TTL);
  }

  async findAndAnalyzeRelatedRepos(initialRepoFullName: string) {
    const outFileName = initialRepoFullName.replace('/', '_').replace('.', '_')
      + '-' + SEARCH_HYPER_PARAMS.related_users_max_stars;

    // 1. Repo -> Users[]
    log(`*** Resolving Users that starred '${colors.cyan(initialRepoFullName)}' ...`);
    let userIDs: string[];
    {
      const {owner: repoOwner, name: repoName} = GitHubAPI.repoFullNameToParts(initialRepoFullName);
      const starrings: Starring[] = await this.redisCache.getJSON(`ga_repo_starrings-${repoOwner}/${repoName}`,
        async () => await this.getRepoStarringsDescending(repoOwner, repoName));
      if (starrings.length < 10)
        return log(`W: issues finding stars(t) of '${initialRepoFullName}: ${starrings?.length}`);
      // if (WRITE_OUTPUT_FILES)
      //   fs.writeFileSync(`out-${outFileName}-starrings.json`, JSON.stringify(starrings, null, 2));
      userIDs = starrings.map(starring => starring.userId);
      userIDs.forEach(id => assert(typeof id === 'string'));
    }

    // 2. Related repos: Users[] -> Accumulate user's Starred repos
    log(`\n** Found ${colors.red(userIDs.length.toString())} users that starred '${colors.cyan(initialRepoFullName)}'. ` +
      `Next, finding all the ${colors.yellow('starred repos')} of those users, limited by ${colors.magenta('related_users_max_stars')}...`);
    let relatedRepos: RepoInfo[];
    {
      relatedRepos = await this.redisCache.getJSON(`ga_related_repos-${initialRepoFullName}-${SEARCH_HYPER_PARAMS.related_users_max_stars}`,
        async () => await this.getStarredRepoBasicsForUserIDs(userIDs, SEARCH_HYPER_PARAMS.related_users_max_stars, initialRepoFullName));
      if (!relatedRepos || relatedRepos.length < 1)
        return log(`W: issues finding related repos`);
      if (WRITE_OUTPUT_FILES)
        fs.writeFileSync(`out-${outFileName}-related.csv`, (new JSONParser()).parse(relatedRepos));
    }

    // 3. Find Relevant repos, by filtering all Related repos
    log(`\n** Discovered ${colors.bold.white(relatedRepos.length.toString())} related repos to '${initialRepoFullName}'. Next, narrowing down ` +
      `${colors.bold('relevant')} repos, according to ${colors.magenta('relevant_filters')}...`);
    let relevantRepos: RepoInfo[], relevantCount: number;
    {
      relevantRepos = relatedRepos.slice();
      SEARCH_HYPER_PARAMS.relevant_filters.forEach(filter => relevantRepos = verboseFilterList(relevantRepos, filter.fn, filter.reason));
      relevantCount = relevantRepos.length;
      log(` -> ${colors.bold.white(relevantCount.toString())} ${colors.bold('relevant')} repos left ` +
        `(${roundToDecimals(100 * (1 - relevantCount / relatedRepos.length), 2)}% is gone)`);
      // if (WRITE_OUTPUT_FILES)
      //   fs.writeFileSync(`out-${outFileName}-relevant.csv`, (new JSONParser()).parse(relevantRepos));
    }

    // 4. Get more complete information about the interesting repositories
    log(`\n>> Finding ${colors.cyan('repository details')} for ${colors.cyan(relevantCount.toString())} relevant repositories`);
    await this.addDetailedRepoInfo(relevantRepos);

    // 5. Process all Relevant repos
    log(`\n>> Finding ${colors.yellow('stars history')} of ${relevantCount} relevant repositories (most starred by the ${userIDs.length} users of '${initialRepoFullName}')`);
    const statRepos = [];
    for (let i = 0; i < relevantCount; i++) {
      const repo = relevantRepos[i];
      const {owner: repoOwner, name: repoName} = GitHubAPI.repoFullNameToParts(repo.fullName);

      log(`*** Resolving ${repo.stars} starrings for '${colors.cyan(repo.fullName)}' (${i + 1}/${relevantCount}) ...`);
      if (NOISE_REPOS.includes(repo.fullName)) {
        log(` < skipping ${repo.fullName} because it's noise for the current analysis`);
        continue;
      }
      const starrings: Starring[] = (await this.redisCache.getJSON(`ga_repo_starrings-${repoOwner}/${repoName}`,
        async () => await this.getRepoStarringsDescending(repoOwner, repoName))).reverse();
      if (starrings.length < 10) {
        log(`W: issues finding stars(t) of '${repo.fullName}: ${starrings?.length}`);
        continue;
      }

      // Compute statistics for various time intervals that end at the beginning of the current week
      let xyList: XYPoint[] = starrings.map(s => ({x: s.ts, y: s.n}));

      // print basic stats (bounds)
      const {first, last, left: xMin, right: xMax, bottom: yMin, top: yMax} = statGetBounds(xyList);
      log(` - last star was ${Math.round((unixTimeProgramStart - xMax) / 3600)} hours ago (#${yMax}), ` +
        `the first (#${yMin}) was ${roundToDecimals((unixTimeProgramStart - xMin) / 3600 / 24 / 365, 2)} years ago`);

      // compute interval stats, and add them to the repo object
      const intervalStats = {};
      for (const interval of STAT_INTERVALS) {
        const right = unixTimeStartOfWeek;
        const left = (interval.weekMinus === -1) ? xMin : right - secondsPerDay * interval.weekMinus;
        repo[interval.name] = intervalStats[interval.name] = statComputeSlope(xyList, left, right, xMin, interval.name);
      }

      // find stars at specific time intervals
      const tDeltaMonthly = secondsPerDay * 365 / 12;
      for (let month = -DEFAULT_HISTOGRAM_MONTHS; month <= 0; month++) {
        let tSample = unixTimeStartOfWeek + tDeltaMonthly * month;
        repo[`T${month}`] = interpolateY(xyList, tSample, repo.fullName);
      }

      // done with this repo
      statRepos.push(repo);
    }

    // remove unused attributes for the export
    statRepos.forEach(r => REMOVE_CSV_ATTRIBUTES.forEach(u => delete r[u]));
    if (WRITE_OUTPUT_FILES)
      fs.writeFileSync(`out-${outFileName}-stats.csv`, (new JSONParser()).parse(statRepos));
  }

  /// Parsers of GitHub GQL data into our own data types

  /// Repository > Starrings

  private async getRepoStarringsDescending(owner: string, name: string): Promise<Starring[]> {
    // get the total number of stars only at the beginning (could be in the paged query, but then it would be live and slow)
    const repoStarsCount = await this.redisCache.getJSON(`gql_repo_stars_count-${owner}/${name}`,
      async () => await this.githubAPI.gqlRepoStarsCount(owner, name));
    const stargazersCount = repoStarsCount.repository.stargazerCount;

    // extract Starrings
    const allStarrings: Starring[] = [];
    let descendingN = stargazersCount;
    await GitHubAPI.gqlMultiPageDataHelper(
      async lastCursor => await this.redisCache.getJSON(`gql_repo_starrings-${owner}/${name}-${stargazersCount}-${lastCursor || 'first'}`,
        async () => await this.githubAPI.gqlRepoStarrings(owner, name, lastCursor)),
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
            userId: s.nodes[i].id,
            userLogin: s.nodes[i].login,
          });
        }
        if (VERBOSE_LOGIC) log(` + fetched ${allStarrings.length} stars / ${stargazersCount}...`);
        return true;
      },
      (data) => [
        data.repository.stargazers.pageInfo.hasNextPage,
        data.repository.stargazers.pageInfo.endCursor,
      ]
    );
    return allStarrings;
  }

  /// User(s) > Repos

  private async getStarredRepoBasicsForUserIDs(userIDs: string[], maxStarsPerUser: number, _repoFullName: string): Promise<RepoInfo[]> {
    const usersTotal = userIDs.length;
    let usersExceedMax = 0;
    let usersMultiPage = 0;
    let usersValid = 0;

    // user.id[] -> RepoInfo(basic)[]:
    //  > process the list in blocks of 40 users
    //    - fetch the starrings (t, repoID) for the 100 users
    //    - remove the users that exceed the max
    //    - for users that have multi-page in their response,
    //      - fetch multi-page and add to the user starrings
    //    - integrate the information in the accumulator
    const repoMap: { [id: string]: RepoInfo } = {};
    const listPartitionSize = 25;
    for (let from = 0; from < userIDs.length; from += listPartitionSize) {
      // get starrings for a block of users
      const partUserIDs = userIDs.slice(from, from + listPartitionSize)
        .filter(userID => !BROKEN_USER_IDS.includes(userID));
      {
        const partSize = partUserIDs.length;
        const userFrom = from + 1;
        const userTo = from + partSize;
        const percentComplete = roundToDecimals((100 * userTo / usersTotal), 1);
        log(` - Fetching stars (up to 100 each, then integrate to ${colors.yellow(maxStarsPerUser.toString())}) for ${partSize} users ` +
          `${colors.red(userFrom.toString())}-${userTo} / ${usersTotal} (${percentComplete}%)...`);
      }

      const cacheKey = `${_repoFullName}-${usersTotal}-${from + 1}-${from + partUserIDs.length}`;
      const gqlUserStarredRepos = await this.redisCache.getJSON(`gql_user_list_starred_repos-${cacheKey}`,
        async () => await this.githubAPI.gqlUserListStarredRepos(partUserIDs));
      if (!gqlUserStarredRepos) {
        err(` < skipping users ${from + 1}-${from + partUserIDs.length} because of an API error. check manually the following users:`,
          JSON.stringify(partUserIDs));
        continue;
      }

      // filter out users for which the starring will exceed the maximum
      const userStarredRepos = gqlUserStarredRepos.nodes.filter(user => user.starredRepositories.totalCount <= maxStarsPerUser);
      usersExceedMax += gqlUserStarredRepos.nodes.length - userStarredRepos.length;
      usersValid += userStarredRepos.length;

      // perform multi-page fetch on users that have more pages to go
      for (let user of userStarredRepos) {
        if (!user.starredRepositories.pageInfo.hasNextPage)
          continue;
        usersMultiPage++;
        await GitHubAPI.gqlMultiPageDataHelper(
          async lastCursor => await this.redisCache.getJSON(`gql_user_starred_repos-${user.login}-${lastCursor}`,
            async () => await this.githubAPI.gqlUserStarredRepos(user.login, lastCursor)),
          (data: GQL.UserStarredRepos) => {
            if (!data) {
              err(` < skipping additions stars for user '${user.login}' because of an API error`);
              return false;
            }
            user.starredRepositories.edges.push(...data.user.starredRepositories.edges);
            if (VERBOSE_LOGIC) log(`   - upped ${colors.yellow(data.user.starredRepositories.edges.length.toString())} additional stars ` +
              `(total: ${colors.yellow(user.starredRepositories.edges.length.toString())}) for user '${user.login}'`);
            return true;
          },
          (data) => [
            data.user.starredRepositories.pageInfo.hasNextPage,
            data.user.starredRepositories.pageInfo.endCursor,
          ],
          user.starredRepositories.pageInfo.endCursor
        );
      }
      if (VERBOSE_LOGIC) log(`   < skipped ${gqlUserStarredRepos.nodes.length - userStarredRepos.length} users that exceeded ` +
        `${colors.magenta('related_users_max_stars')}: ${colors.yellow(maxStarsPerUser.toString())}`);

      // unroll users[]repos[] to RepoInfo(s)
      for (let user of userStarredRepos) {
        for (let repo of user.starredRepositories.edges) {
          const r = repo.node;
          const repoID = r.id;
          if (!repoMap.hasOwnProperty(repoID)) {
            repoMap[repoID] = {
              // basic
              id: repoID,
              fullName: r.nameWithOwner,
              description: null, // to be added later
              isArchived: r.isArchived,
              isFork: r.isFork === true,
              createdAgo: roundToDecimals((unixTimeProgramStart - unixTimeFromISOString(r.createdAt)) / 3600 / 24, 1),
              pushedAgo: roundToDecimals((unixTimeProgramStart - unixTimeFromISOString(r.pushedAt)) / 3600 / 24, 1),
              stars: r.stargazerCount,
              // placeholders for Advanced info
              watchers: 0,
              forks: 0,
              issues: 0,
              pullRequests: 0,
              releases: 0,
              topics: '',
              mentionable: 0,
              assignable: 0,
              // dynamic, related to this analysis, to be populated later in this function
              usersStars: 1,
              leftShare: 0,
              rightShare: 0,
              relevance: 0,
            }
          } else
            repoMap[repoID].usersStars++;
        }
      }
    }
    log(` < skipped a total of ${colors.red(usersExceedMax.toString())} users (over ${usersTotal}) for exceeding the ` +
      `max-stars-per-user hyper-parameter. Using ${colors.red(usersValid.toString())} valid users.`);


    // compute dynamic statistics fields, for the current analysis
    const shareAdjustment = usersValid ? (usersTotal / usersValid) : 1;
    const basicRepoInfoList = Object.values(repoMap);
    for (let repo of basicRepoInfoList) {
      if (repo.stars < 1) {
        log(` < skipping repo ${repo.fullName} that has ${repo.stars} stars, and ${repo.usersStars} references`);
        continue;
      }
      const leftShare = shareAdjustment * repo.usersStars / usersTotal;
      const rightShare = shareAdjustment * repo.usersStars / repo.stars;
      const relevance = Math.pow(rightShare * rightShare * leftShare, 1 / 3);
      repo.leftShare = roundToDecimals(100 * leftShare, 2);
      repo.rightShare = roundToDecimals(100 * rightShare, 2);
      repo.relevance = roundToDecimals(100 * relevance, 2);
    }

    // convert the map to a sorted list of RepoInfo
    basicRepoInfoList.sort((a, b) => b.relevance - a.relevance);
    return basicRepoInfoList;
  }

  private async addDetailedRepoInfo(repos: RepoInfo[]) {
    // user.id[] -> RepoInfo(basic)[]:
    //  > process the list in blocks of 40 repositories
    //    ...
    //    ...
    //    - integrate the information in the accumulator
    const reposTotal = repos.length;
    const listPartitionSize = 40;
    for (let from = 0; from < repos.length; from += listPartitionSize) {
      const partRepos = repos.slice(from, from + listPartitionSize);
      log(` - Fetching repo details for ${partRepos.length} repositories ${colors.red((from + 1).toString())}-${from + partRepos.length}/${reposTotal} ...`);
      const partRepoIDs = partRepos.map(repo => repo.id);

      // fetch details, in batches
      const repoListDetails: GQL.RepoListDetails = await this.redisCache.getJSON(`gql_repo_list_details-${partRepoIDs.length}-${reposTotal}-${partRepoIDs[0]}-${partRepoIDs[partRepoIDs.length - 1]}`,
        async () => await this.githubAPI.gqlRepoListDetails(partRepoIDs));
      if (!repoListDetails) {
        err(` < skipping ADVANCED details for repositories ${from + 1}-${from + partRepoIDs.length} because of an API error. check manually the following repositories:`,
          JSON.stringify(partRepoIDs));
        continue;
      }

      // for each of the detailed repo descriptions
      for (let adv of repoListDetails.nodes) {
        // find the repository in the original list
        const r = partRepos.find(origRepo => origRepo.id === adv.id);
        if (!r) {
          err(`GitHubAnalyzer: cannot merge advanced details for ${adv.nameWithOwner} to the original list. Not found.`);
          continue;
        }

        // merge details
        r.description = adv.description;
        r.watchers = adv.watchers.totalCount;
        r.forks = adv.forkCount;
        r.issues = adv.issues.totalCount;
        r.pullRequests = adv.pullRequests.totalCount;
        r.releases = adv.releases.totalCount;
        r.topics = adv.repositoryTopics.nodes.map(n => n.topic.name).join(', ');
        r.mentionable = adv.mentionableUsers.totalCount;
        r.assignable = adv.assignableUsers.totalCount;
      }
    }
  }
}


const ellipsize = (text, maxLen) => text.length > (maxLen - 3) ? (text.slice(0, maxLen - 3) + '...') : text;

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
  userId: string,
  userLogin: string,
}

export interface RepoInfo {
  // basic (from GQL.RepoBasic)
  id: string,
  fullName: string,
  description: string, // !second pass
  isArchived: boolean,
  isFork: boolean,
  createdAgo: number,
  pushedAgo: number,
  stars: number,
  // full (extra details resolved later, see GQL.RepoAdvanced)
  watchers: number,
  forks: number,
  issues: number,
  pullRequests: number,
  releases: number,
  topics: string,
  mentionable: number,
  assignable: number,
  // task-specific (computed based on the analysis)
  usersStars: number,
  leftShare: number,  // percent
  rightShare: number, // percent
  relevance: number,
  // NOTE: Statistics are added subsequently, for export to CSV reasons
}
