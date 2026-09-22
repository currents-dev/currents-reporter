const { readSession } = require('../detoxSim/session');

describe('transfer', () => {
  // Passes once Detox reruns it, the way a flaky test behaves under
  // `detox test --retries`.
  it('sends coins', async () => {
    if (readSession().testSessionIndex === 0) {
      throw new Error(
        'Test Failed: Timed out waiting for element by id "confirm-dialog" to be visible (5000ms)'
      );
    }
  });

  it('shows the fee estimate', async () => {
    throw new Error(
      'Test Failed: Timed out waiting for element by id "fee-estimate" to have text "0.0001 BTC" (5000ms)'
    );
  });
});
