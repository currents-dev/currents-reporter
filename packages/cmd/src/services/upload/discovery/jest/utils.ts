export function retryWithBackoff<T, P extends any[]>(
  func: (...args: P) => T,
  backoffIntervals: number[]
): (...args: P) => Promise<T> {
  return (...args: P) => {
    return new Promise<T>((resolve, reject) => {
      let attempt = 0;
      const executeFunction = () => {
        attempt++;
        try {
          const result = func(...args);
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

      executeFunction();
    });
  };
}
