/**
 * Main
 */

import {GitHubCrawler, GitHubUtils} from "./GitHubUtils";
import {log, secondsSinceStart} from "./utils";

// Configuration
const repoFullName = 'huggingface/transformers';

log(`== GitHub-Related-Repos: analyzing ${repoFullName} ==\n`);
const gitHubAPI = new GitHubUtils();
const crawler = new GitHubCrawler(gitHubAPI);
crawler.resolveWave(repoFullName, 0, 1)
  .then(() => log(`\nAnalysis complete in ${secondsSinceStart()} seconds.`));
