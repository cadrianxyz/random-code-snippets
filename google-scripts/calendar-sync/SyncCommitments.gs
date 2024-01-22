// Heavily copied from https://github.com/karbassi/sync-multiple-google-calendars
// Helpful google calendar docs: https://developers.google.com/apps-script/reference/calendar/calendar-app

// copy all non-reclaim events to the "meetings" calendar
// "meetings" calendar will be shared with main calendar

const CALENDAR_MERGE_FROM = '<ENTER_HERE>@group.calendar.google.com';
const CALENDAR_MERGE_INTO = '<ENTER_HERE>@group.calendar.google.com';

const SYNC_INTERVAL_DAYS = 40;
const SYNC_DAYS_IN_PAST = 7;
const SYNC_DAYS_IN_FUTURE = 180;

// Unique characters to use in event deletion. For identifying duplicates, use https://unicode-table.com/en/200B/ if needed.
const CHARACTER_SYMBOL_DUPLICATE = '';
const CHARACTER_SYMBOL_IGNORE = /^.*?(busy$)|(personal commitment$)|(unconfirmed commitment$)|(flight$)/gi;
// Unique characters to use in event copying

const ALERT_COLOR = 6; // test using "colorTest.gs"

function SyncCommitments() {
  console.log('Synchronizing Events from Main Calendar to "Star" (Support) Calendar');
  const alpha = new Date();
  alpha.setHours(0, 0, 0, 0); // Midnight
  alpha.setDate(alpha.getDate() - SYNC_DAYS_IN_PAST);

  const omega = new Date();
  omega.setHours(0, 0, 0, 0); // Midnight
  omega.setDate(omega.getDate() + SYNC_DAYS_IN_FUTURE + 1);

  deleteExistingEvents(alpha, omega);

  let startTime = new Date(alpha);
  let endTime = new Date(alpha);

  // sync for past events first
  if (SYNC_DAYS_IN_PAST > 0) {
    copyEvents(startTime, endTime);
    startTime.setDate(startTime.getDate() + SYNC_DAYS_IN_PAST);
  }

  // sync future events in increments (spaces of time, to avoid errors in large bulk processing)
  while (endTime <= omega) {
    startTime = new Date(endTime);
    endTime.setDate(endTime.getDate() + SYNC_INTERVAL_DAYS);

    if (endTime > omega) {
      copyEvents(startTime, omega);
    }
    else {
      copyEvents(startTime, endTime);
    }
  }
}

function deleteExistingEvents(startTime, endTime) {
  const existingCalendar = CalendarApp.getCalendarById(CALENDAR_MERGE_INTO);
  let existingEvents;
  if (CHARACTER_SYMBOL_DUPLICATE) {
    existingEvents = existingCalendar
      .getEvents(startTime, endTime, { search: CHARACTER_SYMBOL_DUPLICATE })
      .filter((event) => event.getTitle().includes(CHARACTER_SYMBOL_DUPLICATE));
  }
  else {
    existingEvents = existingCalendar.getEvents(startTime, endTime)
  }

  const requestBody = existingEvents.map((e, i) => ({
    method: 'DELETE',
    endpoint: `${ENDPOINT_BASE}/${CALENDAR_MERGE_INTO}/events/${e
      .getId()
      .replace('@google.com', '')}`,
  }));

  if (requestBody && requestBody.length) {
    const result = new BatchRequest({
      useFetchAll: true,
      batchPath: 'batch/calendar/v3',
      requests: requestBody,
    });

    if (result.length !== requestBody.length) {
      console.log(result);
    }

    console.log(`Deleted ${result.length} event(s).`);
  } else {
    console.log('No events to delete.');
  }
}

function createEventDescription(event) {
  let finalText = '';
  // Get organizer Details
  if (event.organizer) {
    let displayName = "Unknown";
    if (event.organizer.self) displayName = "You";
    else if (event.organizer.displayName?.length) displayName = event.organizer.displayName
    finalText += `<b>Event Organizer</b>: ${displayName} (${event.organizer.email})\n`;
  }
  else finalText += 'Event Organizer: Unknown\n';

  // Get Conference Details
  if (event.conferenceData) {
    let confType = "Google Meets/Hangouts";
    if (event.conferenceData.conferenceSolution?.name) confType = event.conferenceData.conferenceSolution.name;

    finalText += `\n<b>Conference Type: ${confType}</b>\n`;
    event.conferenceData.entryPoints.forEach((ep) => {
      finalText += `&#x2022;  <b><a href="${ep.uri}">${ep.entryPointType ?? "Link"}</a></b>: ${ep.uri}`;
      if (ep.pin) finalText += ` (PIN: ${ep.pin})`;
      finalText += "\n"
    })
  }

  // Get Attendee Details
  if (event.attendees?.length) {
    finalText += '\n<b>Guests/Attendees</b>:\n';
    event.attendees.forEach((attendee) => {
      if (attendee.self) return;
      if (attendee.displayName?.length) finalText += `- ${attendee.displayName} (${attendee.email})\n`;
      else finalText += `&#x2022;  <a href="mailto:${attendee.email}">${attendee.email}</a>\n`;
      if (attendee.responseStatus == "accepted") {
        finalText += `   Invitation: <u>${attendee.responseStatus}</u>\n`
      }
      else {
        finalText += `   Invitation: ${attendee.responseStatus}\n`
      }
    });
  }

  // Get rest of description
  if (event.description && event.description.length) finalText += `\n<b>Description</b>:\n${event.description}`;
  return finalText;
}

// get bool result indicating if you accepted the invite
// return statuses:
//    -1 - invidation decline
//    0 - invitation not responded to
//    1 - invitation replied with. "maybe"
//    2 - invitation accepted
//    3 - not an invitation, accepted
function getInviteStatus(event) {
  if (!event.attendees?.length) return 3;
  for (let i = 0; i < event.attendees.length; i++) {
    let attendee = event.attendees[i]
    if (attendee.self && attendee.responseStatus == "declined") return -1;
    if (attendee.self && attendee.responseStatus == "accepted") return 2;
    if (attendee.self && attendee.responseStatus == "tentative") return 1;
  }

  return 0;
}

function copyEvents(startTime, endTime) {
  console.log(`--> copying events\n    from ${startTime}\n    to ${endTime}`);
  const requestBody = [];

  // Find events
  const events = Calendar.Events.list(CALENDAR_MERGE_FROM, {
    timeMin: startTime.toISOString(),
    timeMax: endTime.toISOString(),
    singleEvents: true,
    orderBy: 'startTime',
  });

  events.items.forEach((event) => {
    // Prevent copying "free" events.
    // if (event.transparency && event.transparency === 'transparent') {
    //   return;
    // }

    // Ignore events that have the following
    if (event.summary.match(CHARACTER_SYMBOL_IGNORE)) {
      return;
    }

    let isAcceptedIndex = 2;
    if (new Date(event.start.dateTime).valueOf() >= (new Date()).valueOf()) {
      isAcceptedIndex = getInviteStatus(event);
    }
    // skip if event is declined
    if (isAcceptedIndex === -1) return;

    let prefix = "";
    if (isAcceptedIndex === 0) prefix += "[RESPONSE REQUIRED] "
    if (isAcceptedIndex === 1) prefix += "[TENTATIVE] "
    prefix += CHARACTER_SYMBOL_DUPLICATE;

    // console.log(`## ${event.summary} ${event.start} -- ${isAcceptedIndex}`)

    let finalTransparency = 'opaque';
    if (event.transparency && event.transparency === 'transparent') finalTransparency  = 'transparent';
    if (isAcceptedIndex < 2) finalTransparency  = 'transparent';

    requestBody.push({
      method: 'POST',
      endpoint: `${ENDPOINT_BASE}/${CALENDAR_MERGE_INTO}/events`,
      requestBody: {
        summary: `${prefix}${event.summary}`,
        location: event.location,
        description: createEventDescription(event),
        start: event.start,
        end: event.end,
        colorId: isAcceptedIndex <= 0 ? ALERT_COLOR : event.colorId,
        eventType: 'default',
        transparency: finalTransparency,
        visibility: event.visibility,
      },
    });
  });

  if (requestBody && requestBody.length) {
    const result = new BatchRequest({
      batchPath: 'batch/calendar/v3',
      requests: requestBody,
    });

    if (result.length !== requestBody.length) {
      console.log(result);
    }

    console.log(`Created ${result.length} event(s).`);
  } else {
    console.log('No events to create.');
  }
}
