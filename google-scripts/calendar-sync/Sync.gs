// Helpful google calendar docs: https://developers.google.com/apps-script/reference/calendar/calendar-app

const CALENDAR_MERGE_FROM = 'cadrian.dev@gmail.com';
const CALENDAR_MERGE_INTO = 'CALENDAR_ID'
const ENDPOINT_BASE = 'https://www.googleapis.com/calendar/v3/calendars';

const SYNC_DAYS_IN_PAST = 7;
const SYNC_DAYS_IN_FUTURE = 30;

// Unique characters to use in event deletion. For identifying duplicates, use https://unicode-table.com/en/200B/ if needed.
const CHARACTER_SYMBOL_DUPLICATE = '';
const CHARACTER_SYMBOL_IGNORE = /^.*(personal commitment$)|(flight$)/gi;
// Unique characters to use in event copying

const ERROR_COLOR_ID = 11;
// test using "colorTest.gs"


function Sync() {
  const startTime = new Date();
  startTime.setHours(0, 0, 0, 0); // Midnight
  startTime.setDate(startTime.getDate() - SYNC_DAYS_IN_PAST);

  const endTime = new Date();
  endTime.setHours(0, 0, 0, 0); // Midnight
  endTime.setDate(endTime.getDate() + SYNC_DAYS_IN_FUTURE + 1);

  deleteExistingEvents(startTime, endTime);
  copyEvents(startTime, endTime);
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
    // Refer to implementation in https://github.com/tanaikech/BatchRequest
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
function getInviteStatus(event) {
  if (!event.attendees?.length) return true;
  event.attendees.forEach((attendee) => {
    if (attendee.self) return attendee.responseStatus == "accepted";
  });

  return false;
}

function copyEvents(startTime, endTime) {
  const requestBody = [];
  const calendarToCopy = CalendarApp.getCalendarById(CALENDAR_MERGE_FROM);

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

    console.log(event)

    let isNotAccepted = !getInviteStatus(event);
    let prefix = "";
    if (isNotAccepted) prefix += "[RESPONSE REQUIRED] "
    prefix += CHARACTER_SYMBOL_DUPLICATE;

    requestBody.push({
      method: 'POST',
      endpoint: `${ENDPOINT_BASE}/${CALENDAR_MERGE_INTO}/events`,
      requestBody: {
        summary: `${prefix}${event.summary}`,
        location: event.location,
        description: createEventDescription(event),
        start: event.start,
        end: event.end,
        colorId: isNotAccepted ? ERROR_COLOR_ID : event.colorId,
        eventType: 'default',

      },
      // requestBody: { ...event },
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
