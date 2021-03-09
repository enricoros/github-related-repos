export const info = console.info;
export const log = console.log;
export const err = console.error;

export const printAppRoutes = (appName, httpServer, expressApp, socketIO) => {
  const host = httpServer.address().address;
  const port = httpServer.address().port;
  const base = `http://${host}:${port}`;
  log(`${appName} running on '${base}'. Routes:`);
  if (socketIO) {
    // noinspection TypeScriptValidateJSTypes
    log(" - [S.IO] " + socketIO.path() + " (" + base + socketIO.path() + "/, send client js: " + socketIO.serveClient() + ")");
  }
  if (expressApp && expressApp._router)
    expressApp._router.stack.forEach(r => {
      if (r.route && r.route.path) {
        const methods = Object.keys(r.route.methods).join(", ");
        log(" - [" + methods.toUpperCase() + " ] " + r.route.path + " (" + base + r.route.path + ")");
      }
    });
  log();
};
