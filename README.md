# Related GitHub Projects

Find related GitHub projects to a target, and understand their success.

#### Working principle

We find all the GitHub stars of the target project. Each star belongs to a user. We then descend recursively into each user to find all
their starred projects - and the theory is that when accumulating and ranking all the starred projects, the related project will be on top
of the list. In other words, we rely on the wisdom of the original repo's crowd.

This project uses the [GitHub GraphQL API](https://docs.github.com/en/graphql) to query information about _Repositories_ and
_Users_ of GitHub.

#### Changelog
* Mar 10, 2021: Added a react-material-typescript frontend
* Mar  9, 2021: Added a node/express web server as backend 
* Mar  8, 2021: Separated the worker and CLI into the backend/src
* Jan 27, 2021: Added 10 fields, reduced API usage, increased caching
* Jan 17, 2021: Migrated to the GraphQL API

## Backend

This is a Node.JS application written in TypeScript; you can use your favorite IDE to Load and run it, or proceed from the command line, in
which case you can follow these instructions (from the ```backend``` folder):

1. Install the required code dependencies (axios, json2csv, redis, yargs) by running:
   ```shell
   cd backend
   npm install
   ```
1. Set your GitHub Personal Access Token. If missing, create one on: https://github.com/settings/tokens
   and click on 'Generate New Token'. Save the Token string
   ```shell
   # Note that <TOKEN> should be replaced with your personal token
   export GITHUB_PA_TOKEN="<TOKEN>"
   ```
1. Either: use the downloaded 'ts-node' executable to transpile TS -> JS and Run in node directly:
   ```shell
   ./node_modules/.bin/ts-node src/analyzer-cli.ts
   ```
1. Or: compile TypeScript to JavaScript and run it with ```Node.JS```, for instance:
   ```shell
   npm run tsc
   node src/github-analyzer.js
   ```

On both 3. or 4 above, for finding related repositories, for example to 'github/roadmap', use the following options:

```shell
backend/src/analyzer-cli.ts related --repo github/roadmap
```

## Worker Configuration

All the source code is in the [backend/src](backend/src) folder. The following can be edited to configure the application:

* [backend/src/analyzer-cli.ts](backend/src/analyzer-cli.ts) for  ```repoFullName```, the name of the target repository
* [backend/src/worker/GitHubAnalyzer.ts](backend/src/worker/GitHubAnalyzer.ts) for ```WRITE_OUTPUT_FILES``` and a couple of debug flags and more importantly for _ranking_
  and _
  filtering_ criteria.

### Advanced: Worker Filtering & Ranking

Sorry it's all in the code so far, but basically you want to change the ```HYPER_PARAMS``` variable
inside [backend/src/worker/GitHubAnalyzer.ts](backend/src/worker/GitHubAnalyzer.ts) for changing filtering criteria, followed by the function that
sets ```repo.relevance``` in the ```resolveUsersStarredRepos(...)``` function.

## Acknowledgements

### 🚀 [timqian/star-history](https://github.com/timqian/star-history)

The repo that provided inspiration, and part of the code for fetching the 'starrings'. Thanks, GitHub brother.
