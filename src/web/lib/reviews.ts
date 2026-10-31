import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

export const getReviews = createServerFn({ method: 'GET' }).handler(async () => {
  if (process.env.SENDA_HOSTED === '1' && process.env.SENDA_LOCAL_REVIEW !== '1') return [];
  const { listReviews } = await import('../../core/review-library.js')
  return listReviews(process.env.SENDA_REVIEWS || 'output')
})

export const getReview = createServerFn({ method: 'GET' })
  .validator(z.object({ id: z.string().min(1).max(1000) }))
  .handler(async ({ data }) => {
    if (process.env.SENDA_HOSTED === '1' && process.env.SENDA_LOCAL_REVIEW !== '1') throw new Error('Local review files are available only in local review mode.');
    const { loadReview } = await import('../../core/review-library.js')
    return loadReview(process.env.SENDA_REVIEWS || 'output', data.id)
  })
