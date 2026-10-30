// Where the sections of the docs went, by their old anchor. Apart from
// shared/docs-routes.ts, which the search imports on every page, so
// plugins/docs-fragments.client.ts loads it only for a URL with a fragment.
// test/docs/docs-structure.test.ts holds every entry to a live heading.

/**
 * Old anchors whose section moved to another page, keyed by the page the old
 * route now redirects to: `<page>#<old anchor>` → `<new page>#<anchor>`.
 * A redirect keeps the fragment, so the moved page loads with the old anchor
 * and the client plugin finishes the trip.
 */
export const DOCS_FRAGMENT_MOVES: Record<string, string> = {
  // Auth › Access: "custom roles" names the workspace roles owners define; the app's own are named for what they are.
  // In 0.2.0 a role is a name: the permission statements and <RoleBoundary> go (SIMPLIFY).
  '/docs/build/auth/access/roles#custom-roles-and-permissions': '/docs/build/auth/access/roles#give-a-role-of-your-own',
  '/docs/build/auth/access/roles#app-roles-and-permissions-of-your-own': '/docs/build/auth/access/roles#give-a-role-of-your-own',
  '/docs/build/auth/access/roles#roleboundary': '/docs/build/auth/access/roles#check-a-role',
  '/docs/build/auth/access/roles#impersonation': '/docs/build/auth/admin/impersonation',
  // Auth › Access: agents' scopes wait for the service-app release with the end-user MCP (DEFER).
  '/docs/build/auth/access/functions#agents': '/docs/start/roadmap#service-app-features',
  // Start: How it works names its component table for what it is.
  '/docs/start/concepts/how-it-works#what-one-call-mounts': '/docs/start/concepts/how-it-works#what-it-mounts',
  // Start: the 0.2.0 front door. The scaffold mounts what its helpers use, and agents no longer reach the backend.
  '/docs/start/concepts/how-it-works#the-scaffolded-convexconfigts-mounts-everything': '/docs/start/concepts/how-it-works#the-scaffolded-convexconfigts',
  '/docs/start/concepts/how-it-works#one-backend-component-plus-the-upstream-components': '/docs/start/concepts/how-it-works#one-backend-component-beside-the-official-ones',
  '/docs/start/concepts/how-it-works#agents-and-inbound-webhooks': '/docs/start/concepts/how-it-works#inbound-webhooks',
  // Start: the principles, named for the 0.2.0 decisions.
  '/docs/start/concepts/principles#passwordless-forever': '/docs/start/concepts/principles#email-codes-and-passkeys-only',
  '/docs/start/concepts/principles#workspaces-are-organizations': '/docs/start/concepts/principles#workspaces-everywhere',
  '/docs/start/concepts/principles#names-that-say-what-they-do': '/docs/start/concepts/principles#brand-neutral-names',
  '/docs/start/concepts/principles#all-in-one-always-on': '/docs/start/concepts/principles#capabilities-are-detected-never-switched',
  '/docs/start/concepts/principles#state-is-detected-never-configured': '/docs/start/concepts/principles#capabilities-are-detected-never-switched',
  '/docs/start/concepts/principles#simulated-providers-in-development': '/docs/start/concepts/principles#real-sandboxes-in-development',
  // Start: twelve layers in 0.2.0, the agents layer deferred.
  '/docs/start/concepts/capabilities#the-thirteen-layers': '/docs/start/concepts/capabilities#the-twelve-capabilities',
  // AI: development runs on real models (NOSIM), agents spend through no scope (DEFER), and chat drops its agent tools.
  '/docs/build/ai/models#develop-against-the-stand-in': '/docs/build/ai/models#develop-and-test',
  '/docs/build/ai/metered-actions#agents': '/docs/develop/agents/mcp',
  '/docs/build/ai/chat#define-an-agent': '/docs/build/ai/chat#define-a-chat',
  '/docs/build/ai/chat#show-threads-in-the-app': '/docs/build/ai/chat#show-it-in-a-page',
  '/docs/build/ai/chat/knowledge-search#let-an-agent-answer-from-it': '/docs/build/ai/chat/knowledge-search#ground-chat-replies-in-it',
  '/docs/build/ai/chat/knowledge-search#add-content': '/docs/build/ai/chat/knowledge-search#add-documents',
  // Agents: the tab builds with agents; the MCP endpoint for users' agents waits for the next release.
  '/docs/develop/agents#your-app-as-tools': '/docs/develop/agents/mcp',
  '/docs/develop/agents#how-an-agent-signs-in': '/docs/develop/agents/mcp',
  '/docs/develop/agents#coding-agents': '/docs/develop/agents#in-this-section',
  '/docs/develop/agents/developer-mcp#limits': '/docs/develop/agents/developer-mcp#what-it-changes-and-where',
  '/docs/start/feature-map#agents': '/docs/start/feature-map#developer-tools',
  '/docs/develop/devtools#agents': '/docs/develop/devtools#overview',
  // Start: development on real sandboxes, the first run's env in one place.
  '/docs/develop/dev-loop#sign-in-codes-origins-and-sandboxes-in-development': '/docs/develop/dev-loop#what-the-first-run-provisions',
  '/docs/start/quickstart#next-the-providers-sandbox': '/docs/start/quickstart#next-email-and-webhooks',
  '/docs/develop/sandboxes#the-billing-simulator': '/docs/develop/sandboxes#billing-on-polars-sandbox',
  '/docs/develop/sandboxes#the-simulators-pages': '/docs/develop/sandboxes#billing-on-polars-sandbox',
  '/docs/develop/sandboxes#switch-to-the-providers-sandbox': '/docs/develop/sandboxes#billing-on-polars-sandbox',
  '/docs/develop/sandboxes#email': '/docs/develop/sandboxes#email-on-resends-test-addresses',
  '/docs/develop/sandboxes#which-email-an-event-names': '/docs/develop/sandboxes#email-on-resends-test-addresses',
  '/docs/develop/sandboxes#models': '/docs/develop/sandboxes#ai-through-the-convex-ai-gateway',
  // Email: the languages have a page of their own; previews live with the templates; tasks named for what you do.
  '/docs/build/email/templates/theme#the-layout': '/docs/build/email/templates/theme#what-every-email-looks-like',
  '/docs/build/email/templates/theme#translate-the-emails': '/docs/build/email/templates/languages#translate-the-emails',
  '/docs/build/email/templates/theme#the-recipients-language': '/docs/build/email/templates/languages#the-recipients-language',
  '/docs/build/email/templates/theme#people-without-an-account': '/docs/build/email/templates/languages#people-without-an-account',
  '/docs/build/email/templates/theme#localized-links': '/docs/build/email/templates/languages#localized-links',
  '/docs/build/email/templates/theme#preview-every-email': '/docs/build/email/templates#previewing',
  '/docs/build/email/templates#overriding': '/docs/build/email/templates#override-a-template',
  '/docs/build/email/templates#taking-over-the-invitation': '/docs/build/email/sending#auth-emails-go-through-your-instance',
  '/docs/build/email/sending#setup': '/docs/build/email/sending#set-up-the-email-instance',
  '/docs/build/email/sending#sending': '/docs/build/email/sending#send-an-email',
  '/docs/build/email/sending#auth-emails-go-through-your-email-instance': '/docs/build/email/sending#auth-emails-go-through-your-instance',
  '/docs/build/email/delivery#on-a-local-deployment': '/docs/build/email/delivery#on-your-dev-deployment',
  '/docs/build/email/delivery#useemailstatus': '/docs/build/email/delivery#show-the-status-in-a-page',
  '/docs/build/email/preferences#the-preferences-page': '/docs/build/email/preferences#the-unsubscribe-page',
  '/docs/build/email/notifications#show-the-bell': '/docs/build/email/notifications#show-the-inbox',
  // Ship › Operate: the sign-in code is called a code, not an OTP.
  '/docs/ship/operate/troubleshooting#the-otp-email-never-arrives': '/docs/ship/operate/troubleshooting#the-sign-in-code-never-arrives',
  // Start: the Quickstart's sign-in step is named for what you do, not the jargon.
  '/docs/start/quickstart#sign-in-with-the-console-otp': '/docs/start/quickstart#sign-in-with-the-code-in-the-terminal',
  // AI: limits and budgets have a page of their own.
  '/docs/build/ai/metered-actions#rate-limits': '/docs/build/ai/models#limit-calls',
  // Auth › Access: the function builders have a page of their own.
  '/docs/build/auth/access/roles#pre-authorized-function-builders': '/docs/build/auth/access/functions',
  // Auth › Sign-in: guarding pages moved to Protect pages and routes; invitations have a page of their own.
  '/docs/build/auth/sign-in#protecting-routes': '/docs/build/auth/access/pages#ask-for-a-sign-in',
  '/docs/build/auth/sign-in#when-the-session-ends': '/docs/build/auth/access/pages#when-the-session-ends',
  '/docs/build/auth/sign-in#auth-state-components': '/docs/build/auth/access/pages#show-parts-of-a-page-by-auth-state',
  '/docs/build/auth/sign-in#advanced-low-level-auth-helpers': '/docs/build/auth/access/pages#show-parts-of-a-page-by-auth-state',
  '/docs/build/auth/sign-in#workspace-invitations': '/docs/build/auth/workspaces/invitations',
  '/docs/build/auth/workspaces#invitations-end-to-end': '/docs/build/auth/workspaces/invitations',
  '/docs/build/auth/workspaces#customizing-the-flow': '/docs/build/auth/workspaces/invitations#change-the-email-the-link-or-the-page',
  // Data › Files (FILES): the composables over your own storage functions gave way to setupStorage.
  '/docs/build/data/files#write-the-storage-functions': '/docs/build/data/files/checked-uploads#set-up-storage',
  '/docs/build/data/files#useupload': '/docs/build/data/files/checked-uploads#upload-a-large-file-with-an-upload-url',
  '/docs/build/data/files#storageimage': '/docs/build/data/files/images#show-one-file',
  // Data: counts and sums became a recipe on the official components (SIMPLIFY).
  '/docs/build/data/read-write/aggregates#count-a-table': '/docs/build/data/read-write/aggregates#count-a-workspaces-strips',
  '/docs/build/data/read-write/aggregates#sums-and-more-instances': '/docs/build/data/read-write/aggregates#sums-ranks-and-a-second-aggregate',
  // Email: one task per page.
  '/docs/build/email/sending#sandbox-inbox': '/docs/develop/dev-inbox',
  '/docs/build/email/sending#sequences-and-workflows': '/docs/build/growth/engage/lifecycle-emails',
  '/docs/build/email/sending#marketing': '/docs/build/growth/engage/announcements#marketing-email',
  '/docs/build/data/jobs/workflows#welcome-email-flow': '/docs/build/growth/engage/lifecycle-emails#start-it-on-sign-up',
  // Billing: one task per page.
  '/docs/build/billing/subscriptions#checkout-portal-plan-changes': '/docs/build/billing/subscriptions/checkout',
  '/docs/build/billing/subscriptions#order-history-and-invoices': '/docs/build/billing/subscriptions/orders',
  '/docs/build/billing/credits#spending-on-the-server': '/docs/build/billing/credits/spending',
  '/docs/build/billing/credits#reserve-run-settle': '/docs/build/billing/credits/spending#reserve-run-settle',
  '/docs/build/billing/credits#sum-meters-vs-count-meters': '/docs/build/billing/credits/spending#sum-meters-vs-count-meters',
  // Billing: setting up has a page of its own, and Subscriptions became Manage subscriptions.
  '/docs/build/billing/subscriptions#server-setup': '/docs/build/billing/setup',
  '/docs/build/billing/subscriptions#environment': '/docs/build/billing/setup#environment',
  '/docs/build/billing/subscriptions#one-customer-per-billing-entity': '/docs/build/billing/setup#one-customer-per-billing-entity',
  '/docs/build/billing/subscriptions#reading-subscription-state': '/docs/build/billing/subscriptions#read-the-subscription',
  // UI › Customize became one page per rung.
  '/docs/build/ui/customize#_1-css-tokens': '/docs/build/ui/customize/tokens',
  '/docs/build/ui/customize#the---bk--tokens': '/docs/build/ui/customize/tokens#the---bk--tokens',
  '/docs/build/ui/customize#data--families': '/docs/build/ui/customize/tokens#data--families',
  '/docs/build/ui/customize#packaging': '/docs/build/ui/customize/tokens#packaging',
  '/docs/build/ui/customize#_2-appconfig-content': '/docs/build/ui/customize/labels',
  '/docs/build/ui/customize#_3-slots': '/docs/build/ui/customize/slots',
  '/docs/build/ui/customize#props-and-emits': '/docs/build/ui/customize/slots#props-and-emits',
  '/docs/build/ui/customize#_4-route-shadowing': '/docs/build/ui/customize/parts#replace-a-page',
  '/docs/build/ui/customize#_5-composables': '/docs/build/ui/customize/parts#build-from-composables',
  // Configuration became an orientation page: its sections have pages of their own.
  '/docs/reference/configuration#module-options': '/docs/reference/configuration/module-options#options',
  '/docs/reference/configuration#runtime-config': '/docs/reference/configuration/module-options#runtime-config',
  '/docs/reference/configuration#environment-variables': '/docs/reference/configuration/environment-variables',
  '/docs/reference/configuration#app-variables': '/docs/reference/configuration/environment-variables#app-variables',
  '/docs/reference/configuration#convex-deployment-variables': '/docs/reference/configuration/environment-variables#convex-deployment-variables',
  '/docs/reference/configuration#setting-them': '/docs/reference/configuration/environment-variables#setting-them',
  '/docs/reference/configuration#changing-the-auth-route': '/docs/build/auth/setup#auth-route-and-options',
  // Start (D5): the Introduction is for evaluators; what it listed has pages of its own.
  '/docs/start#two-layers-in-one-package': '/docs/start/concepts/how-it-works',
  '/docs/start#what-the-module-provides': '/docs/start/what-you-got',
  '/docs/start#official-integration-parity': '/docs/start/concepts/nuxt-convex-module#official-integration-parity',
  '/docs/start#what-you-get': '/docs/start/what-you-got#the-inventory',
  // Start (D5): the Quickstart is two checkpoints on the simulator, with no deploy step.
  '/docs/start/quickstart#install-the-module': '/docs/start/quickstart#create-the-app',
  '/docs/start/quickstart#start-convex-and-nuxt': '/docs/start/quickstart#start-it',
  '/docs/start/quickstart#declare-a-billing-catalog-and-sync-it': '/docs/start/quickstart#checkpoint-2-credits-bought-and-spent',
  '/docs/start/quickstart#spend-credits': '/docs/start/quickstart#spend-a-credit',
  '/docs/start/quickstart#deploy': '/docs/ship/deploy',
  // Start (D5): Installation is three tabs; the env tables, the env split and upgrading have their homes.
  '/docs/start/installation#with-an-ai-agent': '/docs/start/installation#install',
  '/docs/start/installation#prerequisites': '/docs/start/installation#before-you-start',
  '/docs/start/installation#install-the-package': '/docs/start/installation#install',
  '/docs/start/installation#add-the-nuxt-module': '/docs/start/installation#install',
  '/docs/start/installation#configure-environment-variables': '/docs/reference/configuration/environment-variables',
  '/docs/start/installation#deployment-environment': '/docs/start/concepts/environments#the-apps-env-and-the-deployments',
  '/docs/start/installation#start-the-app-once-to-scaffold-the-backend': '/docs/start/what-you-got',
  '/docs/start/installation#start-convex-and-nuxt': '/docs/start/installation#start-it',
  '/docs/start/installation#optional-override-module-defaults': '/docs/reference/configuration/module-options',
  '/docs/start/installation#upgrading': '/docs/ship/releases/upgrade',
  // Ship › Deploy (D8): previews, self-hosting and the providers have pages of their own.
  '/docs/ship/deploy#preview-deployments': '/docs/ship/deploy/previews',
  '/docs/ship/deploy#custom-domains': '/docs/ship/deploy/self-hosting#add-custom-domains',
  '/docs/ship/deploy#self-hosted-convex': '/docs/ship/deploy/self-hosting#self-host-the-backend',
  '/docs/ship/deploy#billing-and-email-in-production': '/docs/services#provider-setup',
  // Agents › Coding: one core skill became a core and its task skills.
  '/docs/develop/agents#the-agent-skill': '/docs/develop/agents#the-agent-skills',
  // Agents › Coding: what init writes for agents has a page of its own.
  '/docs/develop/agents#what-init-writes': '/docs/develop/agents/agent-files#what-init-writes',
  '/docs/develop/agents#convexs-own-tooling': '/docs/develop/agents/agent-files#convexs-own-tooling',
  // Ship: 0.2.0 serves client apps; agent tokens and the dev-only env flags are gone (DEFER, ENV).
  '/docs/ship/operate/troubleshooting#sessions-or-agent-tokens-fail-after-rotating-auth_secret': '/docs/ship/operate/troubleshooting#sessions-fail-after-changing-auth_secret-by-hand',
  '/docs/ship/security#origins-and-dev-flags': '/docs/ship/security#origins-in-development',
  '/docs/ship/security#oauth-consent-what-an-agent-can-do': '/docs/start/roadmap#service-app-features',
  // Docs v3: Reference › Layers became Capabilities, its generated section with it.
  '/docs/reference/capabilities#every-layer': '/docs/reference/capabilities#every-capability',

  // Docs v3 writer lanes: each lane adds its fragment moves between its own two lines only.
  // lane 1: start
  // Start: "app layers" became capabilities (RENAME).
  '/docs/start/concepts/principles#layers-are-detected-never-switched': '/docs/start/concepts/principles#capabilities-are-detected-never-switched',
  '/docs/start/concepts/capabilities#the-twelve-layers': '/docs/start/concepts/capabilities#the-twelve-capabilities',
  '/docs/start/concepts/capabilities#a-layers-state-is-detected': '/docs/start/concepts/capabilities#a-capabilitys-state-is-detected',
  '/docs/start/concepts/capabilities#where-you-see-a-layers-state': '/docs/start/concepts/capabilities#where-you-see-a-capabilitys-state',
  // end lane 1
  // lane 2: services and ship
  // Services: the providers' sections of the Service map became a page per service.
  '/docs/services#billing': '/docs/services/polar',
  '/docs/services#email': '/docs/services/resend',
  '/docs/services#bot-protection': '/docs/services/bot-protection',
  '/docs/services#ai': '/docs/services/ai-gateway',
  '/docs/services#monitoring': '/docs/services/sentry',
  '/docs/services#the-convex-deployment': '/docs/services/convex',
  // Ship › Operate: layers became capabilities.
  '/docs/ship/operate#check-the-layers': '/docs/ship/operate#check-the-capabilities',
  // end lane 2
  // lane 3: develop and reference
  // Develop › Testing: the one page split into an overview and a page per level.
  '/docs/develop/testing#your-app-under-test': '/docs/develop/testing/functions#your-app-under-test',
  '/docs/develop/testing#register-the-component-yourself': '/docs/develop/testing/functions#register-the-component-yourself',
  '/docs/develop/testing#test-pages-and-components': '/docs/develop/testing/pages',
  '/docs/develop/testing#set-up-the-project': '/docs/develop/testing/pages#set-up-the-project',
  '/docs/develop/testing#write-a-test': '/docs/develop/testing/pages#write-a-test',
  '/docs/develop/testing#check-accessibility': '/docs/develop/testing/pages#check-accessibility',
  '/docs/develop/testing#test-your-emails': '/docs/develop/testing/pages#test-your-emails',
  // Develop › Agents: the skills reference has a page of its own.
  '/docs/develop/agents#install-the-skills-on-their-own': '/docs/develop/agents/skills#install-the-skills-on-their-own',
  // Reference › Glossary: the app layers are capabilities.
  '/docs/reference/glossary#app-layer': '/docs/reference/glossary#capability',
  // end lane 3
  // lane 4: auth
  // end lane 4
  // lane 5: billing and growth
  // end lane 5
  // lane 6: email and ai
  // end lane 6
  // lane 7: data and ui
  '/docs/build/data/files/checked-uploads#upload-from-a-page': '/docs/build/data/files/checked-uploads#upload-a-large-file-with-an-upload-url',
  '/docs/build/data/files/images#the-image-provider': '/docs/build/data/files/images#resize-with-the-image-provider',
  '/docs/build/data/read-write/aggregates#count-a-workspaces-stories': '/docs/build/data/read-write/aggregates#count-a-workspaces-strips',
  '/docs/build/ui/customize/headless#with-nuxt-ui': '/docs/build/ui/customize/headless#use-it-beside-any-ui-library',
  '/docs/build/ui/customize/tokens#on-nuxt-ui-and-color-mode': '/docs/build/ui/customize/tokens#follow-light-and-dark',
  // end lane 7
  // lane 8: compliance
  // end lane 8
}
