// REQUIRED CONSTANTS

const ENDPOINT_BASE = 'https://www.googleapis.com/calendar/v3/calendars';

// DEFAULT CONSTANTS (FALLBACKS)

const BATCH_REQUEST_MAX = 50;
const DELETE_INTERVAL_DAYS = 50;
const SYNC_INTERVAL_DAYS = 40;

const SYNC_DAYS_IN_PAST_MAX = 7;
const SYNC_DAYS_IN_FUTURE_MAX = 180;

// choose type of events to ignore
const COMMITMENTS_IGNORE_FREE_EVENTS = true;
const COMMITMENTS_IGNORE_PRIVATE_EVENTS = true;
const COMMITMENTS_IGNORE_ALLDAY_EVENTS = false;

const COMMITMENTS_IGNORE_DECLINED_EVENTS = true;
const COMMITMENTS_IGNORE_UNACCEPTED_EVENTS = true;
const COMMITMENTS_IGNORE_TENTATIVE_EVENTS = false;

const IGNORED_EVENT_TYPES = ['workingLocation', 'birthday', 'outOfOffice']

// minimum `acceptedIndex` to show busy on the destination calendar
const MINIMUM_EVENT_ACCEPTANCE_TO_SHOW_BUSY = 2;

// should show all day events as "free"
const SHOW_ALL_DAY_EVENTS_AS_FREE = true;

// whether to use the default color of the calendar or overwrite the color, null to not overwrite
const COPIED_COMMITMENTS_COLOR_ID = 8; // test using "colorTest.gs"

// calendar id, followed by maximum for SYNC_DAYS_IN_PAST and SYNC_DAYS_IN_FUTURE
const CALENDARS_COMMITMENTS_SOURCES = [
  ['<ENTER_HERE>@group.calendar.google.com', SYNC_DAYS_IN_PAST, SYNC_DAYS_IN_FUTURE_MAX],
];