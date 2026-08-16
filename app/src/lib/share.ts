import { Platform, Share } from 'react-native';

export const APP_URL = 'https://cheqer-oweneskew-7242s-projects.vercel.app';

/**
 * Share text via the platform share sheet; on web without navigator.share,
 * fall back to the clipboard.
 */
export async function shareText(text: string): Promise<'shared' | 'copied' | 'failed'> {
  try {
    if (Platform.OS === 'web') {
      const nav = navigator as Navigator & { share?: (data: { text: string }) => Promise<void> };
      if (nav.share) {
        await nav.share({ text });
        return 'shared';
      }
      await navigator.clipboard.writeText(text);
      return 'copied';
    }
    await Share.share({ message: text });
    return 'shared';
  } catch {
    return 'failed';
  }
}

export function formatQaShare(input: {
  heading: string;
  question: string;
  answer: string;
  refs?: string[];
}): string {
  const refLine = input.refs?.length ? `\n\n${input.refs.join(' · ')}` : '';
  return `${input.heading}\n\nQ: ${input.question}\n\n${input.answer}${refLine}\n\n— Cheqer Bible Study · ${APP_URL}`;
}
