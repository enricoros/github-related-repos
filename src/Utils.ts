/**
 * Utility functions
 */

import colors from "colors";

// shortcuts
export const log = console.log;
export const err = (...args) => console.error(args.map((arg, idx) => (idx == 0) ? colors.bold.red(arg) : arg));

// timing helpers, optional
export const unixTimeNow = () => ~~(Date.now() / 1000);
export const unixTimeStart = unixTimeNow();
export const secondsSinceStart = () => unixTimeNow() - unixTimeStart;

// JS remove set of properties from an object, recursively.
// NOTE: Adapted from https://stackoverflow.com/a/31729247
export const removePropertiesRecursively = (obj, keysToRemove) => {
  if (obj === null || obj === undefined) return;
  if (obj instanceof Array) {
    obj.forEach(item => removePropertiesRecursively(item, keysToRemove));
  } else if (typeof obj === 'object') {
    Object.getOwnPropertyNames(obj).forEach((key) => {
      if (keysToRemove.indexOf(key) !== -1)
        delete obj[key];
      else {
        const value = obj[key];
        if (value && typeof value === 'object')
          removePropertiesRecursively(value, keysToRemove);
      }
    });
  }
}
