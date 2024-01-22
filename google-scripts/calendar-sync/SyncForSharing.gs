// Heavily copied from https://github.com/karbassi/sync-multiple-google-calendars
// Helpful google calendar docs: https://developers.google.com/apps-script/reference/calendar/calendar-app

// copy all events from the `CALENDARS_COMMITMENTS_SOURCES` calendar to the `CALENDAR_CALENDAR_COMMITMENTS_DESTINATION` calendar

const BATCH_REQUEST_MAX = 50;
const DELETE_INTERVAL_DAYS = 50;

const SYNC_INTERVAL_DAYS = 40;
const COMMITMENTS_SYNC_DAYS_IN_PAST = 7;
const SYNC_DAYS_IN_FUTURE_MAX = 180;

// calendar id, followed by SYNC_DAYS_IN_PAST and SYNC_DAYS_IN_FUTURE
const CALENDARS_COMMITMENTS_SOURCES = [
  ['<ENTER_HERE>@group.calendar.google.com', SYNC_DAYS_IN_FUTURE_MAX],
  // Dev Time Blocking
  ['<ENTER_HERE>@group.calendar.google.com', 14],
  // events - cadrian*
  ['<ENTER_HERE>@group.calendar.google.com', SYNC_DAYS_IN_FUTURE_MAX],
];
const CALENDAR_COMMITMENTS_DESTINATION = '<ENTER_HERE>@group.calendar.google.com';

// choose type of events to ignore
const COMMITMENTS_IGNORE_ALLDAY_EVENTS = false;
const COMMITMENTS_IGNORE_DECLINED_EVENTS = true;
const COMMITMENTS_IGNORE_UNACCEPTED_EVENTS = true;
const COMMITMENTS_IGNORE_TENTATIVE_EVENTS = false;

// whether to use the default color of the calendar or overwrite the color
const COPIED_COMMITMENTS_COLOR_OVERWRITE = true;
const COPIED_COMMITMENTS_COLOR_ID = 8; // test using "colorTest.gs"

// regex values for checking event summary (title)
const EVENT_SUMMARY_PREFIX__PRODUCTIVE_TIME = '[P]';
const EVENT_SUMMARY_PREFIX__WORK_FOCUS = '[WF]';
const EVENT_SUMMARY_PREFIX__MEETING_BLOCK = '[MB]';
const EVENT_SUMMARY_REGEX__DANCE_GROUP = new RegExp('((TOA S[0-9])|(WW[A-Z] S[0-9])) *');
const EVENT_SUMMARY_REGEX__DANCE_CLASS = new RegExp('(HDC|BGM|TOA|Yunik|SNORTH) - *');

function SyncForSharing() {
  console.log('Synchronizing Commitments from All Described Calendars');
  const copyRequests = [];

  let alpha = new Date();
  alpha.setHours(0, 0, 0, 0); // Midnight

  let omega = new Date(alpha);
  omega.setDate(omega.getDate() + SYNC_DAYS_IN_FUTURE_MAX + 1);
  
  CALENDARS_COMMITMENTS_SOURCES.forEach((calendarDetails) => {
    const [calendarId, syncDaysInFuture] = calendarDetails;

    let localOmega = new Date(alpha);
    localOmega.setDate(localOmega.getDate() + syncDaysInFuture + 1);

    let startTime = new Date(alpha);
    let endTime = new Date(alpha);

    // sync for past events first
    if (COMMITMENTS_SYNC_DAYS_IN_PAST > 0) {
      startTime.setDate(startTime.getDate() - COMMITMENTS_SYNC_DAYS_IN_PAST);
      const requests = createCommitmentCopyRequest(startTime, endTime, calendarId);
      if (requests.length) copyRequests.push(...requests);
    }

    // sync future events in increments (spaces of time, to avoid errors in large bulk processing)
    while (endTime <= localOmega) {
      startTime = new Date(endTime);
      endTime.setDate(endTime.getDate() + SYNC_INTERVAL_DAYS);

      if (endTime > omega) {
        const requests = createCommitmentCopyRequest(startTime, omega, calendarId);
        if (requests.length) copyRequests.push(...requests);
      }
      else {
        const requests = createCommitmentCopyRequest(startTime, endTime, calendarId);
        if (requests.length) copyRequests.push(...requests);
      }
    }
  });

  console.log(`Generated ${copyRequests.length} separate copy requests`)

  let startTime = new Date(alpha);
  let endTime = new Date(alpha);

  // delete past events first
  if (COMMITMENTS_SYNC_DAYS_IN_PAST > 0) {
    startTime.setDate(startTime.getDate() - COMMITMENTS_SYNC_DAYS_IN_PAST);
    deleteExistingCommitmentEvents(startTime, endTime);
  }

  while (endTime <= omega) {
    startTime = new Date(endTime);
    endTime.setDate(endTime.getDate() + DELETE_INTERVAL_DAYS);

    if (endTime > omega) {
      deleteExistingCommitmentEvents(startTime, omega);
    }
    else {
      deleteExistingCommitmentEvents(startTime, endTime);
    }
  }

  let results = [];

  if (copyRequests.length == 0) {
    console.log('No events to create.');
    return;
  }

  const copyRequestBatches = [];

  for (let i = 0; i < copyRequests.length; i += BATCH_REQUEST_MAX) {
    const chunk = copyRequests.slice(i, i + BATCH_REQUEST_MAX);
    copyRequestBatches.push(chunk);
  }

  copyRequestBatches.forEach((cr) => {
    const result = new BatchRequest({
      batchPath: 'batch/calendar/v3',
      requests: cr,
    });

    results.push(...result);
  });

  if (results.length !== copyRequests.length) {
    console.log(results);
  }

  console.log(`Created ${results.length} event(s) in ${copyRequestBatches.length} batches/chunks`);
}

function deleteExistingCommitmentEvents(startTime, endTime) {
  const existingCalendar = CalendarApp.getCalendarById(CALENDAR_COMMITMENTS_DESTINATION);
  const existingEvents = existingCalendar
    .getEvents(startTime, endTime);

  const requestBody = existingEvents.map((e, i) => ({
    method: 'DELETE',
    endpoint: `${ENDPOINT_BASE}/${CALENDAR_COMMITMENTS_DESTINATION}/events/${e
      .getId()
      .replace('@google.com', '')}`,
  }));

  if (requestBody && requestBody.length) {
    const result = new BatchRequest({
      useFetchAll: false,
      batchPath: 'batch/calendar/v3',
      requests: requestBody,
    });

    if (result.length !== requestBody.length) {
      console.log(result);
    }

    console.log(`Deleted ${result.length} event(s)\n    from ${startTime}\n    to ${endTime}`);
  } else {
    console.log(`No events to delete\n    from ${startTime}\n    to ${endTime}`);
  }
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
    let attendee = event.attendees[i];
    if (!attendee.self) continue;

    if (attendee.responseStatus == 'accepted') {
      return 2;
    }
    else if (attendee.responseStatus == 'tentative') {
      return 1;
    }
    else if (attendee.responseStatus == 'declined') {
      return -1;
    }

    return 0;
  }

  return 1;
}

function getEventSummary(summary, isAccepted) {
  // if event is declined/needs action (fallback)
  if (isAccepted <= -1) return "";

  let finalSummary = summary;
  let finalSummaryPrefix = '';

  // if event is a "maybe"
  if (isAccepted == 1) {
    finalSummaryPrefix = '[MAYBE]';
  }
  
  if (summary.includes(EVENT_SUMMARY_PREFIX__PRODUCTIVE_TIME)) {
    finalSummary = 'Productive Time';
  }

  if (summary.includes(EVENT_SUMMARY_PREFIX__WORK_FOCUS)) {
    finalSummary = 'Work Focus';
  }

  if (summary.includes(EVENT_SUMMARY_PREFIX__MEETING_BLOCK)) {
    finalSummary = 'Block for Work Meetings';
  }

  if (EVENT_SUMMARY_REGEX__DANCE_GROUP.test(summary)) {
    finalSummary = `DANCE - TRAIN`;
  }

  if (EVENT_SUMMARY_REGEX__DANCE_CLASS.test(summary)) {
    finalSummary = `DANCE - CLASS`;
  }

  if (finalSummaryPrefix) return `${finalSummaryPrefix} ${finalSummary}`;
  return finalSummary;
}

function createCommitmentCopyRequest(startTime, endTime, id) {
  console.log(`--> creating copy requests\n    (${id})\n    from ${startTime}\n    to ${endTime}`);
  const requestBody = [];

  // Find events
  const events = Calendar.Events.list(id, {
    timeMin: startTime.toISOString(),
    timeMax: endTime.toISOString(),
    singleEvents: true,
    orderBy: 'startTime',
  });

  events.items.forEach((event) => {
    let isEventAvailabilityFree = false;
    if (event.transparency && event.transparency === 'transparent') isEventAvailabilityFree = true;

    // Prevent copying "free" events
    if (isEventAvailabilityFree) return;

    // Prevent copying "private" events
    if (event.visibility === 'private' || event.visibility === 'confidential') return;

    // Prevent copying "full day" events
    const isAllDayEvent = event.start.date != null;
    if (isAllDayEvent && COMMITMENTS_IGNORE_ALLDAY_EVENTS) return;

    // Determine if event is an invite
    // If an invite, use following logic:
    let isAcceptedIndex = 0;
    isAcceptedIndex = getInviteStatus(event);

    //   ignore if declined
    if (isAcceptedIndex == -1 && COMMITMENTS_IGNORE_DECLINED_EVENTS)  return;
    //   ignore if not accepted (need action still)
    if (isAcceptedIndex == 0 && COMMITMENTS_IGNORE_UNACCEPTED_EVENTS)  return;
    //   ignore if tentative (maybe)
    if (isAcceptedIndex == 1 && COMMITMENTS_IGNORE_TENTATIVE_EVENTS)  return;

    const eventSummary = getEventSummary(event.summary, isAcceptedIndex);

    let finalTransparency = 'opaque';
    if (isEventAvailabilityFree) finalTransparency  = 'transparent';
    if (isAcceptedIndex < 2) finalTransparency  = 'transparent';

    requestBody.push({
      method: 'POST',
      endpoint: `${ENDPOINT_BASE}/${CALENDAR_COMMITMENTS_DESTINATION}/events`,
      requestBody: {
        summary: eventSummary,
        // location: event.location,
        description: 'Compiled using a custom script.\nIf broken please let me know!',
        start: event.start,
        end: event.end,
        colorId: COPIED_COMMITMENTS_COLOR_OVERWRITE ? COPIED_COMMITMENTS_COLOR_ID : event.colorId,
        eventType: 'default',
        transparency: finalTransparency,
        visibility: event.visibility,
      },
    });
  });

  return requestBody;
}
