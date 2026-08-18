# Rita

Save the moments where you noticed something, so the people who love you don't have to guess.

## What this is

A working first version of Rita: a mobile-first web app where you save things you
notice throughout the year (a photo, how much you want it 1-10, a note, where you
saw it), and your friends get a private view of it before your birthday — without
you ever seeing who's looking or claiming a gift idea.

Zero external dependencies on purpose — just Node.js built-ins (HTTP server, SQLite,
crypto for auth) and vanilla HTML/CSS/JS on the frontend. No `npm install`, no build
step, no framework to fight with. That makes it trivial to run anywhere Node 22+ is
available.

## Running it

```
node server.js
```

Then open http://localhost:3000. It works fine on desktop for testing, but it's
built mobile-first: try it in your phone's browser or with devtools' mobile view.

The database is a single SQLite file at `data/rita.db`, created automatically on
first run. Uploaded photos are saved to `uploads/`.

## Core flows

- Sign up / log in (email + password)
- Save a moment: optional photo, a 1-10 "how much do they want it" slider, a note,
  an optional location
- Your circle: share your invite code/link, connect to friends via theirs
- Occasions: see your circle's upcoming birthdays and everything they've saved,
  soonest first
- Claim a gift idea privately — visible to your other friends so you don't
  duplicate each other, but never to the birthday person

## What's next

This runs great locally, but for your friends to actually open it on their own
phones, it needs to live somewhere with a public URL — a $0-7/month host like
Render or Railway is the easiest fit since there's no build step to configure,
just "run `node server.js`". Happy to walk through that whenever you're ready.
