import { ScrollViewStyleReset } from 'expo-router/html';
import { type PropsWithChildren } from 'react';

/**
 * Web HTML shell. Mobile browsers tint their own chrome (address bar,
 * bottom toolbar, overscroll) from the document background and the
 * theme-color meta, so both must follow the app's palette or dark mode
 * shows a bright browser frame. ThemeProvider updates these at runtime
 * when the user overrides the system scheme.
 */
export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />
        <meta name="theme-color" media="(prefers-color-scheme: light)" content="#FBF8F1" />
        <meta name="theme-color" media="(prefers-color-scheme: dark)" content="#151A26" />
        <ScrollViewStyleReset />
        <style dangerouslySetInnerHTML={{ __html: CSS }} />
      </head>
      <body>{children}</body>
    </html>
  );
}

const CSS = `
:root { color-scheme: light dark; }
body { background-color: #FBF8F1; }
@media (prefers-color-scheme: dark) {
  body { background-color: #151A26; }
}
`;
