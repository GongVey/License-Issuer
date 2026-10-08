import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';

// After any card mutation, every view derived from cards is stale: lists, details, batches, overview and logs.
export function useRefreshCards() {
  const client = useQueryClient();
  return useCallback(() => Promise.all(['cards', 'card', 'batches', 'batch', 'dashboard', 'activation-log', 'audit-log']
    .map(key => client.invalidateQueries({ queryKey: [key] }))), [client]);
}
