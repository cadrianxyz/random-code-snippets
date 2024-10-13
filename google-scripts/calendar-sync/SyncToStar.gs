// The 'SyncToStar' function should be able to be used across all different calendars.
// AGNOSTIC and CUSTOMIZABLE.
const ALERT_COLOR = 6; // test using "colorTest.gs"

function SyncToStar() {
  console.log('Synchronizing Events from Main Calendar to "Star" (Support) Calendar');
  const alpha = new Date();
  alpha.setHours(0, 0, 0, 0); // Midnight
  alpha.setDate(alpha.getDate() - SYNC_DAYS_IN_PAST);

  const omega = new Date();
  omega.setHours(0, 0, 0, 0); // Midnight
  omega.setDate(omega.getDate() + SYNC_DAYS_IN_FUTURE + 1);

  const delete_alpha = new Date(alpha);
  delete_alpha.setDate(delete_alpha.getDate() - DELETE_EXTRA_DAYS_IN_PAST);
  const delete_omega = new Date(omega);
  delete_omega.setDate(delete_omega.getDate() + DELETE_EXTRA_DAYS_IN_FUTURE);

  console.log(`-- deleting for ${delete_alpha.toLocaleDateString()} to ${delete_omega.toLocaleDateString()}`)
  console.log(`-- syncing for ${alpha.toLocaleDateString()} to ${omega.toLocaleDateString()}`)

  // do the delete

  deleteExistingEvents(delete_alpha, delete_omega);

  let startTime = new Date(alpha);
  let endTime = new Date(); // now

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
  const existingCalendar = CalendarApp.getCalendarById(CALENDAR_STAR);
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
    endpoint: `${ENDPOINT_BASE}/${CALENDAR_STAR}/events/${e
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
      console.log('Did not delete properly.... I think. See below.');
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

  // Get rest of description
  if (event.description && event.description.length) finalText += `\n<b>Description</b>:\n${event.description}`;
  return finalText;
}

const ALL_DAY_REGEX = new RegExp('^\d{4}\-(0[1-9]|1[012])\-(0[1-9]|[12][0-9]|3[01])$');

function copyEvents(startTime, endTime) {
  console.log(`--> copying events\n    from ${startTime}\n    to ${endTime}`);
  const requestBody = [];

  const calendar = CalendarApp.getCalendarById(CALENDAR_MAIN)

  // Find events
  const events = Calendar.Events.list(CALENDAR_MAIN, {
    timeMin: startTime.toISOString(),
    timeMax: endTime.toISOString(),
    singleEvents: true,
    orderBy: 'startTime',
  });

  events.items.forEach((event) => {
    // Prevent copying events that have the ignored character symbol
    if (event.summary && event.summary.match(CHARACTER_SYMBOL_IGNORE)) return;

    // Prevent copying events that match one of the ignored event types
    if (IGNORED_EVENT_TYPES.includes(event.eventType)) return;
    
    // Prevent copying "free" events if specified
    let isEventAvailabilityFree = false;
    if (event.transparency && event.transparency === 'transparent') isEventAvailabilityFree = true;
    if (isEventAvailabilityFree && IGNORE_FREE_EVENTS) return;

    // Prevent copying "private" events if specified
    let isEventPrivate = false;
    if (event.visibility === 'private' || event.visibility === 'confidential') isEventPrivate = true;
    if (isEventPrivate && IGNORE_PRIVATE_EVENTS) return;

    // Prevent copying "full day" events if specified
    const isAllDayEvent = event.start.date != null || ALL_DAY_REGEX.test(event.start.date);
    if (isAllDayEvent && IGNORE_ALLDAY_EVENTS) return;

    // Determine if event is an invitation from another calendar
    // Retreive an "event index" that we will use to identify the event later on
    let isAcceptedIndex = 2;
    isAcceptedIndex = getInviteStatus(event);

    // Prevent copying "DECLINED" events if specified
    if (isAcceptedIndex == -1 && IGNORE_DECLINED_EVENTS) return;
    // Prevent copying "NOT ACCEPTED" events if specified (need response)
    if (isAcceptedIndex == 0 && IGNORE_UNACCEPTED_EVENTS) return;
    // Prevent copying "TENTATIVE" events if specified
    if (isAcceptedIndex == 1 && IGNORE_TENTATIVE_EVENTS) return;

    // Create Prefix
    let prefix = "";
    prefix += CHARACTER_SYMBOL_DUPLICATE;

    if (isAcceptedIndex === -1) prefix += "[DECLINED] "
    else if (isAcceptedIndex === 0) prefix += "[RESPONSE REQUIRED] "
    else if (isAcceptedIndex === 1) prefix += "[TENTATIVE] "

    // console.log(`## ${event.summary} ${event.start} -- ${isAcceptedIndex}`)

    // Determine event transparency
    let finalTransparency = 'opaque';
    if (event.transparency) finalTransparency = event.transparency;
    if (isEventAvailabilityFree) finalTransparency  = 'transparent';
    
    if (isAcceptedIndex < MINIMUM_EVENT_ACCEPTANCE_TO_SHOW_BUSY) finalTransparency  = 'transparent';
    if (isAllDayEvent && FREE_UP_ALLDAY_EVENTS) finalTransparency  = 'transparent';

    requestBody.push({
      method: 'POST',
      endpoint: `${ENDPOINT_BASE}/${CALENDAR_STAR}/events`,
      requestBody: {
        summary: `${prefix}${event.summary}`,
        location: event.location,
        description: createEventDescription(event),
        start: event.start,
        end: event.end,
        colorId: isAcceptedIndex === 0 ? ALERT_COLOR : event.colorId,
        eventType: event.eventType,
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
