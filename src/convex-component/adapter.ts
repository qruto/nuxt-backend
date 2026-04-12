import { v } from 'convex/values'
import { mutation, query } from './_generated/server.js'
import { components } from './_generated/api.js'

// Proxy adapter functions that forward to the betterAuth child component.
// We use v.any() for args — actual validation happens at the betterAuth level.

export const create = mutation({
  args: {
    input: v.any(),
    select: v.optional(v.any()),
    onCreateHandle: v.optional(v.string()),
  },
  returns: v.any(),
  handler: async (ctx, args) => {
    return ctx.runMutation(components.betterAuth.adapter.create, args)
  },
})

export const findOne = query({
  args: {
    model: v.any(),
    where: v.optional(v.any()),
    select: v.optional(v.any()),
    join: v.optional(v.any()),
  },
  returns: v.any(),
  handler: async (ctx, args) => {
    return ctx.runQuery(components.betterAuth.adapter.findOne, args)
  },
})

export const findMany = query({
  args: {
    model: v.any(),
    where: v.optional(v.any()),
    select: v.optional(v.any()),
    limit: v.optional(v.number()),
    sortBy: v.optional(v.any()),
    offset: v.optional(v.number()),
    join: v.optional(v.any()),
    paginationOpts: v.any(),
  },
  returns: v.any(),
  handler: async (ctx, args) => {
    return ctx.runQuery(components.betterAuth.adapter.findMany, args)
  },
})

export const updateOne = mutation({
  args: {
    input: v.any(),
    onUpdateHandle: v.optional(v.string()),
  },
  returns: v.any(),
  handler: async (ctx, args) => {
    return ctx.runMutation(components.betterAuth.adapter.updateOne, args)
  },
})

export const updateMany = mutation({
  args: {
    input: v.any(),
    paginationOpts: v.any(),
    onUpdateHandle: v.optional(v.string()),
  },
  returns: v.any(),
  handler: async (ctx, args) => {
    return ctx.runMutation(components.betterAuth.adapter.updateMany, args)
  },
})

export const deleteOne = mutation({
  args: {
    input: v.any(),
    onDeleteHandle: v.optional(v.string()),
  },
  returns: v.any(),
  handler: async (ctx, args) => {
    return ctx.runMutation(components.betterAuth.adapter.deleteOne, args)
  },
})

export const deleteMany = mutation({
  args: {
    input: v.any(),
    paginationOpts: v.any(),
    onDeleteHandle: v.optional(v.string()),
  },
  returns: v.any(),
  handler: async (ctx, args) => {
    return ctx.runMutation(components.betterAuth.adapter.deleteMany, args)
  },
})
