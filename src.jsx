import React, { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './style.css'

const roles = { admin: 'System administrator', user: 'Normal user', owner: 'Store owner' }

async function api(path, method = 'GET', body) {
  const response = await fetch('/api' + path, {
    method,
    ...(method === 'GET' ? {} : {
      headers: { 'Content-Type': body instanceof File ? body.type : 'application/json' },
      body: body instanceof File ? body : JSON.stringify(body ?? {})
    })
  })
  if (response.status === 204) return
  const data = await response.json()
  if (!response.ok) {
    const error = new Error(data.message)
    error.status = response.status
    throw error
  }
  return data
}

function useData(path, revision = 0) {
  const [result, setResult] = useState({ loading: true })
  useEffect(() => {
    let active = true
    setResult((previous) => ({ ...previous, loading: true, error: '' }))
    api(path).then(
      (data) => { if (active) setResult({ data, loading: false }) },
      (error) => { if (active) setResult({ error: error.message, loading: false }) }
    )
    return () => { active = false }
  }, [path, revision])
  return result
}

const name = { key: 'name', label: 'Name' }
function storePhotoUrl(store) {
  if (store.photo_version) return '/api/stores/' + store.id + '/photo?v=' + store.photo_version
  const demo = store.demo_photo
  return demo ? '/store-photos/' + demo + '.jpg' : null
}

const storeNameColumn = {
  ...name,
  render: (store) => {
    const photo = storePhotoUrl(store)
    return <div className="store-name">
      {photo && <img src={photo} alt="" width="80" height="56" loading="lazy" />}
      <span>{store.name}</span>
    </div>
  }
}
const email = { key: 'email', label: 'Email' }
const address = { key: 'address', label: 'Address' }
const role = { key: 'role', label: 'Role', render: (row) => roles[row.role] }
const ratingText = (score) => score == null ? 'Unrated' : Number(score).toFixed(2)
const rating = { key: 'rating', label: 'Overall rating', render: (row) => ratingText(row.rating) }

function Notice({ error, children }) {
  return error ? <p className="error" role="alert">{error}</p> :
    children ? <p role="status">{children}</p> : null
}

function PasswordField({ field = 'password', label = 'Password', creating = false }) {
  return <label>{label}
    <input name={field} type="password" required autoComplete={creating ? 'new-password' : 'current-password'}
      minLength={creating ? 8 : undefined} maxLength={creating ? 16 : undefined} />
    {creating && <small>8–16 characters, with an uppercase letter and a special character.</small>}
  </label>
}

function ProfileFields({ defaults }) {
  return <>
    <label>Name<input name="name" defaultValue={defaults?.name} required minLength={20} maxLength={60} /><small>20–60 characters.</small></label>
    <label>Email<input name="email" type="email" defaultValue={defaults?.email} required maxLength={254} /></label>
    <label>Address<textarea name="address" defaultValue={defaults?.address} rows={2} required maxLength={400} /></label>
  </>
}

function Form({ children, submitLabel, submit }) {
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  async function handleSubmit(event) {
    event.preventDefault()
    const form = event.currentTarget
    setError('')
    setBusy(true)
    try {
      await submit(Object.fromEntries(new FormData(form)))
      form.reset()
    } catch (failure) {
      setError(failure.message)
    } finally {
      setBusy(false)
    }
  }
  return <form onSubmit={handleSubmit}>
    {children}
    <Notice error={error} />
    <button disabled={busy}>{busy ? 'Please wait…' : submitLabel}</button>
  </form>
}

function Auth({ onLogin, initialMessage }) {
  const [signup, setSignup] = useState(false)
  const [message, setMessage] = useState(initialMessage)
  return <div className="auth-layout">
    <section className="panel auth">
    <h1>{signup ? 'Create your account' : 'Log in'}</h1>
    <Notice>{message}</Notice>
    <Form key={String(signup)} submitLabel={signup ? 'Create account' : 'Log in'} submit={async (values) => {
      if (!signup) return onLogin(await api('/login', 'POST', values))
      await api('/signup', 'POST', values)
      setMessage('Account created. Log in with your new email and password.')
      setSignup(false)
    }}>
      {signup ? <ProfileFields /> : <label>Email<input name="email" type="email" autoComplete="username" required /></label>}
      <PasswordField creating={signup} />
    </Form>
    <button className="secondary" onClick={() => { setSignup(!signup); setMessage('') }}>
      {signup ? 'Back to login' : 'Create an account'}
    </button>
    </section>
    <figure className="review-art">
      <div className="review-art-grid">
        <img src="/review-art/pinned-review.png" width="1080" height="1350" alt="Crafted by Nature’s cream review note on a dark green background" />
        <img src="/review-art/feedback-card.png" width="736" height="736" alt="Konker’s white review card on a light green background" />
        <img src="/review-art/testimonial-cards.png" width="1080" height="1350" alt="British Noble Press’s layered testimonial cards" />
      </div>
      <figcaption>Review design references</figcaption>
    </figure>
  </div>
}

function useListing(initialSort = { sort: 'name', dir: 'asc' }) {
  const [filters, setFilters] = useState({})
  const [sort, setSort] = useState(initialSort)
  return {
    query: new URLSearchParams({ ...filters, ...sort }),
    filters, setFilters, sort,
    onSort: (field) => setSort((current) => ({
      sort: field, dir: current.sort === field && current.dir === 'asc' ? 'desc' : 'asc'
    }))
  }
}

function Filters({ fields, listing }) {
  return <div className="filters" role="group" aria-label="Filter results">
    {fields.map(({ key, label }) => <label key={key}>{label}
      {key === 'role' ?
        <select value={listing.filters[key] ?? ''} onChange={(event) => listing.setFilters({ ...listing.filters, [key]: event.target.value })}>
          <option value="">All roles</option>
          {Object.entries(roles).map(([value, title]) => <option key={value} value={value}>{title}</option>)}
        </select> :
        <input type="search" value={listing.filters[key] ?? ''} placeholder={'Search by ' + label.toLowerCase()}
          onChange={(event) => listing.setFilters({ ...listing.filters, [key]: event.target.value })} />}
    </label>)}
  </div>
}

function Table({ columns, rows, listing }) {
  if (!rows.length) return <p>No results found.</p>
  return <div className="table-scroll"><table>
    <thead><tr>{columns.map((column) => {
      const active = listing.sort.sort === column.key
      const direction = listing.sort.dir === 'asc' ? 'ascending' : 'descending'
      return <th key={column.key} scope="col" aria-sort={active ? direction : undefined}>
        {column.action ? column.label : <button className="sort" onClick={() => listing.onSort(column.key)}>
          {column.label}{active && (direction === 'ascending' ? ' ↑' : ' ↓')}
        </button>}
      </th>
    })}</tr></thead>
    <tbody>{rows.map((row) => <tr key={row.id}>{columns.map((column) =>
      <td key={column.key}>{column.render ? column.render(row) : row[column.key]}</td>
    )}</tr>)}</tbody>
  </table></div>
}

function Results({ result, render }) {
  return <>
    <Notice error={result.error}>{result.loading ? 'Loading…' : null}</Notice>
    {result.data !== undefined && render(result.data)}
  </>
}

function AdminHome() {
  const result = useData('/admin/counts')
  return <section><h1>Admin dashboard</h1><Results result={result} render={(counts) =>
    <div className="stats">{Object.entries({ users: 'Users', stores: 'Stores', ratings: 'Submitted ratings' })
      .map(([key, label]) => <article className="panel" key={key}><h2>{label}</h2><strong>{counts[key]}</strong></article>)}
    </div>} /></section>
}

function UserDetails({ userId, close }) {
  const result = useData('/admin/users/' + userId)
  return <aside className="details" aria-label="User details">
    <div className="heading"><h2>User details</h2><button className="secondary" onClick={close}>Close</button></div>
    <Results result={result} render={(user) => <dl>
      <dt>Name</dt><dd>{user.name}</dd>
      <dt>Email</dt><dd>{user.email}</dd>
      <dt>Address</dt><dd>{user.address}</dd>
      <dt>Role</dt><dd>{roles[user.role]}</dd>
      {user.role === 'owner' && <>
        <dt>Store</dt><dd>{user.store_name ?? 'No store assigned'}</dd>
        <dt>Overall rating</dt><dd>{ratingText(user.rating)}</dd>
      </>}
    </dl>} />
  </aside>
}

function AdminListing({ users }) {
  const listing = useListing()
  const [revision, setRevision] = useState(0)
  const [selected, setSelected] = useState(null)
  const [message, setMessage] = useState('')
  const result = useData('/admin/' + (users ? 'users' : 'stores') + '?' + listing.query, revision)
  const [editing, setEditing] = useState(null)
  const [ownerId, setOwnerId] = useState('')
  const editHeading = useRef(null)
  useEffect(() => { if (editing) editHeading.current?.focus() }, [editing])
  const owners = useData('/admin/owners' + (editing ? '?storeId=' + editing.id : ''), revision)
  const fields = users ? [name, email, address, role] : [name, email, address]
  const columns = users ? [...fields, {
    key: 'detail', label: 'Details', action: true,
    render: (row) => <button className="secondary" onClick={() => setSelected(row.id)} aria-label={'View ' + row.name}>View</button>
  }] : [storeNameColumn, email, address, rating, {
    key: 'edit', label: 'Actions', action: true,
    render: (store) => <button className="secondary" aria-label={'Edit ' + store.name} onClick={() => {
      setEditing(store)
      setOwnerId(store.owner_id ?? '')
      setMessage('')
    }}>Edit</button>
  }]
  return <section>
    <h1>{users ? 'Users' : 'Stores'}</h1>
    <div className="layout">
      <div className="panel">
        <Filters fields={fields} listing={listing} />
        <Results result={result} render={(rows) => <Table columns={columns} rows={rows} listing={listing} />} />
        {selected && <UserDetails key={selected} userId={selected} close={() => setSelected(null)} />}
      </div>
      <aside className="panel">
        <div className="heading">
          <h2 ref={editHeading} tabIndex={-1}>{users ? 'Add user' : editing ? 'Edit store' : 'Add store'}</h2>
          {editing && <button className="secondary" onClick={() => { setEditing(null); setOwnerId('') }}>Cancel</button>}
        </div>
        <Notice>{message}</Notice>
        <Form key={editing?.id ?? 'new'} submitLabel={users ? 'Create user' : editing ? 'Save changes' : 'Create store'} submit={async (values) => {
          setMessage('')
          const path = users ? '/admin/users' : editing ? '/admin/stores/' + editing.id : '/admin/stores'
          await api(path, editing ? 'PUT' : 'POST', values)
          setMessage(users ? 'User created.' : editing ? 'Store updated.' : 'Store created.')
          setEditing(null)
          setOwnerId('')
          setRevision((current) => current + 1)
        }}>
          <ProfileFields defaults={editing} />
          {users ? <>
            <PasswordField creating />
            <label>Role<select name="role" defaultValue="user">
              {Object.entries(roles).map(([value, title]) => <option key={value} value={value}>{title}</option>)}
            </select></label>
          </> : <label>Store owner<select name="ownerId" value={ownerId} onChange={(event) => setOwnerId(event.target.value)}>
            <option value="">No owner assigned</option>
            {editing?.owner_id && !owners.data?.some((owner) => owner.id === editing.owner_id) &&
              <option value={editing.owner_id}>Current owner</option>}
            {(owners.data ?? []).map((owner) => <option key={owner.id} value={owner.id}>{owner.name} ({owner.email})</option>)}
          </select><Notice error={owners.error} /></label>}
        </Form>
      </aside>
    </div>
  </section>
}

const scores = [1, 2, 3, 4, 5]

function Stars({ score }) {
  return <span className="rating-stars" role="img" aria-label={score + ' out of 5 stars'}>
    <span aria-hidden="true">{'★'.repeat(score)}<span className="empty-stars">{'☆'.repeat(5 - score)}</span></span>
  </span>
}

function RatingForm({ store, onSaved }) {
  const [selected, setSelected] = useState(store.my_rating ?? 0)
  return <Form submitLabel={store.my_rating == null ? 'Submit rating' : 'Update rating'} submit={async ({ score, review }) => {
    await api('/stores/' + store.id + '/rating', 'PUT', { score: Number(score), review })
    onSaved(store.name)
  }}>
    <fieldset className="star-picker">
      <legend>Rate {store.name}</legend>
      <div className="star-options">
        {scores.map((score) => <label key={score} className={score <= selected ? 'star-option selected' : 'star-option'}>
          <input name="score" type="radio" value={score} required checked={score === selected}
            onChange={() => setSelected(score)} aria-label={score === 1 ? '1 star' : score + ' stars'} />
          <span aria-hidden="true">{score <= selected ? '★' : '☆'}</span>
        </label>)}
      </div>
    </fieldset>
    <label><span>Review <span className="optional">(optional)</span></span>
      <textarea name="review" rows={2} maxLength={1000} defaultValue={store.my_review ?? ''} />
    </label>
  </Form>
}

function Shopper() {
  const listing = useListing()
  const [revision, setRevision] = useState(0)
  const [message, setMessage] = useState('')
  const result = useData('/stores?' + listing.query, revision)
  const columns = [storeNameColumn, address, rating, {
    key: 'my_rating', label: 'Your rating', render: (row) => row.my_rating == null ? 'Unrated' : <Stars score={row.my_rating} />
  }, {
    key: 'action', label: 'Rate store', action: true,
    render: (store) => <RatingForm key={JSON.stringify([store.my_rating, store.my_review])} store={store} onSaved={(storeName) => {
      setMessage('Rating saved for ' + storeName + '.')
      setRevision((current) => current + 1)
    }} />
  }]
  return <section><h1>Browse stores</h1><div className="panel">
    <Filters fields={[name, address]} listing={listing} />
    <Notice>{message}</Notice>
    <Results result={result} render={(rows) => <Table columns={columns} rows={rows} listing={listing} />} />
  </div></section>
}

const activityDate = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' })
const dateLabel = (value) => value ? activityDate.format(new Date(value)) : 'Date unavailable'

function OwnerFeedback({ store, ratings, listing }) {
  const totals = scores.map((score) => ratings.filter((entry) => entry.score === score).length)
  const written = ratings.filter((entry) => entry.review).length
  const latest = ratings.filter((entry) => entry.updated_at)
    .sort((first, second) => new Date(second.updated_at) - new Date(first.updated_at)).slice(0, 5)
  const stats = [
    ['Average rating', ratingText(store.rating), 'Out of 5 stars'],
    ['Customers rated', ratings.length, 'One rating per customer'],
    ['Written reviews', written, 'Ratings with a review'],
    ['5-star ratings', totals[4], 'Customers who gave 5 stars']
  ]
  return <>
    <div className="stats owner-stats">{stats.map(([label, value, detail]) => (
      <article className="panel" key={label}><h2>{label}</h2><strong>{value}</strong><p>{detail}</p></article>
    ))}</div>
    <div className="feedback-grid">
      <section className="panel"><h2>Rating breakdown</h2>
        <ol className="breakdown">
          {[...scores].reverse().map((score) => <li key={score}>
            <span>{score} <span aria-hidden="true">★</span><span className="visually-hidden"> stars</span></span>
            <div className="bar-track" aria-hidden="true">
              <div style={{ width: (ratings.length ? totals[score - 1] / ratings.length * 100 : 0) + '%' }} />
            </div>
            <strong>{totals[score - 1]}</strong>
          </li>)}
        </ol>
      </section>
      <section className="panel"><h2>Recent customer activity</h2>
        {!latest.length ? <p>No dated activity yet.</p> : <ul className="activity">
          {latest.map((entry) => <li key={entry.id}>
            <div className="activity-heading">
              <div><strong>{entry.name}</strong><time dateTime={entry.updated_at}>{dateLabel(entry.updated_at)}</time></div>
              <Stars score={entry.score} />
            </div>
            {entry.review && <blockquote>{entry.review}</blockquote>}
          </li>)}
        </ul>}
      </section>
    </div>
    <section className="panel"><h2>Customer ratings and reviews</h2>
      {ratings.length ? <Table rows={ratings} listing={listing} columns={[
        name, email, { key: 'score', label: 'Rating', render: (row) => <Stars score={row.score} /> },
        { key: 'review', label: 'Review', action: true, render: (row) => <span className="review-text">{row.review || '—'}</span> },
        { key: 'updated_at', label: 'Last updated', render: (row) => dateLabel(row.updated_at) }
      ]} /> : <p>This store has no ratings yet.</p>}
    </section>
  </>
}

function Owner() {
  const listing = useListing({ sort: 'updated_at', dir: 'desc' })
  const [revision, setRevision] = useState(0)
  const [message, setMessage] = useState('')
  const result = useData('/owner/store?' + listing.query, revision)
  return <section className="owner-dashboard"><h1>Store dashboard</h1>
    <Results result={result} render={({ store, ratings }) => store ? <>
      <h2 className="owner-store-name">{store.name}</h2>
      <OwnerFeedback store={store} ratings={ratings} listing={listing} />
      <section className="panel owner-photo">
        <h2>Store photo</h2>
        {storePhotoUrl(store) && <img src={storePhotoUrl(store)} alt={'Store photo for ' + store.name} />}
        <Notice>{message}</Notice>
        <Form submitLabel={storePhotoUrl(store) ? 'Replace photo' : 'Upload photo'} submit={async ({ photo }) => {
          setMessage('')
          if (photo.size > 5 * 1024 * 1024) throw new Error('Choose an image no larger than 5 MB.')
          await api('/owner/store/photo', 'PUT', photo)
          setMessage('Store photo updated.')
          setRevision((current) => current + 1)
        }}>
          <label>Choose an image
            <input type="file" name="photo" accept="image/jpeg,image/png,image/webp" required />
            <small>JPEG, PNG, or WebP. Up to 5 MB.</small>
          </label>
        </Form>
      </section>
    </> : <div className="panel"><p>No store has been assigned to your account.</p></div>} />
  </section>
}

function App() {
  const [user, setUser] = useState(undefined)
  const [page, setPage] = useState('home')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  useEffect(() => {
    api('/me').then(setUser, (failure) => {
      if (failure.status !== 401) setError(failure.message)
      setUser(null)
    })
  }, [])
  function signedOut(message = '') {
    setMessage(message)
    setError('')
    setPage('home')
    setUser(null)
  }
  return <>
    <header><div className="shell header-inner">
      <strong>Store Ratings</strong>
      {user && <div className="account"><span>{user.name}</span><button className="secondary" onClick={async () => {
        try { await api('/logout', 'POST'); signedOut() } catch (failure) { setError(failure.message) }
      }}>Log out</button></div>}
    </div></header>
    <main className="shell">
      <Notice error={error} />
      {user === undefined ? <p role="status">Loading…</p> : !user ? <Auth onLogin={setUser} initialMessage={message} /> : <>
        <nav aria-label="Account navigation">
          <button aria-current={page === 'home' ? 'page' : undefined} onClick={() => setPage('home')}>
            {user.role === 'user' ? 'Stores' : 'Dashboard'}</button>
          {user.role === 'admin' && ['users', 'stores'].map((item) =>
            <button key={item} aria-current={page === item ? 'page' : undefined} onClick={() => setPage(item)}>
              {item === 'users' ? 'Users' : 'Stores'}</button>)}
          <button aria-current={page === 'password' ? 'page' : undefined} onClick={() => setPage('password')}>Change password</button>
        </nav>
        {page === 'password' ? <section className="panel narrow"><h1>Change password</h1>
          <Form submitLabel="Update password" submit={async (values) => {
            await api('/password', 'PUT', values)
            signedOut('Password updated. Log in with your new password.')
          }}>
            <PasswordField field="currentPassword" label="Current password" />
            <PasswordField field="newPassword" label="New password" creating />
          </Form>
        </section> : user.role === 'admin' ? (
          page === 'home' ? <AdminHome /> : <AdminListing key={page} users={page === 'users'} />
        ) : user.role === 'owner' ? <Owner /> : <Shopper />}
      </>}
    </main>
  </>
}

createRoot(document.getElementById('root')).render(<App />)
