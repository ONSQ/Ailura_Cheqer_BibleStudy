import { router } from 'expo-router';
import { useState } from 'react';
import {
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { BrandEmblem } from '@/components/brand';
import { requestTesterInvite, type TesterPlatform, type TesterRequestResult } from '@/lib/api';
import {
  PLAY_OPT_IN_URL,
  PLAY_TEST_URL,
  PLAY_TESTER_GROUP_URL,
  TESTFLIGHT_PUBLIC_URL,
} from '@/lib/links';
import { themedSheets, useSheet, useTheme } from '@/lib/theme';

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/;

/**
 * Get the app: the phone apps are in testing on both stores. Someone on
 * the web picks their phone, leaves an email, and the tester-request
 * function either sends the TestFlight invite (iPhone) or hands back the
 * Google Play opt-in link (Android). Once the Android tester group is set
 * (PLAY_TESTER_GROUP_URL), Android visitors sign themselves up instead: join
 * the group, opt in, install. No email or manual step is involved.
 */
export default function GetTheApp() {
  const styles = useSheet(sheets);
  const { palette: colors } = useTheme();
  const [platform, setPlatform] = useState<TesterPlatform>(
    Platform.OS === 'android' ? 'android' : 'ios',
  );
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<TesterRequestResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = EMAIL_RE.test(email.trim()) && !busy;

  const submit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      setResult(await requestTesterInvite(email.trim(), platform));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const directUrl = platform === 'ios' ? TESTFLIGHT_PUBLIC_URL : PLAY_TEST_URL;
  const androidSelfServe = platform === 'android' && PLAY_TESTER_GROUP_URL != null;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.hero}>
        <BrandEmblem size={96} />
        <Text style={styles.title}>Cheqer on your phone</Text>
        <Text style={styles.lead}>
          The same word study you use here, as an app for iPhone and Android: tap any word, see
          the Hebrew or Greek behind it, follow it through Scripture, and ask questions of the
          text. Free, with no ads.
        </Text>
        <Text style={styles.lead}>
          Both apps are in testing before they go on the stores. Testers get every build as it
          lands, and the app updates itself after that.
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Which phone?</Text>
        <View style={styles.choiceRow}>
          <Choice
            label="iPhone"
            sub="through Apple TestFlight"
            on={platform === 'ios'}
            onPress={() => {
              setPlatform('ios');
              setResult(null);
            }}
          />
          <Choice
            label="Android"
            sub="through Google Play testing"
            on={platform === 'android'}
            onPress={() => {
              setPlatform('android');
              setResult(null);
            }}
          />
        </View>

        {androidSelfServe ? (
          <AndroidSteps groupUrl={PLAY_TESTER_GROUP_URL!} />
        ) : directUrl ? (
          <>
            <Pressable style={styles.primaryBtn} onPress={() => Linking.openURL(directUrl)}>
              <Text style={styles.primaryBtnText}>
                {platform === 'ios' ? 'Open in TestFlight' : 'Join on Google Play'}
              </Text>
            </Pressable>
            <Text style={styles.hint}>
              {platform === 'ios'
                ? 'Opens the TestFlight app on your iPhone. Install TestFlight from the App Store first if you do not have it.'
                : 'Open this on your Android phone, signed in to the Google account you use for the Play Store. While Android is in closed testing, Google Play shows Cheqer only to approved testers; if it says the app is not available, ask for an invite below.'}
            </Text>
            <Text style={styles.or}>or ask for an invite by email</Text>
          </>
        ) : null}

        {androidSelfServe ? null : result ? (
          <View style={styles.done}>
            <Text style={styles.doneTitle}>
              {result.status === 'invited'
                ? 'Invitation on its way'
                : result.status === 'linked'
                  ? 'You are in'
                  : 'Request received'}
            </Text>
            <Text style={styles.body}>
              {result.status === 'invited'
                ? 'Apple will email you a TestFlight invitation shortly. Install the TestFlight app on your iPhone, then open the link in that email.'
                : result.status === 'linked'
                  ? 'Open the link below on your Android phone, signed in to the Google account you use for the Play Store, and accept the invitation. The app then installs from Google Play.'
                  : 'Your address is saved. You will get the install link by email once the next test round opens, usually within a day or two.'}
            </Text>
            {result.url ? (
              <Pressable style={styles.primaryBtn} onPress={() => Linking.openURL(result.url!)}>
                <Text style={styles.primaryBtnText}>Join on Google Play</Text>
              </Pressable>
            ) : null}
          </View>
        ) : (
          <>
            <Text style={styles.sectionTitle}>
              {platform === 'ios' ? 'Your Apple ID email' : 'The Google account on your phone'}
            </Text>
            <TextInput
              style={styles.input}
              placeholder="you@example.com"
              placeholderTextColor={colors.faint}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              value={email}
              onChangeText={(t) => {
                setEmail(t);
                if (error) setError(null);
              }}
              onSubmitEditing={submit}
            />
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <Pressable
              style={[styles.primaryBtn, !canSubmit && styles.btnDisabled]}
              disabled={!canSubmit}
              onPress={submit}>
              <Text style={styles.primaryBtnText}>
                {busy ? 'Sending…' : platform === 'ios' ? 'Send my TestFlight invite' : 'Get the Play link'}
              </Text>
            </Pressable>
            <Text style={styles.hint}>
              {platform === 'ios'
                ? 'Use the email address tied to your Apple ID; that is where TestFlight invites go.'
                : 'Use the Google account signed in on your Android phone; Google Play checks it.'}
            </Text>
          </>
        )}
      </View>

      <Text style={styles.footnote}>
        {androidSelfServe
          ? 'Cheqer stores nothing for Android signup. Joining the group shows your Google account email to the group owner, as Google Groups does for any group.'
          : 'Your email is used only to send the invite and is kept with the test records. It is not added to the mailing list.'}{' '}
        <Text style={styles.link} onPress={() => router.push('/privacy' as never)}>
          Privacy policy
        </Text>
      </Text>
    </ScrollView>
  );
}

/** The three self-serve steps for Android, each opening Google's own page. */
function AndroidSteps({ groupUrl }: { groupUrl: string }) {
  const styles = useSheet(sheets);
  const steps = [
    {
      title: 'Join the Cheqer testers group',
      body: 'Use the Google account signed in on your Android phone, and choose Join group.',
      label: 'Join the group',
      url: groupUrl,
    },
    {
      title: 'Become a tester',
      body: 'Google Play asks you to accept the test. If it says you are not eligible yet, wait a few minutes after joining and try again.',
      label: 'Become a tester',
      url: PLAY_OPT_IN_URL,
    },
    {
      title: 'Install Cheqer',
      body: 'Install from Google Play like any other app. Updates arrive on their own.',
      label: 'Open in Google Play',
      url: PLAY_TEST_URL ?? 'https://play.google.com/store/apps/details?id=net.onsq.cheqer',
    },
  ];
  return (
    <View>
      {steps.map((s, i) => (
        <View key={s.title} style={[styles.step, i > 0 && styles.stepGap]}>
          <View style={styles.stepNum}>
            <Text style={styles.stepNumText}>{i + 1}</Text>
          </View>
          <View style={styles.stepBody}>
            <Text style={styles.stepTitle}>{s.title}</Text>
            <Text style={styles.body}>{s.body}</Text>
            <Pressable style={styles.primaryBtn} onPress={() => Linking.openURL(s.url)}>
              <Text style={styles.primaryBtnText}>{s.label}</Text>
            </Pressable>
          </View>
        </View>
      ))}
      <Text style={styles.hint}>
        Open these on your Android phone. All three use the same Google account.
      </Text>
    </View>
  );
}

function Choice({
  label,
  sub,
  on,
  onPress,
}: {
  label: string;
  sub: string;
  on: boolean;
  onPress: () => void;
}) {
  const styles = useSheet(sheets);
  return (
    <Pressable style={[styles.choice, on && styles.choiceOn]} onPress={onPress}>
      <Text style={[styles.choiceLabel, on && styles.choiceLabelOn]}>{label}</Text>
      <Text style={styles.choiceSub}>{sub}</Text>
    </Pressable>
  );
}

const sheets = themedSheets((colors) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, paddingBottom: 48, maxWidth: 560, width: '100%', alignSelf: 'center' },
  hero: { alignItems: 'center', marginBottom: 20 },
  title: { fontSize: 24, fontWeight: '700', color: colors.ink, marginTop: 12 },
  lead: { fontSize: 15, color: colors.ink, lineHeight: 23, textAlign: 'center', marginTop: 10 },
  card: {
    backgroundColor: colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 18,
  },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: colors.accent, marginBottom: 8 },
  choiceRow: { flexDirection: 'row', gap: 10, marginBottom: 18 },
  choice: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 12,
    backgroundColor: colors.bg,
  },
  choiceOn: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  choiceLabel: { fontSize: 16, fontWeight: '700', color: colors.faint },
  choiceLabelOn: { color: colors.ink },
  choiceSub: { fontSize: 12, color: colors.faint, marginTop: 2 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: colors.ink,
    backgroundColor: colors.bg,
  },
  primaryBtn: {
    backgroundColor: colors.accent,
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: 'center',
    marginTop: 12,
  },
  btnDisabled: { opacity: 0.5 },
  primaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  hint: { fontSize: 12, color: colors.faint, lineHeight: 17, marginTop: 8 },
  or: { fontSize: 12, color: colors.faint, textAlign: 'center', marginVertical: 14 },
  error: { color: colors.danger, fontSize: 13, marginTop: 8 },
  done: { paddingVertical: 6 },
  doneTitle: { fontSize: 17, fontWeight: '700', color: colors.ink, marginBottom: 6 },
  body: { fontSize: 14, color: colors.ink, lineHeight: 21 },
  footnote: { fontSize: 12, color: colors.faint, lineHeight: 18, marginTop: 16, textAlign: 'center' },
  link: { color: colors.link, textDecorationLine: 'underline' },
  step: { flexDirection: 'row', gap: 12 },
  stepGap: { marginTop: 18 },
  stepNum: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumText: { fontSize: 14, fontWeight: '700', color: colors.accent },
  stepBody: { flex: 1 },
  stepTitle: { fontSize: 15, fontWeight: '700', color: colors.ink, marginBottom: 4 },
}));
