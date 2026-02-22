/**
 * Prediction Snapshot Service unit tests
 */

import { submitPredictionSnapshot } from '../sync/predictionSnapshotService';

const mockPost = jest.fn();

jest.mock('@/services/api/backendClient', () => ({
  createBackendClient: () => ({
    post: mockPost,
  }),
}));

describe('submitPredictionSnapshot', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should call POST /predictions/snapshot with ticker and predictions', async () => {
    mockPost.mockResolvedValue({ data: { snapshotsCreated: 3 } });

    await submitPredictionSnapshot('AAPL', {
      nextDay: { direction: 'up', probability: 0.7 },
      twoWeek: { direction: 'down', probability: 0.4 },
      oneMonth: { direction: 'up', probability: 0.6 },
    });

    expect(mockPost).toHaveBeenCalledWith('/predictions/snapshot', {
      ticker: 'AAPL',
      predictions: {
        nextDay: { direction: 'up', probability: 0.7 },
        twoWeek: { direction: 'down', probability: 0.4 },
        oneMonth: { direction: 'up', probability: 0.6 },
      },
    });
  });

  it('should not throw when request fails (fire-and-forget)', async () => {
    mockPost.mockRejectedValue(new Error('Network error'));

    await expect(
      submitPredictionSnapshot('AAPL', {
        nextDay: { direction: 'up', probability: 0.7 },
      }),
    ).resolves.not.toThrow();
  });
});
