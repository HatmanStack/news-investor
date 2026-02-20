/**
 * Root HTML Template
 * Provides static HTML configuration for PWA and metadata
 * See: https://docs.expo.dev/router/reference/static-rendering/#root-html
 */

import { ScrollViewStyleReset } from 'expo-router/html';
import { type PropsWithChildren } from 'react';
import { colors } from '../src/theme/colors';

// This file is web-only and used to configure the root HTML for every web page.
// For PWA and static metadata, use this file to set <head> tags that need to be present at build time.

export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />

        {/* Primary Meta Tags */}
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />

        {/* PWA Configuration */}
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="theme-color" content={colors.background} />

        {/* PWA Manifest */}
        <link rel="manifest" href="/manifest.json" />

        {/* Icons */}
        <link rel="icon" href="/favicon.ico" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" sizes="180x180" />
        <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png" />
        <link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png" />

        {/* Resets for React Native Web */}
        <ScrollViewStyleReset />

        {/* Global Styles */}
        <style
          dangerouslySetInnerHTML={{
            __html: `
            * {
              box-sizing: border-box;
            }
            html, body, #root {
              height: 100%;
              margin: 0;
              padding: 0;
            }
            body {
              background-color: ${colors.background};
              color: #ffffff;
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
              overflow-x: hidden;
            }
            #root {
              display: flex;
              flex-direction: column;
            }
          `,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
