/** Community edition stub -- no watchlist sync */
export function useWatchlistSync() {
  return {
    syncAdd: async (_ticker: string, _name: string) => {},
    syncRemove: async (_ticker: string) => {},
    pullAndMerge: async () => {},
  };
}
