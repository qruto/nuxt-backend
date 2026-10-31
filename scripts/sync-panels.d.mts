/** templates/panels, where Panels is edited. */
export declare const SOURCE: string
/** The docs site, which serves Panels under {@link BASE}. */
export declare const TARGET: string
/** Where the site mounts Panels' pages. */
export declare const BASE: string
/** The line of backend/routes.ts the site's copy rewrites to {@link BASE}. */
export declare const BASE_LINE: string
/** Template files moved on the way: template-relative → site-relative. */
export declare const RENAMED: Readonly<Record<string, string>>
/** Template files never copied. */
export declare const TEMPLATE_ONLY: readonly RegExp[]
/** Site files the sync never writes nor removes. */
export declare const OWNED: readonly RegExp[]
/** A template file's site-relative path, or `null` when it is not copied. */
export declare function targetOf(file: string): string | null
/** The site's backend/routes.ts from the template's: `base` set to {@link BASE}. */
export declare function mountRoutes(text: string): string
/** Every synced site path → the content it must have. */
export declare function expected(): Map<string, string>
/** How the site differs from the template: missing, changed and stale files. */
export declare function drift(): { missing: string[], changed: string[], stale: string[] }
