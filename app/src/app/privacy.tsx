import { router } from 'expo-router';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { CONTACT_EMAIL, RESPONSIBLE_PARTY } from '@/lib/links';
import { themedSheets, useSheet } from '@/lib/theme';

const UPDATED = 'October 2, 2026';

/**
 * Privacy policy. Every statement here describes what the code and the
 * database actually do; change this page in the same commit as any change
 * to what the app stores or sends (schema.sql, supabase/functions).
 */
export default function Privacy() {
  const styles = useSheet(sheets);

  const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
  const P = ({ children }: { children: React.ReactNode }) => (
    <Text style={styles.body}>{children}</Text>
  );
  const Item = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <Text style={styles.body}>
      <Text style={styles.label}>{label} </Text>
      {children}
    </Text>
  );
  const Out = ({ label, url }: { label: string; url: string }) => (
    <Pressable onPress={() => Linking.openURL(url)}>
      <Text style={styles.link}>{label}</Text>
    </Pressable>
  );

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Privacy policy</Text>
      <Text style={styles.updated}>Last updated {UPDATED}</Text>
      <Text style={styles.lead}>
        Cheqer is a free Bible word-study app from {RESPONSIBLE_PARTY}, offered as a ministry
        project and powered by Ailura. {RESPONSIBLE_PARTY} is responsible for the app and for
        the data described here. It has no ads, no analytics, and no tracking. This page says
        what the app stores, why, and how to remove it.
      </Text>

      <Section title="You can use Cheqer without an account">
        <P>
          Reading, word studies, the Library, and Ask all work without signing in. An account is
          only needed to save studies.
        </P>
      </Section>

      <Section title="What Cheqer stores">
        <Item label="Your account, if you create one.">
          Your email address and a password. The password is kept only as a salted hash by the
          sign-in service; nobody can read it. They are used to sign you in and to keep your
          studies yours.
        </Item>
        <Item label="Studies you save.">
          The title, your notes, and the word or passage each study is attached to. A study is
          private to you until you publish it. A published study can be read by everyone signed
          in to Cheqer, without your name or email address, and you can make it private again at
          any time.
        </Item>
        <Item label="The mailing list, if you join it.">
          Your email address, stored only when you tick the consent box on the welcome screen.
          It is used for occasional updates about Cheqer and Ailura and nothing else.
        </Item>
        <Item label="A usage log for the AI features.">
          Each time the app calls an AI feature (Ask, and the Sod panels on the word-study and
          who-and-where screens), the server records your IP address, which feature was used,
          and the time. This caps how much any one connection can use and keeps the running
          cost in check. The log holds no question text and is not tied to an account.
        </Item>
        <Item label="Settings on your device.">
          Your light or dark choice, your last reading spot, whether you have seen the welcome
          screen, and your sign-in session stay in the app or browser on your own device.
        </Item>
      </Section>

      <Section title="Questions you ask">
        <P>
          When you ask a question, its text and any verses you selected go to the Cheqer server.
          The server passes them to Anthropic, whose Claude model writes the answer from the
          passages it finds, and to OpenAI, which turns the question into a search of the period
          writings by meaning. Cheqer does not save your questions and does not attach them to
          your account. Both companies handle them under their own terms for developers.
        </P>
        <P>Please do not put personal details about yourself or anyone else in a question.</P>
        <Out label="Anthropic privacy policy" url="https://www.anthropic.com/legal/privacy" />
        <Out label="OpenAI privacy policy" url="https://openai.com/policies/privacy-policy" />
      </Section>

      <Section title="What Cheqer does not do">
        <P>
          No advertising. No analytics or tracking tools. No selling or sharing of your details
          for marketing. No access to your location, contacts, photos, camera, or microphone.
        </P>
        <P>
          The speaker buttons use the voices built into your device or browser. Some browsers
          send the word to their own speech service to say it; Cheqer sends nothing itself.
        </P>
      </Section>

      <Section title="Who handles the data">
        <Item label="Supabase">
          hosts the database and the sign-in service, in the United States.
        </Item>
        <Item label="Vercel">
          serves the web app and keeps ordinary server logs of requests.
        </Item>
        <Item label="Anthropic and OpenAI">handle the questions you ask, as described above.</Item>
        <P>
          Links out of the app (Buy Me a Coffee, map links for places, the data sources on the
          About screen) open those sites, which have their own policies.
        </P>
      </Section>

      <Section title="Keeping and deleting your data">
        <P>
          Your account and studies are kept until you delete them. You can delete a study from
          its own screen, and you can delete your whole account in the app.
        </P>
        <P>
          Deleting your account removes your sign-in, every study you saved (published ones
          included), and any mailing-list entry under the same email address. It happens at once
          and cannot be undone.
        </P>
        <Pressable onPress={() => router.push('/account' as never)}>
          <Text style={styles.link}>Delete my account</Text>
        </Pressable>
        <P>
          {'\n'}To leave the mailing list without an account, or to ask what is stored about
          you, use the contact below.
        </P>
      </Section>

      <Section title="Children">
        <P>
          Cheqer is not directed at children under 13 and does not knowingly collect their
          details. If you believe a child has created an account, get in touch and it will be
          removed.
        </P>
      </Section>

      <Section title="Changes">
        <P>
          If what the app stores or sends changes, this page changes with it and the date at the
          top is updated.
        </P>
      </Section>

      <Section title="Contact">
        <P>Questions and requests about your data go to {RESPONSIBLE_PARTY}:</P>
        <Out label={CONTACT_EMAIL} url={`mailto:${CONTACT_EMAIL}`} />
      </Section>
    </ScrollView>
  );
}

const sheets = themedSheets((colors) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, paddingBottom: 48, maxWidth: 720, width: '100%', alignSelf: 'center' },
  title: { fontSize: 22, fontWeight: '700', color: colors.ink },
  updated: { fontSize: 12, color: colors.faint, marginTop: 4, marginBottom: 14 },
  lead: { fontSize: 15, color: colors.ink, lineHeight: 23 },
  section: { marginTop: 22 },
  sectionTitle: { fontSize: 17, fontWeight: '700', color: colors.accent, marginBottom: 8 },
  body: { fontSize: 14, color: colors.ink, lineHeight: 22, marginBottom: 8 },
  label: { fontWeight: '700' },
  link: { fontSize: 14, color: colors.link, marginBottom: 6, textDecorationLine: 'underline' },
}));
