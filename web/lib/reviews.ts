import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

export const getReviews = createServerFn({ method: 'GET' }).handler(async () => {
  if (process.env.PROCESS_SCRIBE_HOSTED === '1' && process.env.PROCESS_SCRIBE_LOCAL_REVIEW !== '1') return [];
  const { listReviews } = await import('../../src/review-library.js')
  return listReviews(process.env.PROCESS_SCRIBE_REVIEWS || 'output')
})

export const getReview = createServerFn({ method: 'GET' })
  .validator(z.object({ id: z.string().min(1).max(1000) }))
  .handler(async ({ data }) => {
    if (process.env.PROCESS_SCRIBE_HOSTED === '1' && process.env.PROCESS_SCRIBE_LOCAL_REVIEW !== '1') throw new Error('Local review files are available only in local review mode.');
    const { loadReview } = await import('../../src/review-library.js')
    return loadReview(process.env.PROCESS_SCRIBE_REVIEWS || 'output', data.id)
  })
