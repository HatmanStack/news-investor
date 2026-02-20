/**
 * Add Stock Modal Component
 * Modal dialog for searching and adding stocks to portfolio
 */

import React, { useState, useCallback } from 'react';
import { View, FlatList, StyleSheet } from 'react-native';
import { Modal, Portal, Appbar, Searchbar, useTheme } from 'react-native-paper';
import { SearchResultItem } from '@/components/search/SearchResultItem';
import { LoadingIndicator } from '@/components/common/LoadingIndicator';
import { ErrorDisplay } from '@/components/common/ErrorDisplay';
import { EmptyState } from '@/components/common/EmptyState';
import { useSymbolSearch } from '@/hooks/useSymbolSearch';
import { usePortfolio } from '@/hooks/usePortfolio';
import { useToast } from '@/components/common';
import { logger } from '@/utils/logger';
import type { SymbolDetails } from '@/types/database.types';

interface AddStockModalProps {
  visible: boolean;
  onDismiss: () => void;
}

export function AddStockModal({ visible, onDismiss }: AddStockModalProps) {
  const theme = useTheme();
  const [searchQuery, setSearchQuery] = useState('');
  const { addToPortfolio, isInPortfolio } = usePortfolio();
  const toast = useToast();

  // Search for symbols
  const {
    data: searchResults = [],
    isLoading,
    error,
    refetch,
  } = useSymbolSearch(searchQuery, {
    minLength: 1,
    enabled: searchQuery.length > 0 && visible,
  });

  const handleSearchChange = useCallback((query: string) => {
    setSearchQuery(query);
  }, []);

  const handleSelectStock = useCallback(
    async (symbol: SymbolDetails) => {
      try {
        if (isInPortfolio(symbol.ticker)) {
          toast.show({ message: `${symbol.ticker} is already in your portfolio`, variant: 'info' });
          setSearchQuery('');
          onDismiss();
          return;
        }
        await addToPortfolio(symbol.ticker);
        toast.show({ message: `${symbol.ticker} added to portfolio`, variant: 'success' });
        setSearchQuery('');
        onDismiss();
      } catch (error) {
        logger.error('[AddStockModal] Error adding stock:', error);
        toast.show({ message: 'Failed to add stock', variant: 'error' });
      }
    },
    [addToPortfolio, isInPortfolio, onDismiss, toast],
  );

  const handleClose = useCallback(() => {
    setSearchQuery('');
    onDismiss();
  }, [onDismiss]);

  const renderSearchResult = useCallback(
    ({ item }: { item: SymbolDetails }) => {
      const alreadyAdded = isInPortfolio(item.ticker);
      return (
        <SearchResultItem
          symbol={item}
          onPress={() => handleSelectStock(item)}
          disabled={alreadyAdded}
          subtitle={alreadyAdded ? 'Already in portfolio' : undefined}
        />
      );
    },
    [handleSelectStock, isInPortfolio],
  );

  const renderEmptyState = () => {
    if (searchQuery.length === 0) {
      return (
        <EmptyState
          message="Search for stocks"
          description="Enter a ticker symbol or company name"
          icon="search-outline"
        />
      );
    }

    if (isLoading) {
      return <LoadingIndicator message="Searching..." />;
    }

    if (error) {
      return <ErrorDisplay error={error as Error} onRetry={refetch} title="Search failed" />;
    }

    return (
      <EmptyState
        message="No results found"
        description={`No stocks found matching "${searchQuery}"`}
        icon="alert-circle-outline"
      />
    );
  };

  return (
    <Portal>
      <Modal
        visible={visible}
        onDismiss={handleClose}
        contentContainerStyle={[styles.modal, { backgroundColor: theme.colors.surface }]}
      >
        <View style={[styles.container, { backgroundColor: theme.colors.surface }]}>
          <Appbar.Header elevated>
            <Appbar.Content title="Add Stock to Portfolio" />
            <Appbar.Action icon="close" onPress={handleClose} />
          </Appbar.Header>

          <View style={[styles.searchContainer, { backgroundColor: theme.colors.surface }]}>
            <Searchbar
              placeholder="Search ticker or company name"
              onChangeText={handleSearchChange}
              value={searchQuery}
              autoFocus
              style={[styles.searchBar, { backgroundColor: theme.colors.surfaceVariant }]}
            />
          </View>

          <FlatList
            data={searchResults}
            renderItem={renderSearchResult}
            keyExtractor={(item) => item.ticker}
            ListEmptyComponent={renderEmptyState}
            contentContainerStyle={
              searchResults.length === 0 ? styles.emptyContent : styles.listContent
            }
          />
        </View>
      </Modal>
    </Portal>
  );
}

const styles = StyleSheet.create({
  modal: {
    margin: 20,
    maxHeight: '80%',
    borderRadius: 8,
    overflow: 'hidden',
  },
  container: {
    flex: 1,
  },
  searchContainer: {
    padding: 12,
  },
  searchBar: {
    elevation: 0,
  },
  listContent: {
    paddingBottom: 16,
  },
  emptyContent: {
    flex: 1,
    justifyContent: 'center',
    padding: 20,
  },
});
