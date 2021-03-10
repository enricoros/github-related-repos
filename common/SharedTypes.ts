/**
 * This file defines Common objects shared by the Server (backend) and Client (frontend)
 *
 * Types/Interfaces added here make sure there's always consistency in the objects transferred
 * via websockets as well as locally stored or accessed.
 */

// server -> client
export interface ServerStatusType {
  clientsCount: number,
  isRunning: boolean,
  opQueueFull: boolean,
}

// client -> server
export interface RequestType {
  operation: string,        // 'relatives'
  repoFullName: string,     // e.g. 'github/roadmap'
  maxStarsPerUser: number,  // default = 200
}

// server[] -> client
export interface ResultType {
  uid: string,
  request: RequestType,
  progress: ProgressType,
  requesterUid: string,
  outputFile: string,
}

// server -> client
export interface ProgressType {
  done: boolean,            // false: not processed yet, true: done
  running: boolean,         // false: stopped, true: in progress
  progress: number,         // could be more granular than (phase / (phases-1))
  s_idx: number,            // current phase (0 ... total - 1)
  s_count: number,          // total phases
  t_start: number,          // start time
  t_elapsed: number,        // seconds elapsed since the start
  t_eta: number,            // expected time remaining
  error?: string,           // if this is set while done, this will contain the details about the error
}
