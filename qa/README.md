# qa.jin.mx

Questionnaires for clients: one question per screen, moved through by swiping.

- `qa.jin.mx/<name>` is a general questionnaire. Progress is kept on the
  visitor's device until they send it.
- `qa.jin.mx/for/<token>` is one customer's own link. Progress is kept on the
  server, so the same link resumes on any device.

## Writing a questionnaire

Each file in `questionnaires/` is one questionnaire, and its file name is its
address: `questionnaires/discovery.json` is served at `qa.jin.mx/discovery`.
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

`pnpm check` reports mistakes in these files, and the build refuses to run
with any.

## Customer links

```sh
pnpm invite onboarding "Acme & Sons"            # prints the link to send
pnpm invite onboarding "Acme" contact=Ada       # also fills {{contact}}
```

## Reading answers

```sh
pnpm exec wrangler d1 execute qa --remote --json \
  --command "SELECT * FROM submissions WHERE questionnaire = 'onboarding'"
```

`submissions` holds everything sent, from both kinds. Progress on customer
links that have not been sent yet is in `invites`.

A `file` answer lists each file's `name`, `size` and `key`. The files
themselves are in the private R2 bucket `qa-uploads`; fetch one by its key:

```sh
pnpm exec wrangler r2 object get "qa-uploads/<key>" --remote --file brief.pdf
```

A file is stored as soon as it is chosen, so one that is later removed, or
belongs to a questionnaire never sent, stays in the bucket until deleted.

## Running it

```sh
pnpm db:local     # once: create the local database
pnpm dev          # add --local to `pnpm invite` to make links for it
pnpm run deploy   # build, deploy, and bring the database up to date
```

The first deploy creates the D1 database `qa` and the R2 bucket `qa-uploads`,
and attaches `qa.jin.mx`. R2 has to be enabled on the Cloudflare account first.
