jest.retryTimes(1);

let attempts = 0;

describe('transfer', () => {
  it('sends coins', async () => {
    attempts += 1;

    if (attempts === 1) {
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
