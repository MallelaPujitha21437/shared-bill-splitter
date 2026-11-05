import { Hono } from 'hono'

const app = new Hono<{ Bindings: Env }>()

// Health check
app.get('/api/health', (c) => {
  return c.json({ status: 'ok' })
})

// Get a home with its members, bills, and shares
app.get('/api/homes/:homeId', async (c) => {
  const homeId = c.req.param('homeId')

  // Find the home
  const home = await c.env.DB.prepare('SELECT id, name FROM homes WHERE id = ?')
    .bind(homeId)
    .first<{ id: string; name: string }>()

  if (!home) {
    return c.json({ error: 'Home not found' }, 404)
  }

  // Get all members of the home
  const membersResult = await c.env.DB.prepare(
    `SELECT id, home_id, name
     FROM members
     WHERE home_id = ?
     ORDER BY rowid ASC`,
  )
    .bind(homeId)
    .all<{
      id: string
      home_id: string
      name: string
    }>()

  // Get all bills of the home
  const billsResult = await c.env.DB.prepare(
    `SELECT id, home_id, title, total_cents
     FROM bills
     WHERE home_id = ?
     ORDER BY rowid ASC`,
  )
    .bind(homeId)
    .all<{
      id: string
      home_id: string
      title: string
      total_cents: number
    }>()

  // Get all shares belonging to the home's bills
  const sharesResult = await c.env.DB.prepare(
    `SELECT
       s.id,
       s.bill_id,
       s.member_id,
       s.amount_cents,
       s.paid_at
     FROM shares s
     INNER JOIN bills b ON b.id = s.bill_id
     WHERE b.home_id = ?
     ORDER BY s.rowid ASC`,
  )
    .bind(homeId)
    .all<{
      id: string
      bill_id: string
      member_id: string
      amount_cents: number
      paid_at: string | null
    }>()

  // Convert database member fields to API response fields
  const members = membersResult.results.map((member) => ({
    id: member.id,
    homeId: member.home_id,
    name: member.name,
  }))

  // Combine each bill with its shares
  const bills = billsResult.results.map((bill) => ({
    id: bill.id,
    homeId: bill.home_id,
    title: bill.title,
    totalCents: bill.total_cents,
    shares: sharesResult.results
      .filter((share) => share.bill_id === bill.id)
      .map((share) => ({
        id: share.id,
        memberId: share.member_id,
        amountCents: share.amount_cents,
        paidAt: share.paid_at,
      })),
  }))

  return c.json({
    home,
    members,
    bills,
  })
})

// Create a home
app.post('/api/homes', async (c) => {
  let body: unknown

  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400)
  }

  if (typeof body !== 'object' || body === null || !('name' in body)) {
    return c.json({ error: 'Name is required' }, 400)
  }

  if (typeof body.name !== 'string' || body.name.trim() === '') {
    return c.json({ error: 'Name is required' }, 400)
  }

  const id = crypto.randomUUID()
  const name = body.name.trim()

  await c.env.DB.prepare('INSERT INTO homes (id, name) VALUES (?, ?)').bind(id, name).run()

  return c.json({ id, name }, 201)
})

// Add a member to a home
app.post('/api/homes/:homeId/members', async (c) => {
  const homeId = c.req.param('homeId')

  const home = await c.env.DB.prepare('SELECT id FROM homes WHERE id = ?')
    .bind(homeId)
    .first<{ id: string }>()

  if (!home) {
    return c.json({ error: 'Home not found' }, 404)
  }

  let body: unknown

  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400)
  }

  if (typeof body !== 'object' || body === null || !('name' in body)) {
    return c.json({ error: 'Name is required' }, 400)
  }

  if (typeof body.name !== 'string' || body.name.trim() === '') {
    return c.json({ error: 'Name is required' }, 400)
  }

  const id = crypto.randomUUID()
  const name = body.name.trim()

  await c.env.DB.prepare('INSERT INTO members (id, home_id, name) VALUES (?, ?, ?)')
    .bind(id, homeId, name)
    .run()

  return c.json({ id, homeId, name }, 201)
})

// Create a bill and split it among home members
app.post('/api/homes/:homeId/bills', async (c) => {
  const homeId = c.req.param('homeId')

  const home = await c.env.DB.prepare('SELECT id FROM homes WHERE id = ?')
    .bind(homeId)
    .first<{ id: string }>()

  if (!home) {
    return c.json({ error: 'Home not found' }, 404)
  }

  let body: unknown

  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400)
  }

  if (typeof body !== 'object' || body === null) {
    return c.json({ error: 'Invalid request body' }, 422)
  }

  const { title, totalCents } = body as {
    title?: unknown
    totalCents?: unknown
  }

  if (
    typeof title !== 'string' ||
    title.trim() === '' ||
    typeof totalCents !== 'number' ||
    !Number.isSafeInteger(totalCents) ||
    totalCents <= 0
  ) {
    return c.json({ error: 'Invalid title or total amount' }, 422)
  }

  const members = await c.env.DB.prepare(
    'SELECT id FROM members WHERE home_id = ? ORDER BY rowid ASC',
  )
    .bind(homeId)
    .all<{ id: string }>()

  if (members.results.length === 0) {
    return c.json({ error: 'Home has no members' }, 422)
  }

  const billId = crypto.randomUUID()
  const billTitle = title.trim()
  const memberCount = members.results.length

  const baseAmount = Math.floor(totalCents / memberCount)
  const extraCents = totalCents % memberCount

  const shares: {
    id: string
    memberId: string
    amountCents: number
    paidAt: null
  }[] = []

  const billStatement = c.env.DB.prepare(
    'INSERT INTO bills (id, home_id, title, total_cents) VALUES (?, ?, ?, ?)',
  ).bind(billId, homeId, billTitle, totalCents)

  const shareStatements = members.results.map((member, index) => {
    const amountCents = baseAmount + (index < extraCents ? 1 : 0)
    const shareId = crypto.randomUUID()

    shares.push({
      id: shareId,
      memberId: member.id,
      amountCents,
      paidAt: null,
    })

    return c.env.DB.prepare(
      'INSERT INTO shares (id, bill_id, member_id, amount_cents) VALUES (?, ?, ?, ?)',
    ).bind(shareId, billId, member.id, amountCents)
  })

  await c.env.DB.batch([billStatement, ...shareStatements])

  return c.json(
    {
      id: billId,
      homeId,
      title: billTitle,
      totalCents,
      shares,
    },
    201,
  )
})

// Pay an individual share
app.post('/api/bills/:billId/shares/:shareId/pay', async (c) => {
  const billId = c.req.param('billId')
  const shareId = c.req.param('shareId')

  // Every payment request must contain an idempotency key.
  const idempotencyKey = c.req.header('Idempotency-Key')

  if (!idempotencyKey || idempotencyKey.trim() === '') {
    return c.json({ error: 'Idempotency-Key header is required' }, 400)
  }

  // Check whether the bill exists.
  const bill = await c.env.DB.prepare('SELECT id FROM bills WHERE id = ?')
    .bind(billId)
    .first<{ id: string }>()

  if (!bill) {
    return c.json({ error: 'Bill not found' }, 404)
  }

  // Generate the payment timestamp.
  const paidAt = new Date().toISOString()

  // Update only if the share has not already been paid.
  // This conditional update prevents two requests from paying it twice.
  await c.env.DB.prepare(
    `UPDATE shares
       SET paid_at = ?, idempotency_key = ?
       WHERE id = ? AND bill_id = ? AND paid_at IS NULL`,
  )
    .bind(paidAt, idempotencyKey, shareId, billId)
    .run()

  // Read the share after the update.
  const share = await c.env.DB.prepare(
    `SELECT id, member_id, amount_cents, paid_at, idempotency_key
       FROM shares
       WHERE id = ? AND bill_id = ?`,
  )
    .bind(shareId, billId)
    .first<{
      id: string
      member_id: string
      amount_cents: number
      paid_at: string | null
      idempotency_key: string | null
    }>()

  if (!share) {
    return c.json({ error: 'Share not found' }, 404)
  }

  // A different key cannot pay an already-paid share.
  if (share.idempotency_key !== idempotencyKey) {
    return c.json({ error: 'Share has already been paid' }, 409)
  }

  if (!share.paid_at) {
    return c.json({ error: 'Payment could not be completed' }, 500)
  }

  // Return the existing payment result for repeated requests
  // using the same idempotency key.
  return c.json({
    id: share.id,
    memberId: share.member_id,
    amountCents: share.amount_cents,
    paidAt: share.paid_at,
  })
})

// Get outstanding balances for every member in a home
app.get('/api/homes/:homeId/balances', async (c) => {
  const homeId = c.req.param('homeId')

  // Check whether the home exists.
  const home = await c.env.DB.prepare('SELECT id FROM homes WHERE id = ?')
    .bind(homeId)
    .first<{ id: string }>()

  if (!home) {
    return c.json({ error: 'Home not found' }, 404)
  }

  // Add up only unpaid shares for each member.
  const result = await c.env.DB.prepare(
    `SELECT
         m.id AS memberId,
         m.name AS name,
         COALESCE(
           SUM(
             CASE
               WHEN s.paid_at IS NULL THEN s.amount_cents
               ELSE 0
             END
           ),
           0
         ) AS outstandingCents
       FROM members m
       LEFT JOIN shares s ON s.member_id = m.id
       WHERE m.home_id = ?
       GROUP BY m.id, m.name, m.rowid
       ORDER BY m.rowid ASC`,
  )
    .bind(homeId)
    .all<{
      memberId: string
      name: string
      outstandingCents: number
    }>()

  return c.json({
    balances: result.results,
  })
})

export default app
