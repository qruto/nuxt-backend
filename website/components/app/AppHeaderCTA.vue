<!-- Overrides the (empty) Docus AppHeaderCTA slot to add top-level links to the
     docs and the interactive playground. -->
<template>
  <div class="hidden items-center gap-1 sm:flex">
    <UButton
      to="/getting-started/introduction"
      color="neutral"
      variant="ghost"
      label="Docs"
    />
    <UButton
      to="/playground"
      color="neutral"
      variant="ghost"
      icon="i-lucide-flask-conical"
      label="Playground"
    />
  </div>
</template>
