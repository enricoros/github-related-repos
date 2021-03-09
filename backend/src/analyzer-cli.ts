/**
 * Main
 */

import colors from "colors";
import yargs from "yargs";
import {hideBin} from "yargs/helpers";
import {GitHubAPI} from "./worker/GitHubAPI";
import {GitHubAnalyzer} from "./worker/GitHubAnalyzer";
import {log, unixTimeProgramElapsed} from "./worker/Utils";


async function findRelatedRepositories(repoFullName: string) {
  log(`== ${colors.bold.cyan('GitHub-Analyzer')}: finding related repositories to ${colors.cyan(repoFullName)} ==\n`);
  const ghAPI = new GitHubAPI();
  const crawler = new GitHubAnalyzer(ghAPI);
  await crawler.findAndAnalyzeRelatedRepos({
    repoFullName,
    maxStarsPerUser: 200,
  });
  log(`\nAnalysis of '${repoFullName}' complete in ${unixTimeProgramElapsed()} seconds.`);
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
