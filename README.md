# Related GitHub Projects

Find related GitHub projects to a target, and understand their success.

#### Working principle

We find all the GitHub stars of the target project (up to 40K). Each star belongs to a user. We then descend recursively into each user to
find all their starred projects - and the theory is that when accumulating and ranking all the starred projects, the related project will be
on top of the list. In other words, we rely on the wisdom of the original repo's crowd.

This project uses the [GitHub REST PI](https://docs.github.com/en/free-pro-team@latest/rest) to query information about _Repositories_ and _
Users_ of GitHub.

## Configure

All the source code is in the [src](src) folder.

The following can be edited to configure the application:

* [src/index.ts](src/index.ts) for  ```repoFullName```, the name of the target repository
* [src/GitHubUtils.ts](src/GitHubUtils.ts) for ```WRITE_OUTPUT_FILES``` and a couple of debug flags and more importantly for _ranking_ and _
  filtering_ criteria.

## Run

This is a Node.JS application written in TypeScript; you can use your favorite IDE to Load and run it, or proceed from the command line, in
which case you can follow these instructions:

1. Install the required code dependencies (axios, json2csv, redis) by running:
   ```shell
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
   ./node_modules/.bin/ts-node src/index.ts
   ```
1. Or: compile TypeScript to JavaScript and run it with ```Node.JS```, for instance:
   ```shell
   npm run tsc
   node src/index.js
   ```


## Advanced Configuration

### Filtering & Ranking

Sorry it's all in the code so far, but basically you want to change the ```HYPER_PARAMS``` variable
inside [src/GitHubUtils.ts](src/GitHubUtils.ts) for changing filtering criteria, followed by the function that sets ```repo.relevance``` in
the ```resolveUsersStarredRepos(...)``` function.


## Acknowledgements

### 🚀 [timqian/star-history](https://github.com/timqian/star-history)

The repo that provided inspiration, and part of the code for fetching the 'starrings'. Thanks, GitHub brother.
