function deleteExistingCommitmentEvents(calendarId, startTime, endTime) {
  const existingCalendar = CalendarApp.getCalendarById(calendarId);
  const existingEvents = existingCalendar
    .getEvents(startTime, endTime);

  const requestBody = existingEvents.map((e, i) => ({
    method: 'DELETE',
    endpoint: `${ENDPOINT_BASE}/${calendarId}/events/${e
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
      console.log('Did not delete properly.... I think. See below.');
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

// regex values for checking event summary (title)
const EVENT_SUMMARY_PREFIX__PRODUCTIVE_TIME = '[P]';
const EVENT_SUMMARY_PREFIX__WORK_FOCUS = '[WF]';
const EVENT_SUMMARY_PREFIX__MEETING_BLOCK = '[MB]';
const EVENT_SUMMARY_REGEX__DANCE_GROUP = new RegExp(
  '((TOA S[0-9])|(WW[A-Z] S[0-9])) .*'
);
const EVENT_SUMMARY_REGEX__DANCE_CLASS = new RegExp(
  '~(HDC|BGM|TOA|Yunik|IONE|SNO|CD)( \(.*\))? - .*'
);

function getEventSummary(summary, isAccepted) {
  let finalSummary = summary;
  let finalSummaryPrefix = '';

  // if event is declined
  if (isAccepted == -1) {
    finalSummaryPrefix = '[DECLINED]';
  }
  // if event is not accepted
  else if (isAccepted == 0) {
    finalSummaryPrefix = '[NEED RESPONSE]';
  }
  // if event is a "maybe"
  else if (isAccepted == 1) {
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

const ALL_DAY_REGEX = new RegExp('^\d{4}\-(0[1-9]|1[012])\-(0[1-9]|[12][0-9]|3[01])$');

function createCommitmentCopyRequest(sourceId, destinationId, startTime, endTime, options = {}) {
  // sort out options
  let _IGNORE_FREE_EVENTS = COMMITMENTS_IGNORE_FREE_EVENTS;
  if (options.ignoreFreeEvents != null) _IGNORE_FREE_EVENTS = options.ignoreFreeEvents;
  let _IGNORE_PRIVATE_EVENTS = COMMITMENTS_IGNORE_PRIVATE_EVENTS;
  if (options.ignorePrivateEvents != null) _IGNORE_PRIVATE_EVENTS = options.ignorePrivateEvents;
  let _IGNORE_ALLDAY_EVENTS = COMMITMENTS_IGNORE_ALLDAY_EVENTS;
  if (options.ignoreAllDayEvents != null) _IGNORE_ALLDAY_EVENTS = options.ignoreAllDayEvents;
  let _IGNORE_DECLINED_EVENTS = COMMITMENTS_IGNORE_DECLINED_EVENTS;
  if (options.ignoreDeclinedEvents != null) _IGNORE_DECLINED_EVENTS = options.ignoreDeclinedEvents;
  let _IGNORE_UNACCEPTED_EVENTS = COMMITMENTS_IGNORE_UNACCEPTED_EVENTS;
  if (options.ignoreUnacceptedEvents != null) _IGNORE_UNACCEPTED_EVENTS = options.ignoreUnacceptedEvents;
  let _IGNORE_TENTATIVE_EVENTS = COMMITMENTS_IGNORE_TENTATIVE_EVENTS;
  if (options.ignoreTentativeEvents != null) _IGNORE_TENTATIVE_EVENTS = options.ignoreTentativeEvents;

  let _COLOR_OVERWRITE = null;
  if (options.eventColor != null) _COLOR_OVERWRITE = options.eventColor;
  else if (COPIED_COMMITMENTS_COLOR_ID != null) _COLOR_OVERWRITE = COPIED_COMMITMENTS_COLOR_ID;

  let _MINIMUM_BUSY_CRITERIA = MINIMUM_EVENT_ACCEPTANCE_TO_SHOW_BUSY;
  if (options.minimumBusyCriteria != null) _MINIMUM_BUSY_CRITERIA = options.minimumBusyCriteria

  let _FREE_UP_ALLDAY_EVENTS = SHOW_ALL_DAY_EVENTS_AS_FREE;
  if (options.freeUpAllDayEvents != null) _FREE_UP_ALLDAY_EVENTS = options.freeUpAllDayEvents;

  let _HIDE_DESCRIPTION = false;
  if (options.hideDescription != null) _HIDE_DESCRIPTION = options.hideDescription;

  let _HIDE_LOCATION = false;
  if (options.hideLocation != null) _HIDE_LOCATION = options.hideLocation;

  // start creation
  console.log(`--> creating copy requests\n    (${sourceId})\n    from ${startTime}\n    to ${endTime}`);
  const requestBody = [];

  // Find events
  const events = Calendar.Events.list(sourceId, {
    timeMin: startTime.toISOString(),
    timeMax: endTime.toISOString(),
    singleEvents: true,
    orderBy: 'startTime',
  });

  events.items.forEach((event) => {
    // Prevent copying events that match one of the ignored event types
    if (IGNORED_EVENT_TYPES.includes(event.eventType)) return;

    // Prevent copying "free" events if specified
    let isEventAvailabilityFree = false;
    if (event.transparency && event.transparency === 'transparent') isEventAvailabilityFree = true;
    if (isEventAvailabilityFree && _IGNORE_FREE_EVENTS) return;

    // Prevent copying "private" events if specified
    let isEventPrivate = false;
    if (event.visibility === 'private' || event.visibility === 'confidential') isEventPrivate = true;
    if (isEventPrivate && _IGNORE_PRIVATE_EVENTS) return;

    // Prevent copying "full day" events if specified
    const isAllDayEvent = event.start.date != null || ALL_DAY_REGEX.test(event.start.date);
    if (isAllDayEvent && _IGNORE_ALLDAY_EVENTS) return;

    // Determine if event is an invitation from another calendar
    // Retreive an "event index" that we will use to identify the event later on
    let isAcceptedIndex = 0;
    isAcceptedIndex = getInviteStatus(event);

    // Prevent copying "DECLINED" events if specified
    if (isAcceptedIndex == -1 && _IGNORE_DECLINED_EVENTS) return;
    // Prevent copying "NOT ACCEPTED" events if specified (need response)
    if (isAcceptedIndex == 0 && _IGNORE_UNACCEPTED_EVENTS) return;
    // Prevent copying "TENTATIVE" events if specified
    if (isAcceptedIndex == 1 && _IGNORE_TENTATIVE_EVENTS) return;

    const eventSummary = getEventSummary(event.summary, isAcceptedIndex);

    let finalTransparency = 'opaque';
    if (event.transparency) finalTransparency = event.transparency;
    if (isEventAvailabilityFree) finalTransparency  = 'transparent';

    if (isAcceptedIndex < _MINIMUM_BUSY_CRITERIA) finalTransparency  = 'transparent';
    if (isAllDayEvent && _FREE_UP_ALLDAY_EVENTS) finalTransparency  = 'transparent';

    requestBody.push({
      method: 'POST',
      endpoint: `${ENDPOINT_BASE}/${destinationId}/events`,
      requestBody: {
        summary: eventSummary,
        location: _HIDE_LOCATION ? null : event.location,
        description: _HIDE_DESCRIPTION ? 'Compiled using a custom script.\nIf broken please let me know!' : event.description,
        start: event.start,
        end: event.end,
        colorId: _COLOR_OVERWRITE ?? event.colorId,
        eventType: 'default',
        transparency: finalTransparency,
        visibility: event.visibility,
      },
    });
  });

  return requestBody;
}
