# Chapter 1: What this website does

*[← Guide home](README.md) · [Next: What a website is made of →](02-what-a-website-is-made-of.md)*

---

## The problem

Medical devices — hearing aids, pacemakers, insulin pumps — are regulated. Before a company can sell one, and while it stays on the market, government agencies keep official records about it:

- **The FDA** (United States Food and Drug Administration) tracks which companies are registered to make devices, which devices they list, which devices got cleared for sale, which were recalled, and which had problems reported.
- **The FCC** (United States Federal Communications Commission) tracks any device that uses radio waves — which includes modern hearing aids, because they use Bluetooth. Every such device needs an FCC authorization before it can be sold in the US.
- **Health Canada** keeps a list of every medical device licensed for sale in Canada, called **MDALL** (the Medical Devices Active Licence Listing).

All of this information is **public**. Anyone can look at it. But it lives on three different government websites, each with its own clunky search form, its own vocabulary, and no easy way to watch for *new* activity. If your job involves keeping an eye on these records — say, for Sonova, a company that makes hearing aids — checking three sites by hand is slow and easy to get wrong.

## The solution

This project is the **Sonova Regulatory Data Hub**: one website that talks to all three government sources and presents their records in a single, consistent place.

The site gives you two ways to look at each source:

- **Explorer** — for searching. "Show me every device Sonova has registered with the FDA." You can filter results, open the details of any record, and download the results as a spreadsheet.
- **Monitoring** — for watching. "What happened recently?" It shows new FDA clearances, new recalls, new adverse-event reports, new FCC authorizations, and newly issued or ended Canadian licences.

Three sources × two views = six screens, and that's the whole app:

|  | FDA | FCC | Health Canada |
| --- | --- | --- | --- |
| **Explorer** | Search registrations & listed devices | Search FCC IDs & authorizations | Search Canadian licences |
| **Monitoring** | Recent clearances, recalls, adverse events | Recent authorizations & changes | Recently issued/ended licences |

## One rule above all others

This site deals with regulatory records, so it follows one strict rule everywhere: **never make anything up, and always show your sources.**

Every record on the site keeps a visible link back to the official government page it came from, along with a timestamp of when it was retrieved. When the site adds a label of its own (for example, sorting FCC filings into simple categories like "Original authorization"), it keeps the government's original wording visible right beside it. If a data source can't be reached, the site says so plainly instead of quietly showing an empty list that could be mistaken for "no records exist."

You'll see this rule come up again and again in this guide, because a lot of the design decisions only make sense in its light.

## There are actually two copies of the site

The same website is published to two addresses:

- **Main** — the stable version everyone uses.
- **Internal Use Only** — a second copy where new changes go first, so they can be checked by a person before the main site is updated.

Think of it like a restaurant that tastes every new dish in the kitchen before putting it on the menu. Chapter 8 explains exactly how this works.

## What's next

Before we look at how *this* website is built, it helps to understand how *any* website works. That's Chapter 2 — and it's shorter than you'd think.

---

*[← Guide home](README.md) · [Next: What a website is made of →](02-what-a-website-is-made-of.md)*
