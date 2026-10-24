import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { ShareButton } from '@/components/share-button';
import { getUsageReport, isAppAdmin, relativeDate, type UsageReport } from '@/lib/studies';
import { themedSheets, useSheet, useTheme } from '@/lib/theme';

/**
 * The owner's usage report: accounts, sign-ups, tester requests, studies and
 * AI use, from the usage_report() RPC. The server refuses anyone not listed
 * in app_admins; the About screen only links here for that account. Nothing
 * here is new tracking: it reads what the app already stores.
 */
export default function Usage() {
  const styles = useSheet(sheets);
  const { palette: colors } = useTheme();
  const admin = useQuery({ queryKey: ['is-app-admin'], queryFn: isAppAdmin });
  const report = useQuery({
    queryKey: ['usage-report'],
    queryFn: getUsageReport,
    enabled: admin.data === true,
  });

  if (admin.isLoading || (admin.data && report.isLoading)) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }
  if (!admin.data) {
    return (
      <View style={styles.center}>
        <Text style={styles.body}>This page is for the app's owner. Sign in to that account first.</Text>
        <Pressable onPress={() => router.push('/studies' as never)}>
          <Text style={styles.link}>Sign in</Text>
        </Pressable>
      </View>
    );
  }
  if (report.isError || !report.data) {
    return (
      <View style={styles.center}>
        <Text style={styles.body}>Could not load the report.</Text>
        <Pressable onPress={() => report.refetch()}>
          <Text style={styles.link}>Try again</Text>
        </Pressable>
      </View>
    );
  }

  const r = report.data;
  const t = r.totals;
  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={report.isRefetching} onRefresh={() => report.refetch()} />
      }>
      <View style={styles.headRow}>
        <Text style={styles.stamp}>As of {dateTime(r.generated_at)}</Text>
        <Pressable onPress={() => report.refetch()} hitSlop={8}>
          <Text style={styles.link}>{report.isRefetching ? 'Refreshing…' : 'Refresh'}</Text>
        </Pressable>
        <ShareButton build={() => formatReport(r)} title="Cheqer usage" label="Share report" />
      </View>

      <Card title="At a glance">
        <Stat label="Accounts" value={`${t.accounts}`} note={`${t.accounts_new_30d} new in 30 days`} />
        <Stat
          label="Accounts signed in"
          value={`${t.accounts_active_7d} this week`}
          note={`${t.accounts_active_30d} in 30 days`}
        />
        <Stat label="Email sign-ups" value={`${t.email_signups}`} note={`${t.email_signups_30d} in 30 days`} />
        <Stat
          label="Tester requests"
          value={`${t.tester_requests}`}
          note={`${t.tester_requests_30d} in 30 days`}
        />
        <Stat
          label="Saved studies"
          value={`${t.studies}`}
          note={`${t.studies_30d} in 30 days, ${t.studies_published} published`}
        />
        <Stat
          label="AI requests"
          value={`${t.ai_requests_7d} this week`}
          note={`${t.ai_requests_30d} in 30 days, ${t.ai_requests_all} all time`}
        />
        <Stat
          label="People using AI"
          value={`${t.ai_people_7d} this week`}
          note={`${t.ai_people_30d} in 30 days`}
        />
        <Stat label="Cached briefs" value={`${t.word_briefs} words`} note={`${t.entity_briefs} people and places`} />
      </Card>

      <Card title="AI by feature, 30 days">
        {r.ai_by_feature_30d.length === 0 && <Text style={styles.footnote}>None yet.</Text>}
        {r.ai_by_feature_30d.map((f) => (
          <Stat key={f.feature} label={FEATURE[f.feature] ?? f.feature} value={`${f.requests}`} />
        ))}
      </Card>

      <Card title="By week">
        <View style={styles.tableRow}>
          {['Week of', 'AI', 'People', 'Accounts', 'Sign-ups', 'Studies'].map((h) => (
            <Text key={h} style={[styles.cell, styles.head, h === 'Week of' && styles.cellWide]}>
              {h}
            </Text>
          ))}
        </View>
        {r.weeks.map((w) => (
          <View key={w.week_of} style={styles.tableRow}>
            <Text style={[styles.cell, styles.cellWide]}>{shortDate(w.week_of)}</Text>
            <Text style={styles.cell}>{w.ai_requests}</Text>
            <Text style={styles.cell}>{w.ai_people}</Text>
            <Text style={styles.cell}>{w.new_accounts}</Text>
            <Text style={styles.cell}>{w.new_signups}</Text>
            <Text style={styles.cell}>{w.studies}</Text>
          </View>
        ))}
      </Card>

      <Card title={`Accounts (${r.accounts.length})`}>
        {r.accounts.map((a) => (
          <View key={a.email} style={styles.person}>
            <Text style={styles.email}>{a.email}</Text>
            <Text style={styles.footnote}>
              Joined {shortDate(a.joined)} · last sign-in {a.last_seen ? relativeDate(a.last_seen) : 'never'}
              {a.confirmed ? '' : ' · unconfirmed'} · {a.studies} {a.studies === 1 ? 'study' : 'studies'}
              {a.published ? ` (${a.published} published)` : ''}
            </Text>
          </View>
        ))}
      </Card>

      <Card title={`Email sign-ups (${r.email_signups.length})`}>
        {r.email_signups.map((e) => (
          <View key={e.email} style={styles.person}>
            <Text style={styles.email}>{e.email}</Text>
            <Text style={styles.footnote}>
              {shortDate(e.joined)} · {e.source ?? 'app'}
              {e.has_account ? ' · has an account' : ''}
            </Text>
          </View>
        ))}
      </Card>

      <Card title={`Tester requests (${r.tester_requests.length})`}>
        {r.tester_requests.length === 0 && <Text style={styles.footnote}>None yet.</Text>}
        {r.tester_requests.map((q) => (
          <View key={`${q.email}-${q.platform}`} style={styles.person}>
            <Text style={styles.email}>{q.email}</Text>
            <Text style={styles.footnote}>
              {q.platform === 'ios' ? 'iPhone' : 'Android'} · {q.status} · {shortDate(q.requested)}
            </Text>
          </View>
        ))}
      </Card>

      <Text style={styles.footnote}>
        Reading needs no account, so people who only read are not counted here. "Last sign-in"
        is the last time an account typed its password; staying signed in does not update it.
        "People using AI" counts distinct network addresses, so one phone on Wi-Fi and on
        cellular counts twice.
      </Text>
    </ScrollView>
  );
}

const FEATURE: Record<string, string> = {
  'sod-search': 'Sod search (Second Temple usage)',
  'sod-brief': 'Word-study briefs',
  'entity-brief': 'Who & where briefs',
  ask: 'Ask (whole Bible)',
  'ask-verse': 'Ask about a verse',
  'tester-request': 'Tester requests',
};

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  const styles = useSheet(sheets);
  return (
    <View style={styles.card}>
      <Text style={styles.title}>{title}</Text>
      {children}
    </View>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  const styles = useSheet(sheets);
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <View style={{ alignItems: 'flex-end', flexShrink: 1 }}>
        <Text style={styles.statValue}>{value}</Text>
        {note ? <Text style={styles.statNote}>{note}</Text> : null}
      </View>
    </View>
  );
}

function shortDate(iso: string): string {
  // Week starts arrive as YYYY-MM-DD; read them as local dates, not UTC midnight.
  const d = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(`${iso}T12:00:00`) : new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function dateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** The whole report as plain text, for Share (mail it to yourself, paste it anywhere). */
export function formatReport(r: UsageReport): string {
  const t = r.totals;
  const lines = [
    `Cheqer usage · ${dateTime(r.generated_at)}`,
    '',
    `Accounts: ${t.accounts} (${t.accounts_new_30d} new in 30 days)`,
    `Signed in: ${t.accounts_active_7d} this week, ${t.accounts_active_30d} in 30 days`,
    `Email sign-ups: ${t.email_signups} (${t.email_signups_30d} in 30 days)`,
    `Tester requests: ${t.tester_requests} (${t.tester_requests_30d} in 30 days)`,
    `Saved studies: ${t.studies} (${t.studies_30d} in 30 days, ${t.studies_published} published)`,
    `AI requests: ${t.ai_requests_7d} this week, ${t.ai_requests_30d} in 30 days, ${t.ai_requests_all} all time`,
    `People using AI: ${t.ai_people_7d} this week, ${t.ai_people_30d} in 30 days`,
    '',
    'AI by feature, 30 days:',
    ...r.ai_by_feature_30d.map((f) => `  ${FEATURE[f.feature] ?? f.feature}: ${f.requests}`),
    '',
    'By week (AI requests / people / new accounts / sign-ups / studies):',
    ...r.weeks.map(
      (w) =>
        `  ${shortDate(w.week_of)}: ${w.ai_requests} / ${w.ai_people} / ${w.new_accounts} / ${w.new_signups} / ${w.studies}`,
    ),
    '',
    `Accounts (${r.accounts.length}):`,
    ...r.accounts.map(
      (a) =>
        `  ${a.email} · joined ${shortDate(a.joined)} · last sign-in ${a.last_seen ? shortDate(a.last_seen) : 'never'} · ${a.studies} studies`,
    ),
    '',
    `Email sign-ups (${r.email_signups.length}):`,
    ...r.email_signups.map(
      (e) => `  ${e.email} · ${shortDate(e.joined)}${e.has_account ? ' · has an account' : ''}`,
    ),
    '',
    `Tester requests (${r.tester_requests.length}):`,
    ...r.tester_requests.map(
      (q) => `  ${q.email} · ${q.platform === 'ios' ? 'iPhone' : 'Android'} · ${q.status} · ${shortDate(q.requested)}`,
    ),
  ];
  return lines.join('\n');
}

const sheets = themedSheets((colors) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: colors.bg,
  },
  content: { padding: 16, paddingBottom: 48, maxWidth: 640, width: '100%', alignSelf: 'center' },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: 14, flexWrap: 'wrap', marginBottom: 12 },
  stamp: { fontSize: 13, color: colors.faint, flex: 1 },
  card: {
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    marginBottom: 12,
  },
  title: { fontSize: 16, fontWeight: '700', color: colors.ink, marginBottom: 8 },
  body: { fontSize: 14, color: colors.ink, lineHeight: 21, textAlign: 'center' },
  link: { fontSize: 14, color: colors.link, marginTop: 8, textDecorationLine: 'underline' },
  footnote: { fontSize: 12, color: colors.faint, lineHeight: 18, marginTop: 2 },
  stat: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  statLabel: { fontSize: 14, color: colors.ink, flexShrink: 1 },
  statValue: { fontSize: 14, color: colors.ink, fontWeight: '700' },
  statNote: { fontSize: 12, color: colors.faint },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 5,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  cell: { flex: 1, fontSize: 13, color: colors.ink, textAlign: 'right' },
  cellWide: { flex: 1.4, textAlign: 'left' },
  head: { color: colors.faint, fontWeight: '700', fontSize: 12 },
  person: { paddingVertical: 6, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  email: { fontSize: 14, color: colors.ink },
}));
