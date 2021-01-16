/**
 * Statistic helper functions. They revolve around {x,y} points.
 */
import {err, log, secondsPerDay} from "./Utils";

// Configuration of this module
const VERBOSE_STATS = false;

// Types
export interface XYPoint {
  x: number,
  y: number
}

export type XYList = XYPoint[];

interface Basis {
  // in
  name: string,
  days: number,
  // out
  slope?: number,
}


// Statistics functions

export const statGetBounds = (xyList: XYList, checkMonotonic: boolean = true) => {
  const bounds = {
    first: xyList[0],
    last: xyList[xyList.length - 1],
    left: undefined,
    right: undefined,
    bottom: undefined,
    top: undefined,
  }
  // had a nicer syntax earlier, but array destructuring can exceed stack size here
  xyList.forEach(xy => {
    if (bounds.left === undefined || xy.x < bounds.left) bounds.left = xy.x;
    if (bounds.right === undefined || xy.x > bounds.right) bounds.right = xy.x;
    if (bounds.bottom === undefined || xy.y < bounds.bottom) bounds.bottom = xy.y;
    if (bounds.top === undefined || xy.y > bounds.top) bounds.top = xy.y;
  });
  if (checkMonotonic && (bounds.left !== xyList[0].x || bounds.right != xyList[xyList.length - 1].x || bounds.bottom !== xyList[0].y || bounds.top != xyList[xyList.length - 1].y))
    log(`statBounds: list not monotonic (bounds: ${bounds}`);
  return bounds;
}


export function statClip(xyList: XYList, left?: number, right?: number, bottom?: number, top?: number, reason?: string): XYList {
  const initialListSize = xyList.length;
  const filteredList = xyList.filter(xy => {
    if (left && xy.x < left) return false;
    if (right && xy.x > right) return false;
    if (bottom && xy.y < bottom) return false;
    return !(top && xy.y > top);
  });
  const finalListSize = filteredList.length;
  if (VERBOSE_STATS && initialListSize !== finalListSize && initialListSize) {
    if (finalListSize) {
      const removedPercent = Math.round((1 - (finalListSize / initialListSize)) * 100 * 100) / 100;
      log(`statFilterBounds: removed ${initialListSize - finalListSize} (${removedPercent}%), ${finalListSize} left${reason ? ', because: ' + reason : ''}`);
    } else
      log(`statFilterBounds: removed all ${initialListSize} points${reason ? ', because: ' + reason : ''}`);
  }
  return filteredList;
}


export function statComputeSlopes(xyList: XYList, Bases: Basis[], right: number, leftMin: number) {
  for (let basis of Bases) {
    // select the points in the basis
    const left = (basis.days === -1) ? leftMin : right - secondsPerDay * basis.days;
    if (left < leftMin) {
      // log(`statComputeSlopes: interval ${basis.name} not present`);
      continue;
    }
    const basisXY = statClip(xyList, left, right, undefined, undefined, basis.name);
    if (basisXY.length < 2) {
      log(`statComputeSlopes: empty in ${basis.name} (${basisXY.length}). check algo?`);
      continue;
    }
    // compute the slope in the basis
    const bounds = statGetBounds(basisXY);
    const dX_days = (right - left) / secondsPerDay; // NOTE: using the Basis X interval, not the xDelta
    const dY_stars = bounds.top - bounds.bottom;
    if (dX_days < 1 || dY_stars < 1) {
      err(`statComputeSlopes: interval ${basis.name} has bounds issues`, bounds);
      continue;
    }
    basis.slope = Math.round(100 * dY_stars / dX_days) / 100;
  }
}
