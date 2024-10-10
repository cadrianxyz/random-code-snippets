// Heavily copied from https://github.com/karbassi/sync-multiple-google-calendars
// Helpful google calendar docs: https://developers.google.com/apps-script/reference/calendar/calendar-app

const CALENDAR_MAIN = '<CALENDAR_MERGE_FROM>@group.calendar.google.com';
const CALENDAR_STAR = '<CALENDAR_MERGE_INTO>@group.calendar.google.com';

const SYNC_INTERVAL_DAYS = 40;
const SYNC_DAYS_IN_PAST = 7;
const SYNC_DAYS_IN_FUTURE = 180;

const SYNC_BUSY_DAYS_IN_PAST = 7;
const SYNC_BUSY_DAYS_IN_FUTURE = 90;

const IGNORED_EVENT_TYPES = ['workingLocation', 'birthday', 'outOfOffice']
const IGNORE_FREE_EVENTS = false;
const IGNORE_PRIVATE_EVENTS = true;
const IGNORE_ALLDAY_EVENTS = false;
const IGNORE_DECLINED_EVENTS = true;
const IGNORE_UNACCEPTED_EVENTS = false;
const IGNORE_TENTATIVE_EVENTS = false;
const FREE_UP_ALLDAY_EVENTS = true;

// Unique character to use to prefix copied events.
// This character will later be used to identify events to delete.
// Useful symbol: https://unicode-table.com/en/200B/
const CHARACTER_SYMBOL_DUPLICATE = '';
// Regex to use to identify events that should be ignored (not copied)
const CHARACTER_SYMBOL_IGNORE = /^.*?(busy( \[.*\])?$)|(personal commitment$)|(unconfirmed commitment$)|(flight$)/gi;

const MINIMUM_EVENT_ACCEPTANCE_TO_SHOW_BUSY = 1;

function runExecution_cadrianDev() {
  SyncToStar()
}