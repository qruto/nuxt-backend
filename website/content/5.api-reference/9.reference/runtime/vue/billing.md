---
navigation: true
---

# runtime/vue/billing

## Variables

### CheckoutLink

```ts
const CheckoutLink: DefineComponent<ExtractPropTypes<{
  products: {
     type: PropType<string[]>;
     required: true;
  };
  subscriptionId: {
     type: StringConstructor;
     default: undefined;
  };
  metadata: {
     type: PropType<Record<string, string>>;
     default: undefined;
  };
  trialInterval: {
     type: PropType<TrialInterval>;
     default: undefined;
  };
  trialIntervalCount: {
     type: PropType<number | null>;
     default: undefined;
  };
  locale: {
     type: StringConstructor;
     default: undefined;
  };
  theme: {
     type: PropType<CheckoutTheme>;
     default: string;
  };
  embed: {
     type: BooleanConstructor;
     default: boolean;
  };
  lazy: {
     type: BooleanConstructor;
     default: boolean;
  };
  api: {
     type: PropType<BillingApi>;
     default: undefined;
  };
}>, () => VNode<RendererNode, RendererElement, {
[key: string]: any;
}>, {
}, {
}, {
}, ComponentOptionsMixin, ComponentOptionsMixin, {
}, string, PublicProps, ToResolvedProps<ExtractPropTypes<{
  products: {
     type: PropType<string[]>;
     required: true;
  };
  subscriptionId: {
     type: StringConstructor;
     default: undefined;
  };
  metadata: {
     type: PropType<Record<string, string>>;
     default: undefined;
  };
  trialInterval: {
     type: PropType<TrialInterval>;
     default: undefined;
  };
  trialIntervalCount: {
     type: PropType<number | null>;
     default: undefined;
  };
  locale: {
     type: StringConstructor;
     default: undefined;
  };
  theme: {
     type: PropType<CheckoutTheme>;
     default: string;
  };
  embed: {
     type: BooleanConstructor;
     default: boolean;
  };
  lazy: {
     type: BooleanConstructor;
     default: boolean;
  };
  api: {
     type: PropType<BillingApi>;
     default: undefined;
  };
}>, {
}>, {
  subscriptionId: string;
  metadata: Record<string, string>;
  trialInterval: TrialInterval;
  trialIntervalCount: number | null;
  locale: string;
  theme: CheckoutTheme;
  embed: boolean;
  lazy: boolean;
  api: BillingApi;
}, SlotsType<{
  default: () => VNode<RendererNode, RendererElement, {
   [key: string]: any;
  }>[];
}>, {
}, {
}, string, ComponentProvideOptions, true, {
}, any>;
```

Defined in: [src/runtime/vue/billing/index.ts:24](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/runtime/vue/billing/index.ts#L24)

Renders a Polar checkout link — embedded modal (default) or redirect — with
optional lazy generation and trial configuration. A Vue port of
`@convex-dev/polar/react`'s `CheckoutLink`.

The `generateCheckoutLink` action comes from the auto-provided `api.billing`
namespace; pass `:api` to override.

#### Example

```vue
<CheckoutLink :products="[productId]" :trial-interval-count="7" trial-interval="day">
  Start free trial
</CheckoutLink>
```

***

### CustomerPortalLink

```ts
const CustomerPortalLink: DefineComponent<ExtractPropTypes<{
  returnUrl: {
     type: StringConstructor;
     default: undefined;
  };
  api: {
     type: PropType<BillingApi>;
     default: undefined;
  };
}>, () => 
  | VNode<RendererNode, RendererElement, {
[key: string]: any;
}>
  | null, {
}, {
}, {
}, ComponentOptionsMixin, ComponentOptionsMixin, {
}, string, PublicProps, ToResolvedProps<ExtractPropTypes<{
  returnUrl: {
     type: StringConstructor;
     default: undefined;
  };
  api: {
     type: PropType<BillingApi>;
     default: undefined;
  };
}>, {
}>, {
  returnUrl: string;
  api: BillingApi;
}, SlotsType<{
  default: () => VNode<RendererNode, RendererElement, {
   [key: string]: any;
  }>[];
}>, {
}, {
}, string, ComponentProvideOptions, true, {
}, any>;
```

Defined in: [src/runtime/vue/billing/index.ts:112](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/runtime/vue/billing/index.ts#L112)

Renders a link to the Polar customer portal (subscription management). A Vue
port of `@convex-dev/polar/react`'s `CustomerPortalLink` — renders nothing
until the portal URL resolves. Uses the auto-provided `api.billing` namespace;
pass `:api` to override.
