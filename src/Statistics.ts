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


// Statistics functions

export const statGetBounds = (xyList: XYPoint[], checkMonotonic: boolean = true) => {
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


export function statClip(xyList: XYPoint[], left?: number, right?: number, bottom?: number, top?: number, reason?: string): XYPoint[] {
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


export function statComputeSlope(xyList: XYPoint[], left: number, right: number, leftFirst: number, name: string): number | undefined {
  // if the interval extends to the left of actual data, can't compute the real slope for the interval
  if (left < leftFirst) {
    // log(`statComputeSlope: interval ${basis.name} not present`);
    return undefined;
  }
  // narrow the list to the interval
  xyList = statClip(xyList, left, right, undefined, undefined);
  if (xyList.length < 2) {
    log(`statComputeSlope: empty in ${name} (${xyList.length}). check algo?`);
    return undefined;
  }
  // compute the slope in the basis
  const bounds = statGetBounds(xyList);
  const dX_days = (right - left) / secondsPerDay; // NOTE: using the Basis X interval, not the xDelta
  const dY_stars = bounds.top - bounds.bottom;
  if (dX_days < 1 || dY_stars < 1) {
    err(`statComputeSlope: interval ${name} has bounds issues`, bounds);
    return undefined;
  }
  // round the slope to 2 decimals
  return Math.round(100 * dY_stars / dX_days) / 100;
}
