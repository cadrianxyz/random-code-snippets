/**
 * @OnlyCurrentDoc
 *
 * This Google Apps Script synchronizes events between two Google Calendars.
 * It listens for changes (create, update, delete) in a source calendar
 * and replicates them to a destination calendar.
 *
 * "On change" trigger
 * Go to Triggers (clock icon on the left sidebar in Apps Script editor) -> Add Trigger.
 * - Choose which function to run: synchronizeCalendarsAdvanced
 * - Choose which deployment should run: Head
 * - Select event source: From calendar
 * - Select calendar: (Choose your source calendar here)
 * - Select event type: On change
 *
 * This script uses Script Properties to store a mapping between original event IDs
 * and the IDs of their synchronized counterparts. This is crucial for handling updates and deletions.
 */

// --- Configuration ---
// Replace these with your actual calendar IDs.
// You can find these in Google Calendar settings for each calendar.
const MY_EMAIL = 'ENTER_EMAIL_HERE';
const SOURCE_CALENDAR_ID = 'ENTER_SOURCE_CALENDAR_HERE';
const DESTINATION_CALENDAR_ID = 'ENTER_DESTINATION_CALENDAR_HERE';

// Property key for storing event ID mappings
const EVENT_MAP_PROPERTY_KEY = 'eventSyncMapv1';
const NEXT_SYNC_TOKEN_PROPERTY_KEY = 'eventSyncMapv1Token'; // New key for storing sync token

const MONTHS_AHEAD = 4;

/**
 * Main function to synchronize calendars.
 * This function is designed to be triggered by a Google Calendar "On change" event.
 * @param {GoogleAppsScript.Calendar.CalendarEvent} e The event object passed by the trigger.
 */

function synchronizeCalendarsAdvanced(e) {
  // Ensure the trigger event is from the intended source calendar
  if (e.calendarId !== SOURCE_CALENDAR_ID) {
    console.warn(`Event not from the source calendar but from ${e.calendarId}. Skipping.`);
    return;
  }

  const sourceCalendar = CalendarApp.getCalendarById(SOURCE_CALENDAR_ID);
  const destinationCalendar = CalendarApp.getCalendarById(DESTINATION_CALENDAR_ID);

  if (!sourceCalendar) {
    console.error(`Source calendar not found. Check IDs: ${sourceCalendar}`);
    return;
  }
  if (!destinationCalendar) {
    console.error(`Destination calendar not found. Check IDs: ${destinationCalendar}`);
    return;
  }

  const nextSyncToken = getNextSyncToken();

  console.info(`Synchronization triggered for calendar: ${e.calendarId}, Trigger UID: ${e.triggerUid}, Auth Mode: ${e.authMode}`);

  if (!nextSyncToken) {
    console.warn('🗝️ No nextSyncToken found. Performing initial full sync. Please run setupInitialSync() once, or it will be triggered now.');
    setupInitialSync(); // Fallback: If no token, perform initial sync
    return; // Exit this execution, as setupInitialSync will handle the sync
  }

  incrementalSync(nextSyncToken, sourceCalendar, destinationCalendar);
}

function shouldSkipEvent(eventItem) {
  if (eventItem.summary && eventItem.summary.toLowerCase().match(CHARACTER_SYMBOL_IGNORE)) {
    console.log(`  ~~ Skipping event "${eventItem.summary}" due to ignored title prefix.`);
    return true;
  }

  // Skip if eventType is in IGNORED_EVENT_TYPES
  if (eventItem.eventType && IGNORED_EVENT_TYPES.includes(eventItem.eventType)) {
    console.log(`  ~~ Skipping event "${eventItem.summary}" (Type: ${eventItem.eventType}) due to ignored event type.`);
    return true;
  }
  return false;
}

function incrementalSync(syncToken, sourceCalendar, destinationCalendar) {
  console.info('Starting incremental synchronization...');

  // Load the existing event ID map
  let eventMap = getEventMap();

  // tokens
  let pageToken = null;
  let newSyncToken = null; // To store the latest sync token from all pages

  try {
    do {
      // Perform incremental sync using the Calendar Advanced Service
      const response = Calendar.Events.list(SOURCE_CALENDAR_ID, {
        syncToken: syncToken,
        showDeleted: true,
        singleEvents: true, // Treat recurring event instances as individual events
        maxResults: 2500, // Adjust as needed, max is 2500
        pageToken: pageToken // For pagination
      });

      console.info(`[Incremental] Obtained ${response.items.length} events to sync`);

      if (response.items) {
        for (const item of response.items) {
          // Check if the event should be skipped before processing
          if (shouldSkipEvent(item)) {
            continue; // Skip to the next item
          }

          const sourceEventId = item.id;
          const destinationEventId = eventMap[sourceEventId];

          if (item.status === 'cancelled') {
            // Event was deleted or cancelled in the source calendar
            console.log(`  > Detected DELETE for event ${sourceEventId} ("${item.summary}")`);
            handleDelete(sourceEventId, destinationCalendar, eventMap);
          } else if (!destinationEventId) {
            // Event is new (not in our map)
            console.log(`  > Detected CREATE for event ${sourceEventId} ("${item.summary}")`);
            handleCreate(sourceEventId, sourceCalendar, destinationCalendar, eventMap);
          } else {
            // Event exists in our map, so it's an update
            console.log(`  > Detected UPDATE for event ${sourceEventId} ("${item.summary}")`);
            handleUpdate(sourceEventId, sourceCalendar, destinationCalendar, eventMap);
          }
        }
      }

      pageToken = response.nextPageToken;
      // Always store the nextSyncToken from the last successful response
      if (response.nextSyncToken) {
        newSyncToken = response.nextSyncToken;
      }

    } while (pageToken); // Continue looping if there are more pages

    // Store the new sync token after processing all pages
    if (newSyncToken) {
      saveNextSyncToken(newSyncToken);
      console.info('[Incremental] 🗝️ New nextSyncToken saved.');
    } else {
      console.warn('[Incremental] 🗝️ No new nextSyncToken received after incremental sync. This might indicate no changes or an issue.');
    }

  } catch (error) {
    console.error(`[Incremental] Error during: ${error.message}`);
    throw error;
  } finally {
    // Ensure eventMap is saved after all operations (creations, updates, deletions might modify it)
    saveEventMap(eventMap);
    console.info('[Incremental] Synchronization complete and event map saved!');
  }
}

/**
 * Performs an initial full synchronization of the source calendar to the destination.
 * This function should be run ONCE manually to establish the initial state and sync token.
 */
function setupInitialSync() {
  console.info('Starting initial full synchronization...');
  const sourceCalendar = CalendarApp.getCalendarById(SOURCE_CALENDAR_ID);
  const destinationCalendar = CalendarApp.getCalendarById(DESTINATION_CALENDAR_ID);

  if (!sourceCalendar) {
    console.error(`[Initial] Source calendar not found. Check IDs: ${sourceCalendar}`);
    return;
  }
  if (!destinationCalendar) {
    console.error(`[Initial] Destination calendar not found. Check IDs: ${destinationCalendar}`);
    return;
  }

  // Clear existing sync data before a full sync
  clearAllSyncData();
  let eventMap = getEventMap(); // Re-initialize after clearing

  // Fetch all events from the source calendar using Calendar.Events.list
  // Setting timeMin/timeMax for initial sync to get a relevant range.
  const now = new Date();
  const fetchStartDate = new Date();
  fetchStartDate.setDate(now.getDate() - 30); // Get events from the last 30 days

  const fetchEndDate = new Date();
  fetchEndDate.setMonth(now.getMonth + MONTHS_AHEAD); // Get events up to x months in the future

  let pageToken = null;
  let finalNextSyncToken = null; // To store the nextSyncToken from the very last page

  do {
    const response = Calendar.Events.list(SOURCE_CALENDAR_ID, {
      timeMin: fetchStartDate.toISOString(),
      timeMax: fetchEndDate.toISOString(),
      singleEvents: true, // Treat recurring event instances as individual events
      showDeleted: false, // Don't need deleted events for initial sync
      pageToken: pageToken,
      maxResults: 2500
    });

    if (response.items) {
      console.info(`[Initial] Obtained ${response.items.length} events to sync`);

      for (const item of response.items) {
        // Check if the event should be skipped before processing
        if (shouldSkipEvent(item)) {
          // No need to delete from destination during initial sync, as it's assumed empty or being reset
          continue; // Skip to the next item
        }

        const sourceEventId = item.id;
        // For initial sync, always treat as a creation
        try {
          const sourceEvent = sourceCalendar.getEventById(sourceEventId); // Get full event object
          if (sourceEvent) {
            // Check if event already exists in destination (e.g., from a previous partial sync)
            if (!eventMap[sourceEventId]) {
              const destinationEvent = destinationCalendar.createEvent(
                sourceEvent.getTitle(),
                sourceEvent.getStartTime(),
                sourceEvent.getEndTime(),
                {
                  description: createEventDesc(sourceEvent),
                  location: sourceEvent.getLocation(),
                }
              );

              applyEventStatusFormatting(sourceEvent, destinationEvent);
              eventMap[sourceEventId] = destinationEvent.getId();
              console.log(`[Initial] ✅ Created event ${sourceEventId} ("${sourceEvent.getTitle()}")`);
            } else {
              // If it already exists, treat as an update to ensure formatting is applied
              console.log(`[Initial] ✅ Updating mapped event ${sourceEventId} ("${sourceEvent.getTitle()}")`);
              handleUpdate(sourceEventId, sourceCalendar, destinationCalendar, eventMap);
            }
          } else {
            console.warn(`[Initial] Could not retrieve full source event object for ID ${sourceEventId}. Skipping.`);
          }
        } catch (error) {
          console.error(`[Initial] Failed to process event ${sourceEventId}: ${error.message}`);
        }
      }
    }

    pageToken = response.nextPageToken;
    // Store the nextSyncToken from the current page, it will be overwritten by subsequent pages
    // until the last page, which will have the final token.
    if (response.nextSyncToken) {
      finalNextSyncToken = response.nextSyncToken;
    }

  } while (pageToken);

  // Store the final nextSyncToken after all pages have been processed
  if (finalNextSyncToken) {
    saveNextSyncToken(finalNextSyncToken);
    console.info(`[Initial] Synchronization complete. 🗝️ Initial nextSyncToken saved: ${finalNextSyncToken}`);
  } else {
    console.warn('[Initial] Synchronization completed but no nextSyncToken was returned. Incremental syncs might not work.');
  }

  saveEventMap(eventMap);
}


function createEventDesc(event) {
  let finalText = '';

  // Indicate if recurring
  if (event.isRecurringEvent()) {
    finalText += '<b>🔄 RECURRING EVENT 🔄</b>\n\n'
  }

  // Get organizer Details
  const organizers = event.getCreators();
  if (organizers?.length) {
    const organizersText = organizers.map((o) => {
      if (o === MY_EMAIL) return 'You';
      else return o;
    }).join(', ');
    finalText += `<b>Event Creator(s)</b>: ${organizersText})\n`;
  }
  else finalText += '<b>Event Creator</b>: Unknown\n';

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
  const description = event.getDescription();
  if (description && description.length) finalText += `\n<b>Description</b>:\n${description}\n`;

  // Get Guests
  const guests = event.getGuestList(true);
  const separatedGuests = guests.reduce((obj, g) => {
    const status = g.getGuestStatus();
    if (status === CalendarApp.GuestStatus.YES) {
      obj.attending.push(g.getEmail());
    }
    else if (status === CalendarApp.GuestStatus.MAYBE) {
      obj.tentative.push(g.getEmail());
    }
    else if (status === CalendarApp.GuestStatus.NO) {
      obj.declined.push(g.getEmail());
    }
    else {
      obj.unresponsive.push(g.getEmail());
    }
    return obj;
  }, {
    attending: [],
    tentative: [],
    declined: [],
    unresponsive: [],
  });

  let guestsText = '';
  if (separatedGuests.attending.length) {
    guestsText += `- Attending: ${separatedGuests.attending.length}} (${separatedGuests.attending.join(', ')})\n`;
  }
  if (separatedGuests.tentative.length) {
    guestsText += `- Tentative: ${separatedGuests.tentative.length}} (${separatedGuests.tentative.join(', ')})\n`;
  }
  if (separatedGuests.declined.length) {
    guestsText += `- Declined: ${separatedGuests.declined.length}} (${separatedGuests.declined.join(', ')})\n`;
  }
  if (separatedGuests.unresponsive.length) {
    guestsText += `- Unresponsive: ${separatedGuests.unresponsive.length}} (${separatedGuests.unresponsive.join(', ')})\n`;
  }
  if (guestsText.length) {
    finalText += `\n<b>Guests</b>:\n${guestsText}`
  }

  return finalText;
}

/**
 * Handles the creation of a new event in the source calendar.
 * @param {string} sourceEventId The ID of the newly created event in the source calendar.
 * @param {GoogleAppsScript.Calendar.Calendar} sourceCalendar The source calendar object.
 * @param {GoogleAppsScript.Calendar.Calendar} destinationCalendar The destination calendar object.
 * @param {Object} eventMap The current event ID mapping.
 */
function handleCreate(sourceEventId, sourceCalendar, destinationCalendar, eventMap) {
  try {
    const sourceEvent = sourceCalendar.getEventById(sourceEventId);
    if (!sourceEvent) {
      console.warn(`[handleCreate] Source event with ID ${sourceEventId} not found for creation. Treating as delete.`);
      // If source event is gone, delete the destination event
      handleDelete(sourceEventId, destinationCalendar, eventMap);
      return;
    }

    // Check if this event has already been synchronized (e.g., if the script ran previously)
    if (eventMap[sourceEventId]) {
      console.warn(`[handleCreate] Event ${sourceEventId} already exists in destination. Treating as update.`);
      handleUpdate(sourceEventId, sourceCalendar, destinationCalendar, eventMap); // Handle as an update if already exists
      return;
    }

    // Create a new event in the destination calendar based on the source event
    // Initial creation with basic properties
    const destinationEvent = destinationCalendar.createEvent(
      sourceEvent.getTitle(),
      sourceEvent.getStartTime(),
      sourceEvent.getEndTime(),
      {
        description: createEventDesc(sourceEvent),
        location: sourceEvent.getLocation(),
      }
    );

    // Apply RSVP-based formatting
    applyEventStatusFormatting(sourceEvent, destinationEvent);

    // Store the mapping
    eventMap[sourceEventId] = destinationEvent.getId();
    console.log(`[handleCreate] ✅ Created event ${destinationEventId} - source id: ${sourceEventId} ("${sourceEvent.getTitle()}")`);

  } catch (error) {
    console.error(`Failed to create event - source id: ${sourceEventId}: ${error.message}`);
  }
}

/**
 * Handles the update of an existing event in the source calendar.
 * @param {string} sourceEventId The ID of the updated event in the source calendar.
 * @param {GoogleAppsScript.Calendar.Calendar} sourceCalendar The source calendar object.
 * @param {GoogleAppsScript.Calendar.Calendar} destinationCalendar The destination calendar object.
 * @param {Object} eventMap The current event ID mapping.
 */
function handleUpdate(sourceEventId, sourceCalendar, destinationCalendar, eventMap) {
  const destinationEventId = eventMap[sourceEventId];

  if (!destinationEventId) {
    console.log(`[handleUpdate] No mapped destination event found for source event ID ${sourceEventId}. Treating as create.`);
    // If no mapping exists, treat it as a new creation
    handleCreate(sourceEventId, sourceCalendar, destinationCalendar, eventMap);
    return;
  }

  try {
    const sourceEvent = sourceCalendar.getEventById(sourceEventId);
    if (!sourceEvent) {
      console.warn(`[handleUpdate] Source event with ID ${sourceEventId} not found for update. Treating as delete.`);
      // If source event is gone, delete the destination event
      handleDelete(sourceEventId, destinationCalendar, eventMap);
      return;
    }

    const destinationEvent = destinationCalendar.getEventById(destinationEventId);
    if (!destinationEvent) {
      console.warn(`[handleUpdate] Event ${destinationEventId} - source id: ${sourceEvent} - not found for update. Treating as create.`);
      // If destination event is gone, remove mapping and recreate (otherwise infinite loop)
      delete eventMap[sourceEventId];
      handleCreate(sourceEventId, sourceCalendar, destinationCalendar, eventMap);
      return;
    }

    // Update basic properties of the destination event
    destinationEvent.setTime(sourceEvent.getStartTime(), sourceEvent.getEndTime());
    destinationEvent.setDescription(createEventDesc(sourceEvent));
    destinationEvent.setLocation(sourceEvent.getLocation());

    // Apply RSVP-based formatting
    applyEventStatusFormatting(sourceEvent, destinationEvent);

    console.log(`[handleUpdate] ✅ Updated event "${destinationEventId} - source id: ${sourceEventId}" ("${sourceEvent.getTitle()}")`);

  } catch (error) {
    console.error(`Failed to update event ${destinationEventId} - source id: ${sourceEventId}: ${error.message}`);
  }
}

/**
 * Handles the deletion of an event from the source calendar.
 * @param {string} sourceEventId The ID of the deleted event in the source calendar.
 * @param {GoogleAppsScript.Calendar.Calendar} destinationCalendar The destination calendar object.
 * @param {Object} eventMap The current event ID mapping.
 */
function handleDelete(sourceEventId, destinationCalendar, eventMap) {
  const destinationEventId = eventMap[sourceEventId];

  if (!destinationEventId) {
    console.warn(`[handleDelete] No mapped destination event found for deleted source event ID ${sourceEventId}. Doing nothing`);
    return;
  }

  try {
    const destinationEvent = destinationCalendar.getEventById(destinationEventId);
    if (destinationEvent) {
      destinationEvent.deleteEvent();
      console.log(`[handleDelete] ✅ Deleted event "${destinationEventId}" - source id: ${sourceEventId} ("${sourceEvent.getTitle()}")`);
    } else {
      console.warn(`[handleDelete] Event ${destinationEventId} - source id: ${sourceEventId} - not found for deletion, but mapping existed. Removing mapping.`);
    }
  } catch (error) {
    console.error(`Failed to delete event ${destinationEventId} - source id: ${sourceEventId}: ${error.message}`);
  } finally {
    // Always remove the mapping regardless of successful deletion
    delete eventMap[sourceEventId];
  }
}

/**
 * Applies title prefixes and transparency based on the user's RSVP status for an event.
 * @param {GoogleAppsScript.Calendar.CalendarEvent} sourceEvent The original event from the source calendar.
 * @param {GoogleAppsScript.Calendar.CalendarEvent} destinationEvent The copied event in the destination calendar.
 */
function applyEventStatusFormatting(sourceEvent, destinationEvent) {
  const originalTitle = sourceEvent.getTitle();
  let newTitle = originalTitle;
  let newTransparency = sourceEvent.getTransparency(); // Default to source event's transparency

  let myGuestStatus = sourceEvent.getMyStatus();

  if (sourceEvent.isOwnedByMe()) {
    myGuestStatus = CalendarApp.GuestStatus.OWNER;
  }

  switch (myGuestStatus) {
    case CalendarApp.GuestStatus.OWNER:
      // If owner, do nothing
      break;
    case CalendarApp.GuestStatus.YES:
      // If accepted, use the event's original transparency and no prefix.
      // `newTitle` and `newTransparency` are already set to defaults.
      break;
    case CalendarApp.GuestStatus.MAYBE:
      newTitle = `[TENTATIVE] ${originalTitle}`;
      // Use event's original transparency
      break;
    case CalendarApp.GuestStatus.INVITED: // This is typically for "needs action" / not responded
      newTitle = `[⚠️ RESPONSE REQUIRED ⚠️] ${originalTitle}`;
      // Use event's original transparency
      break;
    case CalendarApp.GuestStatus.NO:
      newTitle = `[DECLINED] ${originalTitle}`;
      newTransparency = CalendarApp.EventTransparency.TRANSPARENT; // Set to 'free' (transparent)
      break;
    default:
      console.warn(`  ~ Unknown guest status for ${MY_EMAIL}: ${myGuestStatus} for event ${soruceEvent.getId()} ("${originalTitle}")`);
      // Default to no change if status is unknown.
  }

  // Apply changes to the destination event only if they are different
  if (destinationEvent.getTitle() !== newTitle) {
      destinationEvent.setTitle(newTitle);
  }
  if (destinationEvent.getTransparency() !== newTransparency) {
      destinationEvent.setTransparency(newTransparency);
  }
  console.log(`  ~ ✅ Applied formatting for "${originalTitle}" (ID: ${sourceEvent.getId()}) based on status: ${myGuestStatus}.\n    { title: "${newTitle}", transparency: ${newTransparency} }`);
}


/**
 * Retrieves the event ID mapping from Script Properties.
 * @returns {Object} An object mapping source event IDs to destination event IDs.
 */
function getEventMap() {
  const properties = PropertiesService.getScriptProperties();
  const mapString = properties.getProperty(EVENT_MAP_PROPERTY_KEY);
  return mapString ? JSON.parse(mapString) : {};
}

/**
 * Saves the event ID mapping to Script Properties.
 * @param {Object} eventMap The event ID mapping to save.
 */
function saveEventMap(eventMap) {
  const properties = PropertiesService.getScriptProperties();
  properties.setProperty(EVENT_MAP_PROPERTY_KEY, JSON.stringify(eventMap));
}

/**
 * Helper function to manually clear the event map.
 * Useful for debugging or resetting synchronization.
 * Run this function manually from the Apps Script editor.
 */
function clearEventMap() {
  const properties = PropertiesService.getScriptProperties();
  properties.deleteProperty(EVENT_MAP_PROPERTY_KEY);
  console.log('Event map cleared from Script Properties.');
}

/**
 * Retrieves the nextSyncToken from Script Properties.
 * @returns {string|null} The stored nextSyncToken or null if not found.
 */
function getNextSyncToken() {
  const properties = PropertiesService.getScriptProperties();
  return properties.getProperty(NEXT_SYNC_TOKEN_PROPERTY_KEY);
}

/**
 * Saves the nextSyncToken to Script Properties.
 * @param {string} token The nextSyncToken to save.
 */
function saveNextSyncToken(token) {
  const properties = PropertiesService.getScriptProperties();
  properties.setProperty(NEXT_SYNC_TOKEN_PROPERTY_KEY, token);
}

/**
 * Clears the stored nextSyncToken from Script Properties.
 */
function clearNextSyncToken() {
  const properties = PropertiesService.getScriptProperties();
  properties.deleteProperty(NEXT_SYNC_TOKEN_PROPERTY_KEY);
}

/**
 * Helper function to manually clear all synchronization data.
 * Useful for debugging or resetting synchronization.
 * Run this function manually from the Apps Script editor.
 */
function clearAllSyncData() {
  const properties = PropertiesService.getScriptProperties();
  properties.deleteProperty(EVENT_MAP_PROPERTY_KEY);
  properties.deleteProperty(NEXT_SYNC_TOKEN_PROPERTY_KEY); // Clear the sync token too
  console.log('Event map and 🗝️ nextSyncToken cleared from Script Properties.');
}

/**
 * Deletes ALL events from the destination calendar within a specified date range.
 * This function is useful for resetting the destination calendar.
 * It also clears the stored synchronization data (event map and sync token).
 *
 * IMPORTANT: Run this function manually from the Apps Script editor.
 */
function deleteAllDestinationEvents() {
  console.info('Starting deletion of all events from the destination calendar...');
  const destinationCalendar = CalendarApp.getCalendarById(DESTINATION_CALENDAR_ID);

  if (!destinationCalendar) {
    console.error('Destination calendar not found. Check ID.');
    return;
  }

  const now = new Date();
  // Define a broad date range to ensure most events are captured for deletion
  const deleteStartDate = new Date();
  deleteStartDate.setFullYear(now.getFullYear() - 1); // Look back 1 year

  const deleteEndDate = new Date();
  deleteEndDate.setFullYear(now.getFullYear() + 1); // Look forward 1 year

  console.log(`Fetching events in destination calendar from ${deleteStartDate.toLocaleDateString()} to ${deleteEndDate.toLocaleDateString()} for deletion.`);

  try {
    const eventsToDelete = destinationCalendar.getEvents(deleteStartDate, deleteEndDate);
    let deletedCount = 0;

    for (const event of eventsToDelete) {
      try {
        event.deleteEvent();
        deletedCount++;
      } catch (eventDeleteError) {
        console.warn(`Failed to delete event "${event.getTitle()}" (ID: ${event.getId()}): ${eventDeleteError.message}`);
      }
    }
    console.log(`Successfully deleted ${deletedCount} events from the destination calendar.`);

    // After deleting events, clear the synchronization data to ensure a clean slate
    clearAllSyncData();
    console.log('Synchronization data (event map and sync token) also cleared.');

  } catch (error) {
    console.error(`Error during deletion of destination calendar events: ${error.message}`);
  }
}
