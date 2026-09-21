import { redirect } from 'next/navigation';

export default function TournamentsRedirectPage() {
  // Tournaments list is currently integrated into the dashboard.
  redirect('/organizer/dashboard');
}
