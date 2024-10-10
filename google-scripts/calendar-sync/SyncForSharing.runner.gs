// can run the following way
function syncWithDefaults() {
    SyncForSharing();
}

// or with specified options
function syncSixthMonthFromNow() {
  SyncForSharing({
    daysPast: 0,
    daysFutureStart: 151,
    daysFutureEnd: 180,
  });
}
