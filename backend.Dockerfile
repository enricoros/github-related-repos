# Backend API, serving the websocket messages
#
#  Build:       docker build -f backend.Dockerfile -t githubkpis-api .
#  Run redis:   docker run --rm -d --name githubkpis-redis -v githubkpis-redis:/data  redis:buster
#  Run:         docker run --rm -it --name githubkpis-api --link githubkpis-redis -p 127.0.0.1:1996:1996 --env-file=backend.env githubkpis-api
#
#  note: customize microservice providers addresses in the environment file (if it
#        doesn't exist, copy from the template). if services are in local docker
#        containers, use the '--link container_name' run option.
#

## [Base]
FROM node:lts-buster

# set the timezone where this is run
RUN ln -nsf /usr/share/zoneinfo/America/Los_Angeles /etc/localtime

# install the dependencies
WORKDIR /app
COPY backend/package.json backend/package-lock.json backend/tsconfig.json /app/
RUN npm install

# copy the source, and transpile typescript
COPY common ../common
COPY backend/. /app/

# build
RUN npm run tsc

# standard env (note that this will open to all interfaces, allowing exposing to the outside-docker world)
ENV API_HOST=0.0.0.0 \
    API_PORT=1996

# specify run command executable
CMD node src/webserver.js
