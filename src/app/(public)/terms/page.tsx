import type { Metadata } from 'next';
import { LegalPage, contactEmail } from '@/components/public/LegalPage';

export const metadata: Metadata = {
  title: 'Terms of Use',
  description: 'The rules for using Tourny as an organizer, team owner, player or spectator.',
};

export default function TermsPage() {
  const email = contactEmail();
  return (
    <LegalPage title="Terms of Use" updated="October 2026">
      <p>By creating an account or using Tourny you agree to these terms.</p>

      <h2>Your account</h2>
      <ul>
        <li>Give accurate information and keep your password private. You are responsible for what happens under your account.</li>
        <li>You must be at least 18, or be registered by a parent, guardian or organizer who accepts these terms for you.</li>
      </ul>

      <h2>Organizers</h2>
      <ul>
        <li>You run your tournaments and decide who plays. You are responsible for the rules, fees, schedules and safety of your events.</li>
        <li>Use the personal information of participants only to run your tournament, and do not share it with others.</li>
        <li>Auction budgets and amounts in Tourny are scoring tools for your event. Tourny does not process payments.</li>
      </ul>

      <h2>Players and team owners</h2>
      <ul>
        <li>Photos, logos and names you upload must be yours to use, and must not be offensive or unlawful.</li>
        <li>Approval of a registration or team is the organizer&apos;s decision.</li>
      </ul>

      <h2>Acceptable use</h2>
      <p>Do not try to break, overload or gain unauthorised access to the service, impersonate others, or upload harmful files. We may suspend accounts that do.</p>

      <h2>Content you upload</h2>
      <p>You keep ownership of your content. You allow us to store it and show it on the platform as described in the <a href="/privacy">Privacy Policy</a>.</p>

      <h2>Availability</h2>
      <p>We work to keep Tourny available, but it is provided as is, without a guarantee that it will always be uninterrupted or error free. Check important results with your organizer.</p>

      <h2>Contact</h2>
      <p>Questions about these terms: <a href={`mailto:${email}`}>{email}</a>.</p>
    </LegalPage>
  );
}
