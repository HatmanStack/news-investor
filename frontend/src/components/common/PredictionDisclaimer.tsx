/**
 * Disclaimer shown wherever a model output or accuracy figure is displayed.
 *
 * The product previously rendered directional predictions with a probability
 * and an accuracy percentage, with no qualification anywhere in the app. That
 * is a performance claim, and presenting one without disclosure is the kind of
 * thing the FTC treats as deceptive regardless of intent.
 *
 * Two variants because the claims differ: `prediction` qualifies a forward
 * statement, `trackRecord` qualifies a historical one. Both say the same
 * substantive things — it is not advice, and past results do not predict future
 * ones.
 */

import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text, useTheme } from 'react-native-paper';

export type DisclaimerVariant = 'prediction' | 'trackRecord';

const COPY: Record<DisclaimerVariant, string> = {
  prediction:
    'Model output for informational purposes only. This is not investment advice, ' +
    'not a recommendation to buy or sell, and not a forecast of actual returns. ' +
    'Markets are uncertain and you may lose money.',
  trackRecord:
    'Historical results for informational purposes only. Past accuracy does not ' +
    'predict future results and is not investment advice. Figures are withheld ' +
    'until enough predictions have resolved to be meaningful.',
};

interface Props {
  variant?: DisclaimerVariant;
}

export function PredictionDisclaimer({ variant = 'prediction' }: Props) {
  const theme = useTheme();

  return (
    <View style={styles.container}>
      <Text
        variant="labelSmall"
        style={[styles.text, { color: theme.colors.onSurfaceVariant }]}
        accessibilityRole="text"
      >
        {COPY[variant]}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 12,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(128,128,128,0.3)',
  },
  text: {
    fontSize: 11,
    lineHeight: 15,
  },
});
