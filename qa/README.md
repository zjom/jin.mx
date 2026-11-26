# qa.jin.mx

Questionnaires for clients: one question per screen, moved through by swiping.

- `qa.jin.mx/<name>` is a general questionnaire. Progress is kept on the
  visitor's device until they send it.
- `qa.jin.mx/for/<token>` is one customer's own link. Progress is kept on the
  server, so the same link resumes on any device.

Everything else is done at `qa.jin.mx/admin`, from any browser: importing
questionnaires, making customer links, and reading what was answered.

## Admin

`qa.jin.mx/admin` is behind Cloudflare Access, so it asks who you are first.

- **Import a questionnaire** takes a JSON file, or JSON pasted in, and a name.
  The name is its address: `discovery` is served at `qa.jin.mx/discovery`.
  It is checked before it is saved, and what is wrong is listed. No deploy is
  needed; it is live as soon as it is saved.
- **Update** on a questionnaire does the same to one that exists. Every import
  is kept as a revision, and each submission remembers the revision it
  answered, so old answers are always shown beside the questions as they were.
  Links still being filled in move to the new revision; the check warns when
  that would drop an answer someone has already given.
- **New link** makes a customer's own link, to copy or share.
- **Archive** takes a questionnaire and its links offline without losing
  anything. **Revoke** does the same for one link. Both can be undone.
- A link, or something sent from a questionnaire's address, opens to its
  answers, with any files to download. **Export CSV** is all of a
  questionnaire's submissions as a spreadsheet.

### Setting up Access

Once, in Cloudflare Zero Trust:

1. Access → Applications → Add → Self-hosted. Give it two addresses:
   `qa.jin.mx/admin` and `qa.jin.mx/api/admin`.
2. Add a policy that allows only your own email address.
3. Copy the application's **Application Audience (AUD) Tag** into `ACCESS_AUD`
   in `wrangler.jsonc`, and your team domain (`<team>.cloudflareaccess.com`)
   into `ACCESS_TEAM_DOMAIN`. Then deploy.

The worker checks Access's signature on every request to `/admin` and
`/api/admin` itself. Until both values are set, or if the Access application
is ever missing or misplaced, `/admin` answers no one rather than everyone.

For the scripts below, also make a service token (Access → Service Auth), add
a second policy to the application with the action **Service Auth** that
includes it, and put its two halves in `CF_ACCESS_CLIENT_ID` and
`CF_ACCESS_CLIENT_SECRET` in your shell.

## Writing a questionnaire

A questionnaire is one JSON object. The files in `questionnaires/` are a
place to write them, not what is served: `pnpm push` imports them all, or
`pnpm push discovery` just one, exactly as importing in `/admin` does.
`demo.json` uses every question type and is the best thing to copy from.

```json
{
  "title": "Shown in the browser tab",
  "audience": "general",
  "questions": [
    { "id": "name", "type": "text", "title": "What should we call you?", "required": true }
  ],
  "submit": { "title": "That’s everything.", "body": "…", "label": "Send" },
  "outro": { "title": "Thank you.", "body": "…" }
}
```

`"audience": "invite"` makes a questionnaire reachable only through customer
links. Any questionnaire can be sent to a customer.

## Languages

A questionnaire is in English unless it says otherwise. With
`"languages": ["en", "zh"]` it is in both (`zh` is Simplified Chinese), and
every text is written once per language. `onboarding.json` is written this way.

```json
{
  "title": { "en": "Getting started", "zh": "开始之前" },
  "languages": ["en", "zh"],
  "questions": [
    {
      "id": "cadence",
      "type": "choice",
      "title": { "en": "How often should we write?", "zh": "您希望我们多久联系一次？" },
      "options": [{ "value": "weekly", "label": { "en": "Every week", "zh": "每周" } }]
    }
  ]
}
```

- The reader gets a switch in the corner. The page opens in the first listed
  language their browser asks for, or else in the first one listed.
- Options and matrix rows need a `value` (or `id`) of their own, which is what
  is stored and what `showIf` compares, so answers read the same whichever
  language they were given in. Text the reader typed is stored as typed.
- `pnpm check` fails if any text is missing a language. Only `prefix` and
  `suffix` may stay plain strings.
- What the site itself says ("This one is required.") is in `shared/words.js`.
  A new language is added there, to `LANGS`, and then to each questionnaire.

Every question has an `id`, a `type` and a `title`, and may have a `body`
(a quieter line under the title), `required`, and `showIf`.

| type | answer | options |
| --- | --- | --- |
| `statement` | none; a screen of text | `eyebrow` |
| `text`, `long` | string | `placeholder`, `min`, `max` (length) |
| `email`, `url`, `tel` | string, checked | `placeholder` |
| `number` | number | `min`, `max`, `step`, `integer` |
| `choice` | one option | `options`, `other` |
| `multi` | list of options | `options`, `other`, `min`, `max` (how many) |
| `select` | one option, from a dropdown | `options`, `placeholder` |
| `boolean` | `true` or `false` | `yes`, `no` (labels) |
| `consent` | `true` | `label` |
| `rating` | 1 to `max` (5) | `max` |
| `scale` | `min` (0) to `max` (10) | `min`, `max`, `labels` |
| `slider` | number | `min`, `max`, `step`, `prefix`, `suffix`, `labels` |
| `date`, `time` | `yyyy-mm-dd`, `hh:mm` | `earliest`, `latest` (date) |
| `rank` | all options, in order | `options` |
| `matrix` | `{ row: column }` | `rows`, `columns`, `labels` |
| `file` | list of stored files | `max` (how many, 1), `maxSize` (MB each, 10; 25 at most), `accept` (extensions) |

`options` are strings, or `{ "value": …, "label": … }`. With `"other": true`
a free text answer is stored as `{ "other": "…" }`.

`showIf` shows a question only when an earlier answer fits:
`{ "id": "kind", "equals": "Other" }`. Besides `equals` there are `not`, `in`
(a list), `includes` (for `multi`), `atLeast` and `atMost`; with none of them,
the earlier question only has to be answered. Answers to hidden questions are
not stored.

In any text, `{{customer}}` becomes the customer's name on a customer link,
and nothing on a general one.

`pnpm check` reports mistakes in these files, and so does an import, which
refuses to save with any.

## Customer links

Made in `/admin`, or from here with a service token:

```sh
pnpm invite onboarding "Acme & Sons"            # prints the link to send
pnpm invite onboarding "Acme" contact=Ada       # also fills {{contact}}
pnpm invite onboarding "华星科技" lang=zh        # the link opens in Chinese
```

Without `lang`, a link opens in the customer's browser language. Either way
the switch stays, and the link remembers the language last used.

## Reading answers

In `/admin`. The database can also be asked directly:

```sh
pnpm exec wrangler d1 execute qa --remote --json \
  --command "SELECT * FROM submissions WHERE questionnaire = 'onboarding'"
```

`submissions` holds everything sent, from both kinds, with the language (`lang`)
it was sent in and the `revision` it answered. Progress on customer
links that have not been sent yet is in `invites`.

Each time a questionnaire is sent, the worker emails the answers through
[Resend](https://resend.com), with a link to them in `/admin`. It needs two
secrets, and sends nothing without them:

```sh
pnpm exec wrangler secret put RESEND_API_KEY
pnpm exec wrangler secret put NOTIFY_TO      # one address, or several with commas
```

The email comes from `qa@notify.jin.mx`; `NOTIFY_FROM` changes that. For
`pnpm dev`, put the same names in `.dev.vars`.

A `file` answer lists each file's `name`, `size` and `key`. The files
themselves are in the private R2 bucket `qa-uploads`. `/admin` links to each
one; from here, fetch one by its key:

```sh
pnpm exec wrangler r2 object get "qa-uploads/<key>" --remote --file brief.pdf
```

A file is stored as soon as it is chosen, so one that is later removed, or
belongs to a questionnaire never sent, stays in the bucket until deleted.

## Running it

```sh
pnpm db:local     # create the local database, or bring it up to date
pnpm dev          # /admin is open here; add --local to `pnpm invite` and `pnpm push`
pnpm run deploy   # build, bring the database up to date, and deploy
```

Questionnaires and their revisions are in the D1 tables `questionnaires` and
`revisions`. The database starts with the three questionnaires that used to be
built into the site.

The first deploy creates the D1 database `qa` and the R2 bucket `qa-uploads`,
and attaches `qa.jin.mx`. R2 has to be enabled on the Cloudflare account first.
