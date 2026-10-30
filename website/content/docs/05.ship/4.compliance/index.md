---
title: Compliance
description: "Which laws reach a client app, and who answers for what: you, the processors you use, and the billing provider as the merchant of record. Not legal advice."
kind: concept
capability: tools
navigation:
  title: Overview
  icon: i-lucide-scale
---

A product that people sign in to, pay for and create in meets seven areas of law: privacy, accessibility, AI transparency, moderation, email, subscriptions and children. For each one, this section says what the law asks, who answers for it, what the package does and what stays with you. The billing provider sells to your customers as the merchant of record, so tax and invoices are its job. The processors (your backend, host, email and monitoring services) work on your instructions. The rest is yours: your terms, your privacy notice, your decisions and your records.

::warning
**Not legal advice.** These pages summarize primary sources as they read on 2026-10-25, and link each one. Laws differ by country and change often. Confirm what applies to your app with a lawyer before you launch.
::

## The model

### Who answers for what

| Role | Who | Answers for |
|---|---|---|
| **You** | The app's owner | Your users' personal data as its controller (GDPR Art. 4(7)). You are also the trader behind the service, the provider and deployer of its AI features, the host of what people upload, and the sender of its email. |
| **Processors** | Your Convex deployment, your host, the email service, the monitoring service, the AI gateway, the bot check | Handling personal data only on your instructions, under the data processing agreement you accept with each (GDPR Art. 28). |
| **The merchant of record** | Polar, when billing is on | Selling to your customers in its own name: checkout, payment data, tax, invoices, receipts, refunds and chargebacks. Its [buyer terms](https://polar.sh/legal/checkout-buyer-terms) are the purchase contract, and it [collects VAT and sales tax](https://polar.sh/docs/merchant-of-record/introduction). |

The package is a library you run on your own accounts. It is no party to any of this: it holds no data, and its maintainers see none.

### Which laws reach you, and when

| Area | Reaches you when | Main sources | Page |
|---|---|---|---|
| Privacy and cookies | You have users in the EU, the UK or California, or you store anything in their browser | [GDPR](https://eur-lex.europa.eu/eli/reg/2016/679/oj), [ePrivacy Directive Art. 5(3)](https://eur-lex.europa.eu/eli/dir/2002/58/oj) | [Privacy, GDPR and cookies](/docs/ship/compliance/privacy) |
| Accessibility | You sell to consumers in the EU and are not a microenterprise | [European Accessibility Act](https://eur-lex.europa.eu/eli/dir/2019/882/oj), applied since 2025-06-28 | [Accessibility](/docs/ship/compliance/accessibility) |
| AI transparency | Your app generates images, audio, video or text, or chats with people | [AI Act Art. 50](https://eur-lex.europa.eu/eli/reg/2024/1689/oj), applied since 2026-08-02 | [AI transparency](/docs/ship/compliance/ai-transparency) |
| Moderation | People upload or publish content in your app | [Digital Services Act Art. 16 to 18](https://eur-lex.europa.eu/eli/reg/2022/2065/oj), the US [TAKE IT DOWN Act](https://www.congress.gov/bill/119th-congress/senate-bill/146) | [Moderation](/docs/ship/compliance/moderation) |
| Email | You send email, above all marketing email | The mailbox providers' sender rules, [CAN-SPAM](https://www.ftc.gov/business-guidance/resources/can-spam-act-compliance-guide-business), [ePrivacy Art. 13](https://eur-lex.europa.eu/eli/dir/2002/58/oj) | [Email law](/docs/ship/compliance/email-law) |
| Subscriptions | You sell plans that renew | [Consumer Rights Directive Art. 11a](https://eur-lex.europa.eu/eli/dir/2023/2673/oj), California's [automatic renewal law](https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?lawCode=BPC&sectionNum=17602) | [Subscriptions](/docs/ship/compliance/subscriptions) |
| Minimum age | Children could sign up | [COPPA Rule](https://www.ecfr.gov/current/title-16/chapter-I/subchapter-C/part-312), [GDPR Art. 8](https://eur-lex.europa.eu/eli/reg/2016/679/oj) | [Minimum age](/docs/ship/compliance/age) |

### What the package does, and what stays yours

| The package | You |
|---|---|
| Lists every piece of personal data it stores, and exports or erases all of it on request | Write your privacy notice, choose your legal bases, accept each processor's terms |
| Keeps a versioned record of each consent | Decide which consents you need and what each document says |
| Ships accessible pages and components, tested against WCAG levels A and AA | Keep your own pages accessible, and publish an accessibility statement |
| Labels AI output for people and for machines | Decide where labels show, and tell people when they talk to an AI |
| Takes notices about content and records each decision | Review the notices, decide them, and meet the deadlines |
| Separates transactional mail from marketing, and adds one-click unsubscribe | Collect consent, and put a postal address in every marketing email |
| Records the auto-renew consent at checkout | Write your terms, and set your refund policy with the billing provider |

Each page says which of these exist today and which arrive in 0.2.0, with the unit that builds them on the [Feature map](/docs/start/feature-map).

## Why it works this way

A library can make the safe path the default and keep the records an auditor asks for. It can't know your company, your users' countries or your legal basis for processing. So the package does three things and leaves the judgment to you:

- **It knows its own data.** Every table it creates is listed with what it holds, how long it keeps it, and what an export and an erasure do. A table missing from that list fails the package's tests.
- **It records.** Consents, decisions about content and renewal consent are rows with a time and a version. You answer a regulator from them, not from memory.
- **It defaults to strict.** From 0.2.0, no cookie that needs consent is set before a person agrees, marketing email needs an opt-in, and the AI label is on. You loosen a default on purpose, in your own code.

Polar as merchant of record takes the hardest part of selling across borders, tax and consumer billing, off your desk. It doesn't take the rest: Polar sells your product, but you still run the service people use.

## What it is not

- **Not legal advice, and not a certification.** Nothing here makes an app compliant on its own. A conformance claim, such as "meets WCAG 2.2 AA", needs an audit of your whole app.
- **Not tax.** The package computes no tax. Polar collects it as merchant of record.
- **Not every law.** Sector rules (health, finance, education), the UK's children's code, US state privacy laws other than California's, the Cyber Resilience Act and export controls are out of scope. The [Roadmap](/docs/start/roadmap) lists what is deferred.
- **Not a moderation team.** The package routes notices to your administrators. People still decide them.

## What this means for you

- Read [Privacy, GDPR and cookies](/docs/ship/compliance/privacy) first: it lists what each table and each provider holds, for your privacy notice.
- Check your own pages against [the accessibility rules](/docs/ship/compliance/accessibility) before launch, and publish a statement.
- If your app generates content, [label it](/docs/ship/compliance/ai-transparency).
- If people upload or publish, [set up notice and takedown](/docs/ship/compliance/moderation).
- Before your first marketing email, read [email law](/docs/ship/compliance/email-law).
- Before you sell a renewing plan, read [subscription law](/docs/ship/compliance/subscriptions).
- [Set a minimum age](/docs/ship/compliance/age) that fits your users.
- Then work through the [production checklist](/docs/ship/checklist).
