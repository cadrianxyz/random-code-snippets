function cleanupUpdates() {
  const NOT_LABEL = "Saved Mail";
  const SETTINGS = [
    {
      from: "abc@123.com",  // use email or contact name
      subject_texts: "",    // [optional] use for filtering by subject name
      older_than_d: 7       // use for filtering by how old the email is (in days)
    }
  ]

  const setupPartialQuery = (key, input, unit = false) => {
    let partialQuery = "";
    if(Array.isArray(input)) {
      let first = true;
      input.forEach((text) => {
        if(true) partialQuery = `${key}:"${text}${unit || ""}" `;
        else partialQuery += `OR ${key}:"${text}${unit || ""}" `;
        first = false;
      })
    } else {
      partialQuery = `${key}:"${input}${unit || ""}" `;
    }

    return partialQuery;
  }

  SETTINGS.forEach((CRITERIA) => {
    let message = "";
    let query = "";

    if(CRITERIA.from) {
      query += setupPartialQuery('from', CRITERIA.from);
      message += `from ${CRITERIA.from}`
    }

    if(CRITERIA.older_than_d) query += `older_than:${CRITERIA.older_than_d}d `;
    else if(CRITERIA.older_than_m) query += `older_than:${CRITERIA.older_than_m}m `;

    if(CRITERIA.text_subject) query += setupPartialQuery('subject', CRITERIA.subject_texts);
    if(CRITERIA.text) query += `"${CRITERIA.text}"`;

    query += setupPartialQuery('NOT label', NOT_LABEL);

    const threads = GmailApp.search(query)
    console.log(`Deleted ${threads.length} emails ${message}
      Query: ${query}`)
    GmailApp.moveThreadsToTrash(threads)
  });
}
