<template>
  <div>
    <h1>Convex Auth example</h1>
    <p>
      nuxt-backend in Convex Auth mode: sign-in through <code>@convex-dev/auth</code>, with a username
      and a password.
    </p>
    <Authenticated>
      <p><NuxtLink to="/account">Open your account</NuxtLink></p>
    </Authenticated>
    <Unauthenticated>
      <p><NuxtLink to="/login">Sign in or create an account</NuxtLink></p>
    </Unauthenticated>
  </div>
</template>
