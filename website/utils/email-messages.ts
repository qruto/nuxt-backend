/**
 * The playground's emails in German: the package's `email` labels as an
 * app's i18n messages hold them, under `backend.email`. `backend/email.ts`
 * hands them to `setupEmail({ messages: { de } })`, so an account whose
 * language is German gets every email the package sends in German, and the
 * email-templates page previews them. A real app passes its i18n JSON file
 * (`i18n/locales/de.json`) as it is.
 */
export const de = {
  backend: {
    email: {
      layout: {
        sentBy: 'Gesendet von {brand}',
      },
      link: {
        fallback: 'Oder kopiere diesen Link in deinen Browser:',
      },
      otp: {
        subject: {
          'sign-in': 'Dein Anmeldecode',
          'email-verification': 'Bestätige deine E-Mail-Adresse',
          'forget-password': 'Setze dein Passwort zurück',
          'change-email': 'Bestätige deine neue E-Mail-Adresse',
        },
        expiry: 'Dieser Code läuft bald ab. Wenn du ihn nicht angefordert hast, kannst du diese E-Mail ignorieren.',
        emailChange: {
          subject: 'Bestätige die Änderung deiner E-Mail-Adresse',
          intro: 'Gib diesen Code ein, um zu bestätigen, dass du die E-Mail-Adresse deines Kontos ändern möchtest.',
          warning: 'Wenn du das nicht warst, ist vielleicht jemand anderes in deinem Konto angemeldet. Melde deine anderen Sitzungen ab.',
        },
      },
      emailChanged: {
        subject: 'Deine E-Mail-Adresse wurde geändert',
        intro: 'Die E-Mail-Adresse deines Kontos lautet jetzt {newEmail}.',
        warning: 'Wenn du das nicht warst, melde dich bitte sofort bei uns.',
      },
      welcome: {
        subject: 'Willkommen',
        greeting: 'Willkommen!',
        greetingNamed: 'Willkommen, {name}!',
        body: 'Dein Konto steht bereit, danke fürs Mitmachen.',
      },
      invite: {
        subject: 'Tritt {workspace} bei',
        intro: '{inviter} hat dich eingeladen, {workspace} als {role} beizutreten.',
        action: 'Einladung annehmen',
      },
      gift: {
        subject: '{sender} hat dir ein Geschenk geschickt 🎁',
        intro: '{sender} hat dir ein Geschenk geschickt: {item}. Melde dich an, um es zu erhalten.',
        sender: 'Jemand',
        action: 'Geschenk erhalten',
      },
    },
    notifications: {
      playground_signal: { title: 'Ein Signal wurde aufgezeichnet', body: 'Aufgezeichnet auf den Seiten Aktivität und Benachrichtigungen.' },
    },
  },
}

/**
 * The playground's own notification in English, as an app's `en.json` holds
 * it: the pages read the same words from app.config, and the backend, which
 * never reads app config, reads them here for the push and the email.
 */
export const en = {
  backend: {
    notifications: {
      playground_signal: { title: 'A signal was recorded', body: 'Recorded from the Activity and Notifications pages.' },
    },
  },
}
