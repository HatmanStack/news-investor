/**
 * ExportButton
 *
 * Triggers CSV download of portfolio data.
 * Uses Blob download on web, expo-file-system + expo-sharing on native.
 */

import React, { useState } from 'react';
import { Platform } from 'react-native';
import { Button } from 'react-native-paper';
import { FeatureGate } from '@/features/tier';
import { createBackendClient } from '@/services/api/backendClient';
import { useToast } from '@/components/common';

export function ExportButton() {
  const [loading, setLoading] = useState(false);
  const toast = useToast();

  const handleExport = async () => {
    setLoading(true);
    try {
      const client = createBackendClient();
      const response = await client.get('/portfolio/export', {
        responseType: 'text',
      });
      const csvText = response.data as string;

      if (Platform.OS === 'web') {
        // Web: create blob and download via temporary anchor
        const blob = new Blob([csvText], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'portfolio-export.csv';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } else {
        // Native: write to temp file and share via legacy API (expo-file-system v19+)
        const LegacyFS = await import('expo-file-system/legacy');
        const Sharing = await import('expo-sharing');
        const fileUri = LegacyFS.documentDirectory + 'portfolio-export.csv';
        await LegacyFS.writeAsStringAsync(fileUri, csvText, {
          encoding: LegacyFS.EncodingType.UTF8,
        });
        await Sharing.shareAsync(fileUri, {
          mimeType: 'text/csv',
          dialogTitle: 'Export Portfolio',
        });
      }

      toast.show({ message: 'Portfolio exported', variant: 'success' });
    } catch {
      toast.show({ message: 'Failed to export portfolio', variant: 'error' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <FeatureGate feature="portfolio_export" fallback={null}>
      <Button
        mode="outlined"
        icon="download"
        onPress={handleExport}
        loading={loading}
        disabled={loading}
        compact
      >
        Export CSV
      </Button>
    </FeatureGate>
  );
}
