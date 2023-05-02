function colorTest() {
  const result = new BatchRequest({
    batchPath: 'batch/calendar/v3',
    requests: [
      {
        method: "GET",
        endpoint: "https://www.googleapis.com/calendar/v3/colors",
      },
    ],
  });

  console.log(result[0].calendar)
  console.log(result[0].event)
}
