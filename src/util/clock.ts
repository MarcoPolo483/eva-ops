export class SystemClock {
  hrtime(): number {
    if (typeof performance !== "undefined" && performance.now) {
      return performance.now();
    }
    // Fallback for Node.js
    const [sec, nano] = process.hrtime();
    return sec * 1000 + nano / 1e6;
  }
}
