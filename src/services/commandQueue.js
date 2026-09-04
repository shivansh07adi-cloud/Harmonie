// Tracks how many commands are actively executing right now, so !ping can show
// a genuine "queue" figure instead of a hardcoded placeholder.
let activeCount = 0;

export function commandStarted() {
  activeCount += 1;
}

export function commandFinished() {
  activeCount = Math.max(0, activeCount - 1);
}

/** Active commands excluding the caller's own in-flight execution. */
export function getQueueDepth() {
  return Math.max(0, activeCount - 1);
}
