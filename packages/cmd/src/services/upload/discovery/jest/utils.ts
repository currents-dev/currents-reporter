// import { debug } from "../debug";

export function retryWithBackoff<T, P extends any[]>(
  func: (...args: P) => T,
  backoffIntervals: number[]
): (...args: P) => Promise<T> {
  return (...args: P) => {
    return new Promise<T>((resolve, reject) => {
      let attempt = 0;
      const executeFunction = () => {
        attempt++;
        // debug("Attempt %d to execute function with args: %o", attempt, args);

        try {
          const result = func(...args);
          // debug("Function with args %o executed at attempt %d", args, attempt);
          resolve(result);
        } catch (error) {
          if (attempt >= backoffIntervals.length) {
            reject(error);
          } else {
            const backoffInterval = backoffIntervals[attempt - 1];
            setTimeout(executeFunction, backoffInterval);
          }
        }
      };

      // Initial attempt to execute the function
      executeFunction();
    });
  };
}
