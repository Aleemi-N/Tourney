import { Linking, Platform } from 'react-native';

export type CalendarEvent = { title: string; start: Date; minutes?: number; location?: string | null; notes?: string };

const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

/** Opens the phone's "new event" screen (no calendar permission needed). On the web it opens Google Calendar. */
export async function addToCalendar(event: CalendarEvent): Promise<void> {
  const end = new Date(event.start.getTime() + (event.minutes ?? 90) * 60000);
  if (Platform.OS === 'web') {
    const url = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(event.title)}&dates=${stamp(event.start)}/${stamp(end)}`
      + `${event.location ? `&location=${encodeURIComponent(event.location)}` : ''}${event.notes ? `&details=${encodeURIComponent(event.notes)}` : ''}`;
    await Linking.openURL(url);
    return;
  }
  const { createEventInCalendarAsync } = await import('expo-calendar/legacy');
  await createEventInCalendarAsync({ title: event.title, startDate: event.start, endDate: end, location: event.location ?? undefined, notes: event.notes });
}
