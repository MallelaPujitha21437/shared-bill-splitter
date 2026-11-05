import { createFileRoute } from '@tanstack/react-router'
import { useCallback, useEffect, useState } from 'react'

export const Route = createFileRoute('/')({
  component: Home,
})

type HomeRecord = {
  id: string
  name: string
}

type Member = {
  id: string
  homeId: string
  name: string
}

type Share = {
  id: string
  memberId: string
  amountCents: number
  paidAt: string | null
}

type Bill = {
  id: string
  homeId: string
  title: string
  totalCents: number
  shares: Share[]
}

type Balance = {
  memberId: string
  name: string
  outstandingCents: number
}

async function apiRequest<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  })

  const data: unknown = await response.json()

  if (!response.ok) {
    const message =
      typeof data === 'object' && data !== null && 'error' in data && typeof data.error === 'string'
        ? data.error
        : 'Something went wrong'

    throw new Error(message)
  }

  return data as T
}

function formatMoney(cents: number) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
  }).format(cents / 100)
}

function Home() {
  const [home, setHome] = useState<HomeRecord | null>(null)
  const [members, setMembers] = useState<Member[]>([])
  const [bills, setBills] = useState<Bill[]>([])
  const [balances, setBalances] = useState<Balance[]>([])

  const [homeName, setHomeName] = useState('')
  const [memberName, setMemberName] = useState('')
  const [billTitle, setBillTitle] = useState('')
  const [billAmount, setBillAmount] = useState('')

  const [loading, setLoading] = useState(false)
  const [payingShare, setPayingShare] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [initializing, setInitializing] = useState(true)

  const refreshBalances = useCallback(async (homeId: string) => {
    const result = await apiRequest<{ balances: Balance[] }>(`/api/homes/${homeId}/balances`)

    setBalances(result.balances)
  }, [])
  useEffect(() => {
    async function loadSavedHome() {
      const savedHomeId = localStorage.getItem('shared-bill-splitter-home-id')

      if (!savedHomeId) {
        setInitializing(false)
        return
      }

      try {
        const result = await apiRequest<{
          home: HomeRecord
          members: Member[]
          bills: Bill[]
        }>(`/api/homes/${savedHomeId}`)

        setHome(result.home)
        setMembers(result.members)
        setBills(result.bills)

        await refreshBalances(savedHomeId)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unable to load saved home')
      } finally {
        setInitializing(false)
      }
    }

    loadSavedHome()
  }, [refreshBalances])

  async function createHome(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setMessage('')
    setLoading(true)

    try {
      const result = await apiRequest<HomeRecord>('/api/homes', {
        method: 'POST',
        body: JSON.stringify({ name: homeName }),
      })

      setHome(result)
      localStorage.setItem('shared-bill-splitter-home-id', result.id)
      setMembers([])
      setBills([])
      setBalances([])
      setHomeName('')
      setMessage('Home created successfully!')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create home')
    } finally {
      setLoading(false)
    }
  }

  async function addMember(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!home) return

    setError('')
    setMessage('')
    setLoading(true)

    try {
      const result = await apiRequest<Member>(`/api/homes/${home.id}/members`, {
        method: 'POST',
        body: JSON.stringify({ name: memberName }),
      })

      setMembers((previous) => [...previous, result])
      setMemberName('')
      setMessage('Member added successfully!')
      await refreshBalances(home.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to add member')
    } finally {
      setLoading(false)
    }
  }

  async function createBill(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!home) return

    setError('')
    setMessage('')

    if (!/^\d+(\.\d{1,2})?$/.test(billAmount)) {
      setError('Enter a valid amount with up to 2 decimal places.')
      return
    }

    const totalCents = Math.round(Number(billAmount) * 100)

    if (!Number.isSafeInteger(totalCents) || totalCents <= 0) {
      setError('Bill amount must be greater than zero.')
      return
    }

    setLoading(true)

    try {
      const result = await apiRequest<Bill>(`/api/homes/${home.id}/bills`, {
        method: 'POST',
        body: JSON.stringify({
          title: billTitle,
          totalCents,
        }),
      })

      setBills((previous) => [...previous, result])
      setBillTitle('')
      setBillAmount('')
      setMessage('Bill created and split successfully!')
      await refreshBalances(home.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create bill')
    } finally {
      setLoading(false)
    }
  }

  async function payShare(billId: string, shareId: string) {
    setError('')
    setMessage('')
    setPayingShare(shareId)

    try {
      const paymentResult = await apiRequest<Share>(`/api/bills/${billId}/shares/${shareId}/pay`, {
        method: 'POST',
        headers: {
          'Idempotency-Key': crypto.randomUUID(),
        },
      })

      setBills((previous) =>
        previous.map((bill) =>
          bill.id === billId
            ? {
                ...bill,
                shares: bill.shares.map((share) =>
                  share.id === shareId ? { ...share, paidAt: paymentResult.paidAt } : share,
                ),
              }
            : bill,
        ),
      )

      if (home) {
        await refreshBalances(home.id)
      }

      setMessage('Payment successful!')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Payment failed')
    } finally {
      setPayingShare(null)
    }
  }

  const totalOutstanding = balances.reduce((total, balance) => total + balance.outstandingCents, 0)

  return (
    <main className="page">
      <style>{`
        * { box-sizing: border-box; }
        body {
          margin: 0;
          background: #f4f6fb;
          color: #202938;
          font-family: Arial, sans-serif;
        }
        .page {
          max-width: 1050px;
          margin: 0 auto;
          padding: 32px 20px;
        }
        .header { margin-bottom: 28px; }
        .header h1 { margin-bottom: 8px; color: #263b70; }
        .subtitle { color: #687386; }
        .card {
          background: white;
          padding: 24px;
          margin-bottom: 22px;
          border-radius: 12px;
          border: 1px solid #e5e9f1;
          box-shadow: 0 3px 12px rgba(0,0,0,.035);
        }
        h2 { margin-top: 0; font-size: 20px; }
        input {
          display: block;
          width: 100%;
          padding: 12px;
          margin: 10px 0;
          border: 1px solid #ccd3df;
          border-radius: 7px;
          font-size: 15px;
        }
        button {
          padding: 11px 18px;
          border: 0;
          border-radius: 7px;
          background: #3156a5;
          color: white;
          cursor: pointer;
          font-size: 14px;
        }
        button:disabled { opacity: .55; cursor: not-allowed; }
        .secondary { background: #e9eef9; color: #263b70; }
        .success { color: #16834b; }
        .error { color: #c0392b; }
        .muted { color: #758094; }
        .member, .share, .balance {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 12px;
          padding: 12px 0;
          border-bottom: 1px solid #edf0f5;
        }
        .member:last-child, .share:last-child, .balance:last-child {
          border-bottom: 0;
        }
        .status-paid { color: #16834b; font-weight: bold; }
        .status-unpaid { color: #c17b17; font-weight: bold; }
        .bill-total { font-weight: bold; color: #263b70; }
        .summary {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 16px;
        }
        .summary-box {
          background: #eef2fc;
          border-radius: 9px;
          padding: 18px;
        }
        .summary-box strong {
          display: block;
          font-size: 23px;
          margin-top: 8px;
        }
        @media (max-width: 600px) {
          .page { padding: 20px 14px; }
          .card { padding: 18px; }
          .summary { grid-template-columns: 1fr; }
        }
      `}</style>

      <header className="header">
        <h1>Shared Bill Splitter</h1>
        <p className="subtitle">Manage household expenses and track who owes what.</p>
      </header>

      {error && (
        <div className="card error" role="alert">
          {error}
        </div>
      )}
      {message && (
        <div className="card success" role="status">
          {message}
        </div>
      )}

      {initializing ? (
        <section className="card">
          <p className="muted">Loading your saved home...</p>
        </section>
      ) : !home ? (
        <section className="card">
          <h2>Create your home</h2>
          <p className="muted">Start by creating a shared home.</p>

          <form onSubmit={createHome}>
            <input
              value={homeName}
              onChange={(event) => setHomeName(event.target.value)}
              placeholder="Enter home name"
              required
              maxLength={100}
            />
            <button type="submit" disabled={loading}>
              {loading ? 'Creating...' : 'Create Home'}
            </button>
          </form>
        </section>
      ) : (
        <>
          <section className="card">
            <h2>{home.name}</h2>
            <p className="muted">Home ID: {home.id}</p>
          </section>

          <section className="card">
            <h2>Members ({members.length})</h2>

            <form onSubmit={addMember}>
              <input
                value={memberName}
                onChange={(event) => setMemberName(event.target.value)}
                placeholder="Enter member name"
                required
                maxLength={100}
              />
              <button type="submit" disabled={loading}>
                {loading ? 'Adding...' : 'Add Member'}
              </button>
            </form>

            {members.length === 0 ? (
              <p className="muted">No members yet. Add your first member.</p>
            ) : (
              members.map((member) => (
                <div className="member" key={member.id}>
                  <span>{member.name}</span>
                  <span className="muted">Member</span>
                </div>
              ))
            )}
          </section>

          <section className="card">
            <h2>Create a bill</h2>

            <form onSubmit={createBill}>
              <input
                value={billTitle}
                onChange={(event) => setBillTitle(event.target.value)}
                placeholder="Bill title (e.g. Groceries)"
                required
                maxLength={150}
              />
              <input
                type="number"
                value={billAmount}
                onChange={(event) => setBillAmount(event.target.value)}
                placeholder="Total amount in ₹"
                min="0.01"
                step="0.01"
                required
              />
              <button type="submit" disabled={loading || members.length === 0}>
                {loading ? 'Creating...' : 'Create and Split Bill'}
              </button>
            </form>

            {members.length === 0 && <p className="muted">Add members before creating a bill.</p>}
          </section>

          <section className="card">
            <h2>Bills and payments</h2>

            {bills.length === 0 ? (
              <p className="muted">No bills created yet.</p>
            ) : (
              bills.map((bill) => (
                <div key={bill.id} style={{ marginBottom: 24 }}>
                  <div className="member">
                    <strong>{bill.title}</strong>
                    <span className="bill-total">{formatMoney(bill.totalCents)}</span>
                  </div>

                  {bill.shares.map((share) => {
                    const member = members.find((item) => item.id === share.memberId)

                    return (
                      <div className="share" key={share.id}>
                        <div>
                          <strong>{member?.name ?? 'Member'}</strong>
                          <div className="muted">{formatMoney(share.amountCents)}</div>
                        </div>

                        {share.paidAt ? (
                          <span className="status-paid">Paid</span>
                        ) : (
                          <div>
                            <span className="status-unpaid">Unpaid </span>
                            <button
                              type="button"
                              disabled={payingShare !== null}
                              onClick={() => payShare(bill.id, share.id)}
                            >
                              {payingShare === share.id ? 'Paying...' : 'Pay'}
                            </button>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              ))
            )}
          </section>

          <section className="card">
            <h2>Outstanding balances</h2>

            <div className="summary">
              <div className="summary-box">
                <span>Total outstanding</span>
                <strong>{formatMoney(totalOutstanding)}</strong>
              </div>
              <div className="summary-box">
                <span>Total members</span>
                <strong>{members.length}</strong>
              </div>
            </div>

            {balances.length === 0 ? (
              <p className="muted">No outstanding balances.</p>
            ) : (
              balances.map((balance) => (
                <div className="balance" key={balance.memberId}>
                  <span>{balance.name}</span>
                  <strong>{formatMoney(balance.outstandingCents)}</strong>
                </div>
              ))
            )}
          </section>
        </>
      )}
    </main>
  )
}
