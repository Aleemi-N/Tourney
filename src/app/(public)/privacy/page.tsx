import type { Metadata } from 'next';
import { LegalPage, contactEmail } from '@/components/public/LegalPage';

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: 'What personal information Tourny collects, why, who can see it and how to ask for it to be changed or deleted.',
};

export default function PrivacyPage() {
  const email = contactEmail();
  return (
    <LegalPage title="Privacy Policy" updated="October 2026">
      <p>Tourny helps organizers run volleyball tournaments. This page explains what we collect when you use the website or the mobile app, and what you can do about it.</p>

      <h2>What we collect</h2>
      <ul>
        <li><strong>Account:</strong> your name, email address and a password (stored only as a one-way hash).</li>
        <li><strong>Player registration:</strong> display name, date of birth, phone number, city, height, playing positions, jersey details, playing history and a photo.</li>
        <li><strong>Team applications:</strong> team name, short name, logo, colours, city, and a contact email and phone.</li>
        <li><strong>Tournament activity:</strong> fixtures, scores, results, standings, auction and lot-draw outcomes, and a log of organizer decisions such as approvals.</li>
        <li><strong>Technical data:</strong> sign-in sessions and standard server logs (such as IP address and time of requests).</li>
      </ul>

      <h2>Who can see it</h2>
      <ul>
        <li><strong>Everyone:</strong> once a player is approved, their display name, photo, height, positions and team appear on the public tournament pages, together with match results and statistics. Teams appear with their name, logo and colours.</li>
        <li><strong>Organizers and staff of a tournament:</strong> the details you submitted to that tournament, including phone number and date of birth, so they can run it.</li>
        <li><strong>Not shared:</strong> your phone number, date of birth, email and password are never shown on public pages, and we do not sell personal information.</li>
      </ul>

      <h2>Why we use it</h2>
      <p>To create and run tournaments, to let you register and be contacted about your registration, to show results and statistics, and to keep the service secure.</p>

      <h2>Keeping and deleting it</h2>
      <p>We keep your information while your account exists and while tournaments you took part in remain on the platform. You can ask us to correct it, export it, or delete your account and registrations. Results of completed matches may be kept in anonymised form so that standings stay correct.</p>
      <p>To make a request, write to <a href={`mailto:${email}`}>{email}</a>. We will reply within 30 days.</p>

      <h2>Children</h2>
      <p>If a player is under 18, a parent, guardian or the team organizer should register them and agree to this policy on their behalf.</p>

      <h2>Security</h2>
      <p>Connections are encrypted, passwords are hashed, and access to each tournament&apos;s data is limited by role. No online service is perfectly secure; tell us at the address above if you notice a problem.</p>

      <h2>Changes</h2>
      <p>If this policy changes in a way that matters, we will update the date above and, where possible, tell registered users.</p>
    </LegalPage>
  );
}
