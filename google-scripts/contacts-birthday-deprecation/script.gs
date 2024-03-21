const USER_NAMES = [
  'FullName In GoogleContacts',
]

const CUSTOM_BDAY_FIELD_KEY = 'Birthday';

function getResourceNames() {
  try {
    const userIds = [];
    USER_NAMES.forEach((un) => {
      const searchResults = People.People.searchContacts({
        query: un,
        readMask: 'names',
      });
      searchResults.results.forEach((sr) => userIds.push(sr.person.resourceName));
    })
    return userIds;
  } catch (err) {
    console.log('Failed with error %s', err.message);
  }
}

function moveBirthdayToCustomField() {
    try {
    /**
     * List the 10 connections/contacts of user
     * @see https://developers.google.com/people/api/rest/v1/people.connections/list
     */
    const retrievedUserIds = getResourceNames(USER_NAMES);
    const batchGetResults = People.People.getBatchGet({
      resourceNames: retrievedUserIds,
      personFields: 'names,birthdays,userDefined'
      // use other query parameter here if needed.
    });
    const contacts = batchGetResults.responses

    const batchUpdateBody = {};

    contacts.forEach((contact) => {
      const fullName = contact.person.names[0].unstructuredName;
      const birthdays = contact.person.birthdays;
      let birthdayString = '';
      let remainingBirthdays = [];

      if (birthdays && birthdays.length) {
        const mainBirthday = birthdays.find((b) => b.metadata.primary)
        if (mainBirthday) {
          birthdayString = `${mainBirthday.date.year}/${mainBirthday.date.month}/${mainBirthday.date.day}`;
        }
        remainingBirthdays = birthdays.filter((b) => !b.metadata.primary);
      }

      if (!birthdayString) return;

      let customBirthdayField = null;
      let remainingUserDefinedFields = [];
      if (contact.person.userDefined) {
        customBirthdayField = contact.person.userDefined.find((udf) => udf.key === CUSTOM_BDAY_FIELD_KEY);
        remainingUserDefinedFields = contact.person.userDefined.filter((udf) => udf.key !== CUSTOM_BDAY_FIELD_KEY);
      }
      console.log(`### User '${fullName}' has main birthday field: '${birthdayString}'\n
      - User has custom birthday field? ${!!customBirthdayField}
      `);

      batchUpdateBody[contact.person.resourceName] = {
        ...contact.person,
        birthdays: remainingBirthdays,
        userDefined: [
          ...remainingUserDefinedFields,
          {
            key: CUSTOM_BDAY_FIELD_KEY,
            value: birthdayString
          }
        ]
      }
    })

    if (!Object.keys(batchUpdateBody).length) {
      console.log(`No updates made!`);
      return;
    }

    const batchUpdateResults = People.People.batchUpdateContacts({
      "contacts": batchUpdateBody,
      "updateMask": 'userDefined,birthdays',
      "readMask": 'userDefined',
    });

    console.log(`Successfully updated ${Object.keys(batchUpdateBody).length} contacts!`);

  } catch (err) {
    console.log('Failed with error %s', err.message);
  }

}
