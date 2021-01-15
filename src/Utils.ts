/**
 * Utility functions
 */

import colors from "colors";

// shortcuts
export const log = console.log;
export const err = (...args) => console.error(args.map((arg, idx) => (idx == 0) ? colors.bold.red(arg) : arg).join());

// timing helpers
export const secondsPerDay = 60 * 60 * 24;

const unixTimeFromJSDate = (jsDate: Date) => ~~(jsDate.getTime() / 1000);
export const unixTimeFromISOString = (isoTime: string) => unixTimeFromJSDate(new Date(isoTime));

export const unixTimeNow = () => unixTimeFromJSDate(new Date());
export const unixTimeStartOfWeek = (() => {
  // floor(today.UTC)
  const jsTimeMidnight = (new Date()).setUTCHours(0, 0, 0, 0);
  // beginning of week (monday 00:00am UTC)
  const dayOfWeek = (new Date(jsTimeMidnight)).getUTCDay();
  const startOfWeekOffset = dayOfWeek > 1 ? dayOfWeek - 1 : 0;
  const jsTimeStartOfWeek = jsTimeMidnight - startOfWeekOffset * secondsPerDay * 1000;
  return unixTimeFromJSDate(new Date(jsTimeStartOfWeek));
})();

export const unixTimeProgramStart = unixTimeNow();
export const unixTimeProgramElapsed = () => unixTimeNow() - unixTimeProgramStart;

// JS remove set of properties from an object, recursively.
// NOTE: Adapted from https://stackoverflow.com/a/31729247
export const removeProperties = (obj, keysToRemove) => {
  if (obj === null || obj === undefined)
    return obj;
  if (obj instanceof Array) {
    obj.forEach(item => removeProperties(item, keysToRemove));
  } else if (typeof obj === 'object') {
    Object.getOwnPropertyNames(obj).forEach((key) => {
      if (keysToRemove.indexOf(key) !== -1)
        delete obj[key];
      else {
        const value = obj[key];
        if (value && typeof value === 'object')
          removeProperties(value, keysToRemove);
      }
    });
  }
  return obj;
}
