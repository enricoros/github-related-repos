/**
 * Main
 */

import colors from "colors";
import yargs from "yargs";
import {hideBin} from "yargs/helpers";
import {GitHubAPI} from "./GitHubAPI";
import {GitHubCrawler} from "./GitHubUtils";
import {log, secondsSinceStart} from "./Utils";


async function findRelatedRepositories(repoFullName: string) {
  log(`== ${colors.bold.cyan('GitHub-Analyzer')}: working on ${colors.cyan(repoFullName)} ==\n`);
  const ghAPI = new GitHubAPI();
  const crawler = new GitHubCrawler(ghAPI);
  await crawler.resolveWave(repoFullName, 0, 1);
  log(`\nAnalysis complete in ${secondsSinceStart()} seconds.`);
}


// Route command line options (using yarn) to the right functions
yargs(hideBin(process.argv))
  .usage('$0 command [options]')
  .example('$0 related --repo tensorflow/tfx', 'Finds repositories related to TFX')
  .command('related', 'Discover related GitHub repositories', {},
    (options: {}) => findRelatedRepositories(options['repo']))
  .option('repo', {type: 'string', required: true, description: 'Full name of the repository'})
  .option('verbose', {alias: 'v', count: true, type: 'boolean', description: 'Increase verbosity'})
  .demandCommand(1, 1, 'Issue: you need to specify one command')
  .help()
  .version(false)
  .wrap(100)
  .strict()
  .argv
