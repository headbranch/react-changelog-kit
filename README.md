# react-changelog-kit

Tell users what's new in your React Native, Expo or React web app, without ever showing them the same thing twice.

When you ship something, add an entry to a list in your code. The library tracks which entries each user has seen, and its hooks tell you what's still new, so you can show it with your own popups, tab dots and NEW tags:

```tsx
const { entries, markAllSeen } = useEntries({ channel: "popup", isNew: true });
```

- **Headless:** no UI included, so it fits whatever components you already use.
- **Seen state per channel:** closing the "what's new" popup doesn't clear the dot on the Settings tab. Each place you announce something tracks its own seen state.
- **Groups:** tag entries so each screen or tab can query just the ones it cares about.
- **Namespaces:** separate seen state per user, workspace or profile.
- **Any storage:** MMKV, AsyncStorage, `localStorage`, or your own key-value store.
- **Ships with your app:** entries live in your code, so they go out with store releases and OTA updates. No backend and no native module.

## Install

```bash
npm install react-changelog-kit
```

Requires React 18 or later.

## Usage

`createChangelog` needs a `storage` adapter to remember what each user has seen, and throws without one. Use the storage your app already has: MMKV, AsyncStorage, or `localStorage` on the web; see [Storage](#storage). This example uses MMKV:

```ts
// changelog.ts
import { createChangelog, mmkvStorage } from "react-changelog-kit";
import { createMMKV } from "react-native-mmkv";

export const changelog = createChangelog({
	storage: mmkvStorage(createMMKV()),
	entries: [
		{
			id: "dark-mode",
			channels: ["popup", "badge"],
			groups: ["settings"],
			data: { title: "Dark mode" },
		},
		{
			id: "fix-sync",
			channels: ["popup"],
			data: { title: "Fixed sync on slow networks" },
		},
	],
});
```

Wrap your app in `ChangelogProvider`:

```tsx
// App.tsx
import { ChangelogProvider } from "react-changelog-kit";
import { changelog } from "./changelog";

export default function App() {
	return (
		<ChangelogProvider changelog={changelog}>
			<Root />
		</ChangelogProvider>
	);
}
```

Then use the hooks anywhere inside it.

**Popup on launch:**

```tsx
import { useEntries } from "react-changelog-kit";

function WhatsNew() {
	const { entries, markAllSeen } = useEntries({
		channel: "popup",
		isNew: true,
	});

	if (!entries.length) return null;

	return (
		<Sheet onClose={markAllSeen}>
			{entries.map((e) => (
				<Text key={e.id}>{e.data.title}</Text>
			))}
		</Sheet>
	);
}
```

**Dot on a tab:**

```tsx
const { entries } = useEntries({
	channel: "badge",
	group: "settings",
	isNew: true,
});

const showDot = entries.length > 0;
```

**NEW tag that clears once the feature is used:**

Show a tag next to the feature, and mark the entry seen when the user actually tries it:

```tsx
import { useEntry } from "react-changelog-kit";

function DarkModeRow() {
	const { isNew, markSeen } = useEntry("dark-mode");
	const [enabled, setEnabled] = useDarkModeSetting();

	return (
		<View style={styles.row}>
			<Text>Dark mode</Text>
			{isNew && <Text style={styles.newTag}>NEW</Text>}
			<Switch
				value={enabled}
				onValueChange={(value) => {
					setEnabled(value);
					markSeen();
				}}
			/>
		</View>
	);
}
```

This `markSeen()` has no channel, so it marks `dark-mode` seen in every channel. The tag, the popup and the tab dot all clear, because the user has found the feature. Just opening the popup would only clear the popup.

**Outside React**, such as in a deep-link handler, use the instance directly:

```ts
changelog.markSeen("dark-mode");
```

## How it works

- **Entries** are the things you announce. Each has a stable `id`. Put anything you want to show, such as a title or a body, in `data`.
- **Channels** are the ways a user hears about an entry, such as `'popup'` or `'badge'`. Each channel has its own seen state, so closing the popup doesn't clear the badge. Channels are optional.
- **Groups** are tags that make entries easier to query. Give an entry as many as you like, then filter by one with `useEntries({ group })`, for example to put a dot on one tab or list the tips for one screen. Groups can be nested with dots: filtering by `'settings'` also matches `'settings.appearance'`.

Pass a `channel` to read or mark seen in that channel only. Leave it out to cover all of the entry's channels. A good rule is to pass a channel where you only announce (popups, dots), and leave it out where the user actually uses the feature.

An entry is new if it was added to the list after the user's first launch. There is no version comparison.

> [!IMPORTANT] > **Adding the library to an app that already has users?** The first time the library runs on a device, it marks every entry already in the list as seen. That's right for new installs, because they don't need to hear what changed.
>
> But say you add the library in v2.0, with entries for what's new in v2.0. When existing users update, it's the library's first run for them too, so those entries are marked seen and they never get the announcements.
>
> To fix this, tell the library which users were already using the app, using a signal your app already has:
>
> ```ts
> createChangelog({
> 	storage,
> 	entries,
> 	// 'none': nothing seen yet, so existing users get the v2.0 announcements.
> 	// 'all':  everything seen, so new installs start clean.
> 	initialSeen: () => (isExistingUser() ? "none" : "all"),
> });
> ```
>
> `isExistingUser()` is your own check. For example, it could look for a value that earlier versions of your app saved, or compare the account's creation date with the v2.0 release date. It runs only once per device, so you can leave it in after v2.0.

## Namespaces

By default, a device keeps one record of what's been seen. A namespace is a separate record, so different people or contexts on the same device each track what they've seen on their own. Use one for:

- **Users** who share a device, so one person dismissing a popup doesn't hide it from the next.
- **Workspaces or teams**, so an announcement for one workspace shows again in the next.
- **Profiles**, such as a kids' profile and a grown-up one.

Each namespace is just a string you pick. The changelog starts in `null`, the shared record, and you can switch at any time:

```tsx
import { useChangelog } from "react-changelog-kit";

function WorkspacePicker({ workspaces }) {
	const { namespace, setNamespace } = useChangelog();

	return workspaces.map((w) => (
		<Button
			key={w.id}
			title={w.name}
			disabled={w.id === namespace}
			onPress={() => setNamespace(w.id)}
		/>
	));
}
```

Outside React, call the same function on the instance. For example, to keep seen state per signed-in user:

```ts
onAuthStateChanged(auth, (user) => {
	changelog.setNamespace(user?.uid ?? null);
});
```

When you switch:

- Every hook re-renders. Nothing reports as new until the new namespace has loaded, so the previous namespace's state never shows.
- Records you switch away from stay in storage, so switching back picks up where it left off. To delete one, switch to it and call `reset()`.
- The first time a namespace is used on a device, `initialSeen` decides what counts as already seen, just like a first launch. The function form receives the namespace, so you can decide per user or workspace.

The current namespace isn't remembered between launches: the changelog always starts in `null`. Call `setNamespace` at startup, wherever your app restores the signed-in user or the last workspace.

## API

### `createChangelog(options)`

| Option        | Type                                                   | Required | Description                                                                                                                   |
| ------------- | ------------------------------------------------------ | -------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `entries`     | `EntryConfig[]`                                        | Yes      | Each entry has an `id`, plus optional `channels`, `groups` and `data`.                                                        |
| `storage`     | `StorageAdapter`                                       | Yes      | A [storage adapter](#storage).                                                                                                |
| `initialSeen` | `'all' \| 'none' \| Id[]`, or a function returning one | No       | What to treat as seen the first time a namespace is used on a device. Defaults to `'all'`. The function receives the namespace and can be async. |

### `<ChangelogProvider>`

| Prop        | Type             | Required | Description                                                                                                                                               |
| ----------- | ---------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `changelog` | `Changelog`      | Yes      | The instance from `createChangelog`.                                                                                                                      |

### Hooks

Use these inside `ChangelogProvider`. They throw outside it.

| Hook                                              | Description                                                                                                        |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `useEntry(id, { channel? })`                      | Returns `{ id, data, isNew, markSeen }`.                                                                           |
| `useEntries({ channel?, group?, isNew?, data? })` | Returns `{ entries, markAllSeen }`. `data` matches a subset of each entry's `data`, such as `{ audience: 'pro' }`. |
| `useChangelog()`                                  | Returns `{ isReady, namespace, setNamespace, markSeen, reset }`, and re-renders when loading finishes or the namespace changes. |

### Instance methods

For code outside React, such as deep-link handlers, push notifications and tests.

| Method                                                                   | Description                                                   |
| ------------------------------------------------------------------------ | ------------------------------------------------------------- |
| `markSeen(id \| ids, { channel? })`                                      | Marks entries seen.                                           |
| `setNamespace(namespace \| null)`                                        | Switches to a separate set of seen state. Starts as `null`.   |
| `reset()`                                                                | Clears seen state for the current namespace. For development. |
| `getEntry`, `getEntries`, `subscribe`, `ready()`, `isReady`, `namespace` | Non-hook versions of the hooks.                               |

Until storage has loaded, nothing reports as new, so badges don't flicker at startup. With MMKV, storage is ready on the first render.

`markAllSeen` only marks the entries the query returned. To hide an entry from some users, filter it out in the query, not when you render, so they don't mark it seen without seeing it.

## Storage

The library doesn't bundle a storage library. Pass `createChangelog` an adapter for the storage your app already uses. Pick one below.

### MMKV (React Native)

Synchronous, so the hooks have the right answer on the very first render. Needs a development build: it doesn't run in Expo Go.

```bash
npx expo install react-native-mmkv
```

```ts
import { createChangelog, mmkvStorage } from "react-changelog-kit";
import { createMMKV } from "react-native-mmkv";

export const changelog = createChangelog({
	storage: mmkvStorage(createMMKV()),
	entries: [/* ... */],
});
```

On react-native-mmkv v3, pass `new MMKV()` instead of `createMMKV()`.

### AsyncStorage (React Native, Expo Go)

Asynchronous: nothing reports as new until the first read finishes, which takes a moment after launch. Works in Expo Go and on the web.

```bash
npx expo install @react-native-async-storage/async-storage
```

```ts
import AsyncStorage from "@react-native-async-storage/async-storage";
import { asyncStorage, createChangelog } from "react-changelog-kit";

export const changelog = createChangelog({
	storage: asyncStorage(AsyncStorage),
	entries: [/* ... */],
});
```

### localStorage (React web)

Synchronous and built into the browser, so there's nothing to install.

```ts
import { createChangelog, webStorage } from "react-changelog-kit";

export const changelog = createChangelog({
	storage: webStorage(localStorage),
	entries: [/* ... */],
});
```

Pass `sessionStorage` instead to forget seen state when the tab closes. With server rendering, such as Next.js, `localStorage` only exists in the browser, so create the changelog in client-side code.

### Your own storage

Any object with these methods works. Each one can return a value directly or a promise:

```ts
const storage = {
	get: (key) => myStore.read(key), // return the saved string, or null if there's none
	set: (key, value) => myStore.write(key, value),
	remove: (key) => myStore.delete(key), // optional, used by reset()
};

export const changelog = createChangelog({ storage, entries: [/* ... */] });
```

## Development

```bash
npm install
npm test
npm run typecheck
```

The `example/` folder has an Expo app that uses the library source directly:

```bash
cd example && npm install && npx expo start
```

## License

MIT
