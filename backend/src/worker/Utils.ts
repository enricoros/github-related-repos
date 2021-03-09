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

// others
export const roundToDecimals = (n: number, decimals: number) => +n.toFixed(decimals);
