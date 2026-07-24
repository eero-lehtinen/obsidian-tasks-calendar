# Tasks Calendar

Tasks Calendar is an Obsidian community plugin that displays Markdown tasks in a Google Calendar-inspired month or week view. It is designed to work with the [Tasks plugin](https://publish.obsidian.md/tasks/Introduction), while remaining useful for standard Markdown checkboxes.

## Features

- Month and week layouts with previous, next, and today navigation
- Persistent calendar mode, visible date, filters, search, and completion visibility in standalone and embedded calendars
- Current-day highlighting and responsive desktop/mobile layouts
- Scheduled, due, and start date support using Tasks emoji syntax
- Completed tasks shown after active tasks with muted, configurable styling
- A toolbar filter editor and instant text search
- Checkbox completion directly from the calendar
- Recurring-task completion through the Tasks API when Tasks is installed
- Click a task to open its source line; right-click to edit through Tasks
- Automatic updates when Markdown files are created, edited, renamed, or deleted
- In-session performance measurements for indexing, update latency, and rendering
- A bounded “Very late tasks” backlog for incomplete tasks older than today’s visible calendar range
- Full workspace calendar and embeddable `tasks-calendar` code blocks

## Installation

### From a release

Download `main.js`, `manifest.json`, and `styles.css` from the GitHub release and copy them into:

```text
<vault>/.obsidian/plugins/tasks-calendar/
```

Restart Obsidian, open **Settings → Community plugins**, and enable **Tasks Calendar**. The Tasks plugin is recommended for custom statuses, recurrence, and its task editor, but is not required.

### Build from source

```bash
npm install
npm run build
```

The development build writes Obsidian's generated `main.js` entry point at the repository root. Copy it with `manifest.json` and `styles.css` to the vault plugin directory.

## Usage

Run **Tasks Calendar: Open calendar** from the command palette or select the calendar-check ribbon icon. Use the arrow buttons to navigate, **Today** to return to the current date, and the **Month/Week** buttons to change layout.

Run **Tasks Calendar: Show performance report** to inspect initial indexing, individual file indexing, file-event-to-index latency, and calendar render timing. The report includes sample count, average, p50, p95, maximum, and latest values. Measurements are held only for the current session, capped at 500 samples per metric, and can be copied or reset.

Tasks are placed using the first available date field configured in settings. The default order is scheduled (`⏳`), due (`📅`), then start (`🛫`).

To embed a filtered calendar in a note:

````markdown
```tasks-calendar
not done
path includes Projects
```
````

## Filtering

The filter editor accepts one instruction per line. Every instruction must match, as in a Tasks query. Supported instructions:

- `done`, `not done`
- `due`, `scheduled`, `start`, or `happens` followed by `on`, `before`, or `after`, then `today`, `tomorrow`, `yesterday`, or `YYYY-MM-DD`
- `description`, `path`, `folder`, or `tag` followed by `includes` or `does not include`
- `priority is highest|high|medium|normal|low|lowest`
- `is recurring`, `is not recurring`, `has tags`, `no tags`
- Parenthesized `AND`, `OR`, and `NOT` expressions, for example `(scheduled today) OR (due today)`

Display-only Tasks instructions such as `sort`, `group`, `limit`, `hide`, `show`, `short mode`, and `explain` are accepted and ignored because the calendar controls its own layout. Function filters and complex boolean expressions are not executed.

## Task formats

The parser supports standard Markdown task list markers (`-`, `*`, `+`, and numbered lists), all checkbox status characters, and the Tasks emoji date format. The statuses `x`, `X`, `-`, and `_` are treated as complete. When the Tasks plugin is enabled, its own status and recurrence logic is used for checkbox changes.

## Development

```bash
npm run check
npm test
npm run build
```

Available scripts:

- `npm run dev`: watch the TypeScript sources and rebuild `main.js`
- `npm run check`: type-check without emitting files
- `npm test`: run the unit test suite
- `npm run build`: type-check and create a minified production `main.js`
- `npm run clean`: remove generated build and release artifacts
- `npm run deploy -- <vault-path>`: build and copy the runtime files to `<vault-path>/.obsidian/plugins/tasks-calendar/`
- `npm run release`: clean, test, build, and assemble the three release assets under `dist/tasks-calendar-<version>/`
- `npm version patch|minor|major`: synchronize `package.json`, `manifest.json`, and `versions.json`

Generated `main.js` and `dist/` contents are intentionally ignored. Obsidian installations receive these files from GitHub release assets; they are not committed to the source repository.

For example:

```bash
npm run deploy -- "D:\Notes\My Vault"
```

The vault must already contain a `.obsidian` directory. The command creates the plugin-specific directory if needed and overwrites only the plugin's three generated runtime files.
