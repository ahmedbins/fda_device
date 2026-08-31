# Chapter 9: Run it on your own computer

*[← Chapter 8](08-how-the-website-goes-live.md) · [Guide home](README.md) · [Glossary →](glossary.md)*

---

This chapter is optional — nothing later depends on it, because there is no later; this is the last chapter. But there's something satisfying about seeing the website come alive on your own machine, and it's the natural first step if you ever want to contribute. Every command is spelled out; nothing assumes prior experience.

## What "running it locally" means

Instead of visiting the published site, your computer plays the server role itself: it builds the pages and serves them to your own browser at an address only your machine can see. Developers work this way so they can see changes instantly without publishing anything.

## Step 1: Install the two tools

**Node.js** is the program that runs JavaScript outside a browser — it powers the build, the tests, and the local server. Download it from [nodejs.org](https://nodejs.org) (choose the "LTS" version; this project needs version 22.13 or newer) and run the installer. It includes **npm**, the tool that fetches the third-party code the project depends on.

**Git** is the history-keeping tool from Chapter 4, and it's how you copy the repository to your machine. Macs usually have it already; otherwise get it from [git-scm.com](https://git-scm.com).

## Step 2: Open a terminal

The terminal is the text window where you type commands: **Terminal** on a Mac (in Applications → Utilities), **PowerShell** on Windows. You type a command, press Enter, and read what comes back. That's the whole skill.

## Step 3: Copy the project

```bash
git clone https://github.com/ahmedbins/fda_device.git
```

This downloads the entire repository — files and full history — into a folder named `fda_device`. Then move into it:

```bash
cd fda_device
```

(`cd` means "change directory" — it points your terminal at that folder.)

## Step 4: Fetch the ingredients

```bash
npm install
```

This reads `package.json` (the ingredient list from Chapter 4) and downloads every third-party package the project uses into `node_modules/`. It takes a minute or two and only needs doing once.

## Step 5: Start it

```bash
npm run dev
```

After a few seconds the terminal prints a local address — something like `http://localhost:3000`. Open that in your browser, and there's the site, running entirely from the files on your machine. It behaves exactly like the published version — the searches still go to the real government APIs.

The site keeps running as long as that terminal window stays open. Press `Ctrl+C` in the terminal to stop it.

## Step 6 (bonus): Run the safety checks

```bash
npm test
```

This is the build-plus-every-test run from Chapter 7 — the same command a developer runs before any change is published. Watching a few hundred checks pass in a couple of minutes makes Chapter 7 concrete in a way words can't.

## If something goes wrong

- **"command not found: npm"** — Node.js isn't installed or the terminal needs restarting after the install.
- **Errors during `npm install`** — most often a network hiccup; run it again.
- **The engine version complaint** — your Node.js is older than 22.13; reinstall the current LTS from nodejs.org.

None of this can harm the published site. Everything in this chapter happens only on your machine — publishing requires credentials you don't have lying around, which is exactly how it should be.

## The end — and where to go next

You now know what this site is for, how any website works, what an API is, how this project's folders fit together, what happens during a search, how the site stays honest when sources fail, how it's tested, and how it reaches the internet. That's genuinely the whole shape of the project — everything else is detail.

When you want the detail: the [main README](../README.md) has the developer-oriented overview, and [docs/](../docs/) holds the technical references — [architecture](../docs/ARCHITECTURE.md), [data sources and provenance](../docs/DATA-SOURCES.md), and the [release procedure](../docs/DEPLOYMENT.md). They'll read very differently now that you've seen the ideas behind them.

Thanks for reading.

---

*[← Chapter 8](08-how-the-website-goes-live.md) · [Guide home](README.md) · [Glossary →](glossary.md)*
