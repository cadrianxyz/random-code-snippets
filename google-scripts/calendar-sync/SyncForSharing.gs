// Heavily copied from https://github.com/karbassi/sync-multiple-google-calendars
// Helpful google calendar docs: https://developers.google.com/apps-script/reference/calendar/calendar-app

const SHARING__CALENDAR_DESTINATION_ID = '<CALENDAR_MERGE_FROM>@group.calendar.google.com';

const SHARING__SYNC_INTERVAL_DAYS = SYNC_INTERVAL_DAYS;
const SHARING__DELETE_INTERVAL_DAYS = DELETE_INTERVAL_DAYS;

const SHARING__SYNC_DAYS_IN_PAST = 6;
const SHARING__SYNC_DAYS_IN_FUTURE = 30;

const SHARING__BATCH_REQUEST_MAX = BATCH_REQUEST_MAX;

const SHARING__COPY_OPTIONS = {
  ignoreFreeEvents: true,
  ignorePrivateEvents: true,
  ignoreAllDayEvents: false,
  ignoreDeclinedEvent: true,
  ignoreUnacceptedEvents: true,
  ignoreTentativeEvents: false,
  minimumBusyCriteria: 2,
  freeUpAllDayEvents: true,
  hideLocation: false,
  hideDescription: true,
}

function SyncForSharing({
  daysPast,
  daysFutureStart,
  daysFutureEnd,
  calendarSources,
} = {}) {
  // sort out the variabes
  let _CALENDAR_SOURCES = CALENDARS_COMMITMENTS_SOURCES;
  if (calendarSources && calendarSources.length) _CALENDAR_SOURCES = calendarSources;

  let _DAYSTOSYNC_PAST_MAX = SYNC_DAYS_IN_PAST_MAX;
  if (daysPast != null) _DAYSTOSYNC_PAST_MAX = daysPast;
  else if (SHARING__SYNC_DAYS_IN_PAST != null && SHARING__SYNC_DAYS_IN_PAST < SYNC_DAYS_IN_PAST_MAX) _DAYSTOSYNC_PAST_MAX = SHARING__SYNC_DAYS_IN_PAST;

  let _DAYSTOSYNC_FUTURE_MAX = SYNC_DAYS_IN_FUTURE_MAX;
  if (daysFutureEnd != null) _DAYSTOSYNC_FUTURE_MAX = daysFutureEnd;
  else if (SHARING__SYNC_DAYS_IN_FUTURE != null && SHARING__SYNC_DAYS_IN_FUTURE < SYNC_DAYS_IN_FUTURE_MAX) _DAYSTOSYNC_FUTURE_MAX = SHARING__SYNC_DAYS_IN_FUTURE;

  // start
  console.log('Synchronizing Commitments from All Described Calendars');
  const copyRequests = [];

  let now = new Date();
  now.setHours(0, 0, 0, 0); // Midnight

  let alpha = new Date(now);
  if (daysFutureStart != null) alpha.setDate(alpha.getDate() + daysFutureStart);

  let omega = new Date(now);
  omega.setDate(omega.getDate() + _DAYSTOSYNC_FUTURE_MAX + 1);
  
  _CALENDAR_SOURCES.forEach((calendarDetails) => {
    const [calendarId, calendarMaxSyncDaysInPast, calendarMaxSyncDaysInFuture] = calendarDetails;

    // sort out past/future maxes
    let $daystoSyncPast = _DAYSTOSYNC_PAST_MAX
    if (calendarMaxSyncDaysInPast != null) $daystoSyncPast = calendarMaxSyncDaysInPast

    let $daystoSyncFuture = _DAYSTOSYNC_FUTURE_MAX
    if (calendarMaxSyncDaysInFuture != null) $daystoSyncFuture = calendarMaxSyncDaysInFuture

    // create sync objects for single calendar
    let localOmega = new Date(alpha);
    localOmega.setDate(localOmega.getDate() + $daystoSyncFuture + 1);

    let startTime = new Date(now);
    let endTime = new Date(now);

    // sync for past events first
    if ($daystoSyncPast > 0) {
      startTime.setDate(startTime.getDate() - $daystoSyncPast);
      const requests = createCommitmentCopyRequest(
        calendarId,
        SHARING__CALENDAR_DESTINATION_ID,
        startTime,
        endTime,
        SHARING__COPY_OPTIONS,
      );
      if (requests.length) copyRequests.push(...requests);
    }

    startTime = new Date(alpha);
    endTime = new Date(alpha);

    // sync future events in increments (spaces of time, to avoid errors in large bulk processing)
    while (endTime <= localOmega) {
      startTime = new Date(endTime);
      endTime.setDate(endTime.getDate() + SHARING__SYNC_INTERVAL_DAYS);

      if (endTime >= omega) {
        const requests = createCommitmentCopyRequest(
          calendarId,
          SHARING__CALENDAR_DESTINATION_ID,
          startTime,
          omega,
          SHARING__COPY_OPTIONS,
        );
        if (requests.length) copyRequests.push(...requests);
      }
      else {
        const requests = createCommitmentCopyRequest(
          calendarId,
          SHARING__CALENDAR_DESTINATION_ID,
          startTime,
          endTime,
          SHARING__COPY_OPTIONS,
        );
        if (requests.length) copyRequests.push(...requests);
      }
    }
  });

  console.log(`Generated ${copyRequests.length} separate copy requests`)

  let startTime = new Date(now);
  let endTime = new Date(now);

  // delete events between _DAYSTOSYNC_PAST_MAX and now
  if (_DAYSTOSYNC_PAST_MAX > 0) {
    startTime.setDate(now.getDate() - _DAYSTOSYNC_PAST_MAX);
    deleteExistingCommitmentEvents(SHARING__CALENDAR_DESTINATION_ID, startTime, endTime);
  }

  startTime = new Date(alpha);
  endTime = new Date(alpha);

  // delete events between alpha and omega
  while (endTime <= omega) {
    startTime = new Date(endTime);
    endTime.setDate(endTime.getDate() + SHARING__DELETE_INTERVAL_DAYS);

    if (endTime > omega) {
      deleteExistingCommitmentEvents(SHARING__CALENDAR_DESTINATION_ID, startTime, omega);
      break;
    }
    else {
      deleteExistingCommitmentEvents(SHARING__CALENDAR_DESTINATION_ID, startTime, endTime);
    }
  }

  let results = [];

  if (copyRequests.length == 0) {
    console.log('No events to create.');
    return;
  }

  const copyRequestBatches = [];

  for (let i = 0; i < copyRequests.length; i += SHARING__BATCH_REQUEST_MAX) {
    const chunk = copyRequests.slice(i, i + SHARING__BATCH_REQUEST_MAX);
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